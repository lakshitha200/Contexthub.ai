// Stub the real PrismaService module: its generated Prisma client imports
// transitive `.js` paths that Jest's resolver can't follow. We inject a mock
// via `useValue` anyway, so the real class is never instantiated.
jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleProfile } from '../strategies/google.strategy';
import { AuthService } from './auth.service';
import { MailService } from './mail.service';
import { TokenService } from './token.service';

type MockPrisma = {
  user: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  verificationToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  oAuthAccount: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
};

const buildUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice',
  avatarUrl: null,
  emailVerified: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  passwordHash: null as string | null,
  ...overrides,
});

const FAKE_TOKENS = { accessToken: 'access.jwt', refreshToken: 'refresh.jwt' };

describe('AuthService', () => {
  let service: AuthService;
  let prisma: MockPrisma;
  let tokens: { issueTokens: jest.Mock; revoke: jest.Mock; revokeAllForUser: jest.Mock; generateOpaqueToken: jest.Mock; hash: jest.Mock };
  let mail: { sendMagicLink: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      verificationToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      oAuthAccount: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };
    tokens = {
      issueTokens: jest.fn().mockResolvedValue(FAKE_TOKENS),
      revoke: jest.fn().mockResolvedValue(undefined),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
      generateOpaqueToken: jest.fn().mockReturnValue('raw-magic-token'),
      hash: jest.fn((v: string) => `hash:${v}`),
    };
    mail = { sendMagicLink: jest.fn().mockResolvedValue(undefined) };

    const config = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'BCRYPT_ROUNDS') return '4';
        if (key === 'MAGIC_LINK_TTL_MIN') return '15';
        return defaultValue;
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: TokenService, useValue: tokens },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  // ---------------------------------------------------------------- register
  describe('register', () => {
    const dto = { email: 'new@example.com', password: 'Pass1234', name: 'New' };

    it('creates a new user and returns tokens on success', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(buildUser({ email: dto.email, name: dto.name }));

      const result = await service.register(dto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: dto.email } });
      expect(prisma.user.create).toHaveBeenCalled();
      expect(result.tokens).toEqual(FAKE_TOKENS);
      expect(result.user.email).toBe(dto.email);
    });

    it('stores a hashed password — never the raw value', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(buildUser());

      await service.register(dto);

      const createArgs = prisma.user.create.mock.calls[0][0];
      const storedHash: string = createArgs.data.passwordHash;
      expect(storedHash).toBeDefined();
      expect(storedHash).not.toBe(dto.password);
      // The stored hash must validate against the raw password
      await expect(bcrypt.compare(dto.password, storedHash)).resolves.toBe(true);
    });

    it('throws ConflictException when email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ email: dto.email }));

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('does not leak the password hash in the response', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(buildUser());

      const result = await service.register(dto);

      expect(result.user).not.toHaveProperty('passwordHash');
    });
  });

  // ------------------------------------------------------------------- login
  describe('login', () => {
    const dto = { email: 'alice@example.com', password: 'Pass1234' };

    it('returns tokens when credentials are correct', async () => {
      const passwordHash = await bcrypt.hash(dto.password, 4);
      prisma.user.findUnique.mockResolvedValue(buildUser({ passwordHash }));

      const result = await service.login(dto);

      expect(result.tokens).toEqual(FAKE_TOKENS);
      expect(tokens.issueTokens).toHaveBeenCalledWith('user-1', dto.email, undefined);
    });

    it('throws UnauthorizedException when email does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when password is wrong', async () => {
      const passwordHash = await bcrypt.hash('different-pass', 4);
      prisma.user.findUnique.mockResolvedValue(buildUser({ passwordHash }));

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for OAuth-only users (no passwordHash)', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ passwordHash: null }));

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ------------------------------------------------------------------ logout
  describe('logout', () => {
    it('revokes the refresh token', async () => {
      const result = await service.logout('refresh.jwt');

      expect(tokens.revoke).toHaveBeenCalledWith('refresh.jwt');
      expect(result).toEqual({ success: true });
    });
  });

  // ---------------------------------------------------------------------- me
  describe('me', () => {
    it('returns the user DTO without password hash', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(
        buildUser({ passwordHash: 'super-secret-hash' }),
      );

      const result = await service.me('user-1');

      expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'user-1' } });
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.id).toBe('user-1');
    });
  });

  // ------------------------------------------------------------- updateProfile
  describe('updateProfile', () => {
    it('updates name and avatarUrl', async () => {
      prisma.user.update.mockResolvedValue(
        buildUser({ name: 'Alice B', avatarUrl: 'https://a.b/avatar.png' }),
      );

      const result = await service.updateProfile('user-1', {
        name: 'Alice B',
        avatarUrl: 'https://a.b/avatar.png',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { name: 'Alice B', avatarUrl: 'https://a.b/avatar.png' },
      });
      expect(result.name).toBe('Alice B');
    });
  });

  // ------------------------------------------------------------ changePassword
  describe('changePassword', () => {
    const dto = { currentPassword: 'OldPass1', newPassword: 'NewPass2' };

    it('updates the password and revokes all sessions on success', async () => {
      const passwordHash = await bcrypt.hash(dto.currentPassword, 4);
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ passwordHash }));
      prisma.user.update.mockResolvedValue(buildUser());

      const result = await service.changePassword('user-1', dto);

      expect(prisma.user.update).toHaveBeenCalled();
      const newHash: string = prisma.user.update.mock.calls[0][0].data.passwordHash;
      await expect(bcrypt.compare(dto.newPassword, newHash)).resolves.toBe(true);
      expect(tokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ success: true });
    });

    it('throws UnauthorizedException when current password is wrong', async () => {
      const passwordHash = await bcrypt.hash('something-else', 4);
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ passwordHash }));

      await expect(service.changePassword('user-1', dto)).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(tokens.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for accounts with no password set', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ passwordHash: null }));

      await expect(service.changePassword('user-1', dto)).rejects.toThrow(BadRequestException);
    });
  });

  // --------------------------------------------------------- requestMagicLink
  describe('requestMagicLink', () => {
    const dto = { email: 'mail@example.com' };

    it('creates a verification token and sends the email for an existing user', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ email: dto.email }));
      prisma.verificationToken.create.mockResolvedValue({});

      const result = await service.requestMagicLink(dto);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.verificationToken.create).toHaveBeenCalled();
      expect(mail.sendMagicLink).toHaveBeenCalledWith(dto.email, 'raw-magic-token');
      expect(result).toEqual({ success: true });
    });

    it('auto-creates a user when the email is unknown', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(buildUser({ email: dto.email }));
      prisma.verificationToken.create.mockResolvedValue({});

      await service.requestMagicLink(dto);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { email: dto.email, name: null },
      });
      expect(mail.sendMagicLink).toHaveBeenCalled();
    });

    it('stores the hashed token, never the raw token', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ email: dto.email }));
      prisma.verificationToken.create.mockResolvedValue({});

      await service.requestMagicLink(dto);

      const createArgs = prisma.verificationToken.create.mock.calls[0][0];
      expect(createArgs.data.tokenHash).toBe('hash:raw-magic-token');
      expect(createArgs.data.tokenHash).not.toBe('raw-magic-token');
      expect(createArgs.data.type).toBe('MAGIC_LINK');
    });

    it('sends the raw token in the email (not the hash)', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ email: dto.email }));
      prisma.verificationToken.create.mockResolvedValue({});

      await service.requestMagicLink(dto);

      const [, sentToken] = mail.sendMagicLink.mock.calls[0];
      expect(sentToken).toBe('raw-magic-token');
    });
  });

  // ---------------------------------------------------------- verifyMagicLink
  describe('verifyMagicLink', () => {
    const future = () => new Date(Date.now() + 60_000);
    const past = () => new Date(Date.now() - 60_000);

    const validRecord = () => ({
      id: 'tok-1',
      userId: 'user-1',
      type: 'MAGIC_LINK',
      consumedAt: null,
      expiresAt: future(),
    });

    it('logs the user in, consumes the token, and sets emailVerified', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue(validRecord());
      prisma.verificationToken.update.mockResolvedValue({});
      prisma.user.update.mockResolvedValue(buildUser({ emailVerified: new Date() }));

      const result = await service.verifyMagicLink('raw-magic-token');

      expect(prisma.verificationToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: 'hash:raw-magic-token' },
      });
      expect(prisma.verificationToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tok-1' } }),
      );
      const userUpdateArgs = prisma.user.update.mock.calls[0][0];
      expect(userUpdateArgs.data.emailVerified).toBeInstanceOf(Date);
      expect(result.tokens).toEqual(FAKE_TOKENS);
    });

    it('throws when the token does not exist', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue(null);

      await expect(service.verifyMagicLink('bad')).rejects.toThrow(UnauthorizedException);
    });

    it('throws when the token has expired', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue({
        ...validRecord(),
        expiresAt: past(),
      });

      await expect(service.verifyMagicLink('raw-magic-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.verificationToken.update).not.toHaveBeenCalled();
    });

    it('throws when the token has already been consumed', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue({
        ...validRecord(),
        consumedAt: new Date(),
      });

      await expect(service.verifyMagicLink('raw-magic-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws when the token is of the wrong type', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue({
        ...validRecord(),
        type: 'PASSWORD_RESET',
      });

      await expect(service.verifyMagicLink('raw-magic-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ------------------------------------------------------- loginOrCreateOAuth
  describe('loginOrCreateOAuth', () => {
    const profile: GoogleProfile = {
      providerAccountId: 'google-123',
      email: 'oauth@example.com',
      name: 'OAuth User',
      avatarUrl: 'https://g/p.png',
      accessToken: 'g-access',
      refreshToken: 'g-refresh',
    };

    it('logs in an existing OAuth account without creating new records', async () => {
      prisma.oAuthAccount.findUnique.mockResolvedValue({
        user: buildUser({ id: 'user-1', email: profile.email }),
      });

      const result = await service.loginOrCreateOAuth(profile, 'google');

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.oAuthAccount.create).not.toHaveBeenCalled();
      expect(result.tokens).toEqual(FAKE_TOKENS);
      expect(result.user.email).toBe(profile.email);
    });

    it('links a new Google account to an existing email-based user', async () => {
      prisma.oAuthAccount.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(buildUser({ id: 'user-2', email: profile.email }));
      prisma.oAuthAccount.create.mockResolvedValue({});

      const result = await service.loginOrCreateOAuth(profile, 'google');

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.oAuthAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-2',
            provider: 'google',
            providerAccountId: profile.providerAccountId,
          }),
        }),
      );
      expect(result.user.id).toBe('user-2');
    });

    it('creates a brand-new user when neither account nor email exist', async () => {
      prisma.oAuthAccount.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(
        buildUser({ id: 'user-3', email: profile.email, emailVerified: new Date() }),
      );
      prisma.oAuthAccount.create.mockResolvedValue({});

      const result = await service.loginOrCreateOAuth(profile, 'google');

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: profile.email,
            emailVerified: expect.any(Date),
          }),
        }),
      );
      expect(prisma.oAuthAccount.create).toHaveBeenCalled();
      expect(result.user.id).toBe('user-3');
    });
  });
});
