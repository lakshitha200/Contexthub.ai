// ─────────────────────────────────────────────────────────────────────────────
// AuthService — UNIT TESTS
//
// Every public method is tested across 3 buckets:
//
//   [HAPPY]    → it works when input is valid
//   [SAD]      → it fails with the right exception when something is wrong
//   [SECURITY] → it protects secrets and handles edge cases safely
//
// A small `check()` helper prints a readable line for each verified behavior,
// so when you run:
//     npx jest src/auth/services/auth.service.spec.ts --verbose
// you can read down the list and understand exactly what was guaranteed.
// ─────────────────────────────────────────────────────────────────────────────

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

// ─── helpers ────────────────────────────────────────────────────────────────

const check = (label: string) => console.log(`        ✓ ${label}`);

// defining a fake database object for testing.
// jest.Mock = This is a fake function created by Jest for testing (findUnique: jest.fn(),). So in test-> findUnique.mockResolvedValue(user); // When this fake function is called, return user

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

// ─── suite ──────────────────────────────────────────────────────────────────
// Starts a group of tests for AuthService.
describe('AuthService (unit)', () => {
  let service: AuthService;
  let prisma: MockPrisma;
  let tokens: {
    issueTokens: jest.Mock;
    revoke: jest.Mock;
    revokeAllForUser: jest.Mock;
    generateOpaqueToken: jest.Mock;
    hash: jest.Mock;
  };
  let mail: { sendMagicLink: jest.Mock };

  // Runs this setup before every test.
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

  // ════════════════════════════════════════════════════════════════════ register
  describe('register()', () => {
    const dto = { email: 'new', password: 'Pass1234', name: 'New' };

    describe('[HAPPY] valid input', () => {
      it('creates a new user and returns tokens', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.user.create.mockResolvedValue(buildUser({ email: dto.email, name: dto.name }));

        const result = await service.register(dto);

        expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: dto.email } });
        check('looked up existing email before creating');
        expect(prisma.user.create).toHaveBeenCalled();
        check('called prisma.user.create');
        expect(result.tokens).toEqual(FAKE_TOKENS);
        check('returned access + refresh tokens');
        expect(result.user.email).toBe(dto.email);
        check('returned user with submitted email');
      });
    });

    describe('[SAD] invalid input', () => {
      it('throws ConflictException when email is already registered', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser({ email: dto.email }));

        await expect(service.register(dto)).rejects.toThrow(ConflictException);
        check('threw ConflictException for duplicate email');
        expect(prisma.user.create).not.toHaveBeenCalled();
        check('did NOT create a user on conflict');
      });
    });

    describe('[SECURITY] password & response hygiene', () => {
      it('stores a hashed password — never the raw value', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.user.create.mockResolvedValue(buildUser());

        await service.register(dto);

        const createArgs = prisma.user.create.mock.calls[0][0];
        const storedHash: string = createArgs.data.passwordHash;
        expect(storedHash).toBeDefined();
        check('passwordHash was set on the create payload');
        expect(storedHash).not.toBe(dto.password);
        check('stored value is NOT the raw password');
        await expect(bcrypt.compare(dto.password, storedHash)).resolves.toBe(true);
        check('stored hash verifies against the raw password (bcrypt)');
      });

      it('does not leak the password hash in the response', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.user.create.mockResolvedValue(buildUser());

        const result = await service.register(dto);

        expect(result.user).not.toHaveProperty('passwordHash');
        check('response user object has no `passwordHash` field');
      });
    });
  });
 
  // ═══════════════════════════════════════════════════════════════════════ login
  describe('login()', () => {
    const dto = { email: 'alice@example.com', password: 'Pass1234' };

    describe('[HAPPY] correct credentials', () => {
      it('returns tokens', async () => {
        const passwordHash = await bcrypt.hash(dto.password, 4);
        prisma.user.findUnique.mockResolvedValue(buildUser({ passwordHash }));

        const result = await service.login(dto);

        expect(result.tokens).toEqual(FAKE_TOKENS);
        check('returned tokens for valid email + password');
        expect(tokens.issueTokens).toHaveBeenCalledWith('user-1', dto.email, undefined);
        check('called TokenService.issueTokens with user id + email');
      });
    });

    describe('[SAD] wrong credentials', () => {
      it('throws UnauthorizedException when email does not exist', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
        check('threw Unauthorized for unknown email');
      });

      it('throws UnauthorizedException when password is wrong', async () => {
        const passwordHash = await bcrypt.hash('different-pass', 4);
        prisma.user.findUnique.mockResolvedValue(buildUser({ passwordHash }));

        await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
        check('threw Unauthorized for wrong password');
      });
    });

    describe('[SECURITY] account-type edge cases', () => {
      it('throws UnauthorizedException for OAuth-only users (no passwordHash)', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser({ passwordHash: null }));

        await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
        check('blocked password-login on OAuth-only account');
      });
    });
  });

 
  // ══════════════════════════════════════════════════════════════════════ logout
  describe('logout()', () => {
    describe('[HAPPY] valid refresh token', () => {
      it('revokes the refresh token', async () => {
        const result = await service.logout('refresh.jwt');

        expect(tokens.revoke).toHaveBeenCalledWith('refresh.jwt');
        check('called TokenService.revoke with the provided refresh token');
        expect(result).toEqual({ success: true });
        check('returned { success: true }');
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════ me
  describe('me()', () => {
    describe('[HAPPY] existing user', () => {
      it('returns the user DTO', async () => {
        prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser());

        const result = await service.me('user-1');

        expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'user-1' } });
        check('queried user by id');
        expect(result.id).toBe('user-1');
        check('returned user id');
      });
    });

    describe('[SECURITY] response hygiene', () => {
      it('does not return passwordHash', async () => {
        prisma.user.findUniqueOrThrow.mockResolvedValue(
          buildUser({ passwordHash: 'super-secret-hash' }),
        );

        const result = await service.me('user-1');

        expect(result).not.toHaveProperty('passwordHash');
        check('passwordHash stripped from response');
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════ updateProfile
  describe('updateProfile()', () => {
    describe('[HAPPY] valid update', () => {
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
        check('called prisma.user.update with the right id + fields');
        expect(result.name).toBe('Alice B');
        check('returned updated name');
      });
    });
  });

  // ═════════════════════════════════════════════════════════════════ changePassword
  describe('changePassword()', () => {
    const dto = { currentPassword: 'OldPass1', newPassword: 'NewPass2' };

    describe('[HAPPY] correct current password', () => {
      it('updates the password and revokes all sessions', async () => {
        const passwordHash = await bcrypt.hash(dto.currentPassword, 4);
        prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ passwordHash }));
        prisma.user.update.mockResolvedValue(buildUser());

        const result = await service.changePassword('user-1', dto);

        expect(prisma.user.update).toHaveBeenCalled();
        check('called prisma.user.update with new hash');
        const newHash: string = prisma.user.update.mock.calls[0][0].data.passwordHash;
        await expect(bcrypt.compare(dto.newPassword, newHash)).resolves.toBe(true);
        check('new hash verifies against new password');
        expect(tokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
        check('revoked ALL existing refresh tokens (forces re-login on other devices)');
        expect(result).toEqual({ success: true });
        check('returned { success: true }');
      });
    });

    describe('[SAD] wrong current password', () => {
      it('throws UnauthorizedException and changes nothing', async () => {
        const passwordHash = await bcrypt.hash('something-else', 4);
        prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ passwordHash }));

        await expect(service.changePassword('user-1', dto)).rejects.toThrow(UnauthorizedException);
        check('threw Unauthorized for wrong current password');
        expect(prisma.user.update).not.toHaveBeenCalled();
        check('did NOT update the password row');
        expect(tokens.revokeAllForUser).not.toHaveBeenCalled();
        check('did NOT revoke refresh tokens');
      });
    });

    describe('[SECURITY] OAuth-only accounts', () => {
      it('throws BadRequestException when the account has no password set', async () => {
        prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ passwordHash: null }));

        await expect(service.changePassword('user-1', dto)).rejects.toThrow(BadRequestException);
        check('blocked password-change on OAuth-only account with BadRequest');
      });
    });
  });

  // ══════════════════════════════════════════════════════════════ requestMagicLink
  describe('requestMagicLink()', () => {
    const dto = { email: 'mail@example.com' };

    describe('[HAPPY] existing user', () => {
      it('creates a verification token and sends the email', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser({ email: dto.email }));
        prisma.verificationToken.create.mockResolvedValue({});

        const result = await service.requestMagicLink(dto);

        expect(prisma.user.create).not.toHaveBeenCalled();
        check('did NOT auto-create a new user (existing one used)');
        expect(prisma.verificationToken.create).toHaveBeenCalled();
        check('created a verification token row');
        expect(mail.sendMagicLink).toHaveBeenCalledWith(dto.email, 'raw-magic-token');
        check('sent magic link email with raw token');
        expect(result).toEqual({ success: true });
        check('returned { success: true }');
      });
    });

    describe('[HAPPY] unknown email', () => {
      it('auto-creates a user', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.user.create.mockResolvedValue(buildUser({ email: dto.email }));
        prisma.verificationToken.create.mockResolvedValue({});

        await service.requestMagicLink(dto);

        expect(prisma.user.create).toHaveBeenCalledWith({
          data: { email: dto.email, name: null },
        });
        check('created a new user for the unknown email');
        expect(mail.sendMagicLink).toHaveBeenCalled();
        check('sent magic link to new user');
      });
    });

    describe('[SECURITY] token storage', () => {
      it('stores the HASHED token, never the raw token', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser({ email: dto.email }));
        prisma.verificationToken.create.mockResolvedValue({});

        await service.requestMagicLink(dto);

        const createArgs = prisma.verificationToken.create.mock.calls[0][0];
        expect(createArgs.data.tokenHash).toBe('hash:raw-magic-token');
        check('stored token in hashed form');
        expect(createArgs.data.tokenHash).not.toBe('raw-magic-token');
        check('raw token is NOT stored in the DB');
        expect(createArgs.data.type).toBe('MAGIC_LINK');
        check('token row tagged with type=MAGIC_LINK');
      });

      it('sends the RAW token in the email (the hash would be useless to the user)', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser({ email: dto.email }));
        prisma.verificationToken.create.mockResolvedValue({});

        await service.requestMagicLink(dto);

        const [, sentToken] = mail.sendMagicLink.mock.calls[0];
        expect(sentToken).toBe('raw-magic-token');
        check('email contains the raw (clickable) token');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════ verifyMagicLink
  describe('verifyMagicLink()', () => {
    const future = () => new Date(Date.now() + 60_000);
    const past = () => new Date(Date.now() - 60_000);

    const validRecord = () => ({
      id: 'tok-1',
      userId: 'user-1',
      type: 'MAGIC_LINK',
      consumedAt: null,
      expiresAt: future(),
    });

    describe('[HAPPY] valid unused token', () => {
      it('logs the user in, consumes the token, and sets emailVerified', async () => {
        prisma.verificationToken.findUnique.mockResolvedValue(validRecord());
        prisma.verificationToken.update.mockResolvedValue({});
        prisma.user.update.mockResolvedValue(buildUser({ emailVerified: new Date() }));

        const result = await service.verifyMagicLink('raw-magic-token');

        expect(prisma.verificationToken.findUnique).toHaveBeenCalledWith({
          where: { tokenHash: 'hash:raw-magic-token' },
        });
        check('looked up token by its HASH (not raw value)');
        expect(prisma.verificationToken.update).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'tok-1' } }),
        );
        check('marked token as consumed');
        const userUpdateArgs = prisma.user.update.mock.calls[0][0];
        expect(userUpdateArgs.data.emailVerified).toBeInstanceOf(Date);
        check('set user.emailVerified timestamp');
        expect(result.tokens).toEqual(FAKE_TOKENS);
        check('returned fresh access + refresh tokens');
      });
    });

    describe('[SAD] invalid token', () => {
      it('throws when the token does not exist', async () => {
        prisma.verificationToken.findUnique.mockResolvedValue(null);

        await expect(service.verifyMagicLink('bad')).rejects.toThrow(UnauthorizedException);
        check('threw Unauthorized for unknown token');
      });
    });

    describe('[SECURITY] token lifecycle', () => {
      it('rejects expired tokens (and does not consume them)', async () => {
        prisma.verificationToken.findUnique.mockResolvedValue({
          ...validRecord(),
          expiresAt: past(),
        });

        await expect(service.verifyMagicLink('raw-magic-token')).rejects.toThrow(
          UnauthorizedException,
        );
        check('threw Unauthorized for expired token');
        expect(prisma.verificationToken.update).not.toHaveBeenCalled();
        check('did NOT mark expired token as consumed');
      });

      it('rejects already-consumed tokens (no replay)', async () => {
        prisma.verificationToken.findUnique.mockResolvedValue({
          ...validRecord(),
          consumedAt: new Date(),
        });

        await expect(service.verifyMagicLink('raw-magic-token')).rejects.toThrow(
          UnauthorizedException,
        );
        check('blocked replay attack on already-used token');
      });

      it('rejects tokens of the wrong type (e.g. PASSWORD_RESET used as MAGIC_LINK)', async () => {
        prisma.verificationToken.findUnique.mockResolvedValue({
          ...validRecord(),
          type: 'PASSWORD_RESET',
        });

        await expect(service.verifyMagicLink('raw-magic-token')).rejects.toThrow(
          UnauthorizedException,
        );
        check('rejected token with mismatched type');
      });
    });
  });

  // ══════════════════════════════════════════════════════════════ loginOrCreateOAuth
  describe('loginOrCreateOAuth()', () => {
    const profile: GoogleProfile = {
      providerAccountId: 'google-123',
      email: 'oauth@example.com',
      name: 'OAuth User',
      avatarUrl: 'https://g/p.png',
      accessToken: 'g-access',
      refreshToken: 'g-refresh',
    };

    describe('[HAPPY] existing OAuth account', () => {
      it('logs in without creating new records', async () => {
        prisma.oAuthAccount.findUnique.mockResolvedValue({
          user: buildUser({ id: 'user-1', email: profile.email }),
        });

        const result = await service.loginOrCreateOAuth(profile, 'google');

        expect(prisma.user.findUnique).not.toHaveBeenCalled();
        check('did NOT search users by email (account already linked)');
        expect(prisma.user.create).not.toHaveBeenCalled();
        check('did NOT create a new user');
        expect(prisma.oAuthAccount.create).not.toHaveBeenCalled();
        check('did NOT create a new oAuthAccount row');
        expect(result.tokens).toEqual(FAKE_TOKENS);
        check('returned tokens');
        expect(result.user.email).toBe(profile.email);
        check('returned the linked user');
      });
    });

    describe('[HAPPY] existing email, new Google link', () => {
      it('links a new Google account to an existing email-based user', async () => {
        prisma.oAuthAccount.findUnique.mockResolvedValue(null);
        prisma.user.findUnique.mockResolvedValue(buildUser({ id: 'user-2', email: profile.email }));
        prisma.oAuthAccount.create.mockResolvedValue({});

        const result = await service.loginOrCreateOAuth(profile, 'google');

        expect(prisma.user.create).not.toHaveBeenCalled();
        check('did NOT create a duplicate user (email already exists)');
        expect(prisma.oAuthAccount.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              userId: 'user-2',
              provider: 'google',
              providerAccountId: profile.providerAccountId,
            }),
          }),
        );
        check('linked Google account to the existing user');
        expect(result.user.id).toBe('user-2');
        check('returned the existing user');
      });
    });

    describe('[HAPPY] brand-new user', () => {
      it('creates the user with emailVerified set and links the OAuth account', async () => {
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
        check('created new user with emailVerified set (Google already verified the email)');
        expect(prisma.oAuthAccount.create).toHaveBeenCalled();
        check('linked OAuth account to the new user');
        expect(result.user.id).toBe('user-3');
        check('returned the new user');
      });
    });
  });
  
});

