// ─────────────────────────────────────────────────────────────────────────────
// AuthService — UNIT TESTS
//
// Covers the strict account model:
//   • one email = one provider (EMAIL or GOOGLE), never both
//   • email + password signups must verify their email before they can log in
//   • Google logins are verified by default and cannot use a password
//
// Each method is tested across:
//   [HAPPY]    → works when input is valid
//   [SAD]      → fails with the right exception
//   [SECURITY] → protects secrets / handles edge cases safely
// ─────────────────────────────────────────────────────────────────────────────

// Stub the real PrismaService module: its generated Prisma client imports
// transitive `.js` paths that Jest's resolver can't follow. We inject a mock
// via `useValue` anyway, so the real class is never instantiated.
jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

// The service imports the AuthProvider enum from the generated client (same
// unresolvable transitive paths) — stub it to plain string values.
jest.mock('../../../generated/prisma/client', () => ({
  AuthProvider: { EMAIL: 'EMAIL', GOOGLE: 'GOOGLE' },
}));

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
  $transaction: jest.Mock;
};

const buildUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice',
  avatarUrl: null,
  emailVerified: null as Date | null,
  authProvider: 'EMAIL',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  passwordHash: null as string | null,
  ...overrides,
});

const FAKE_TOKENS = { accessToken: 'access.jwt', refreshToken: 'refresh.jwt' };

// ─── suite ──────────────────────────────────────────────────────────────────
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
  let mail: { sendVerificationEmail: jest.Mock; sendPasswordReset: jest.Mock };

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
        update: jest.fn().mockResolvedValue({}),
      },
      oAuthAccount: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      // Run the callback with `prisma` itself as the transaction client, so the
      // same user/verificationToken mocks are used inside transactions.
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    tokens = {
      issueTokens: jest.fn().mockResolvedValue(FAKE_TOKENS),
      revoke: jest.fn().mockResolvedValue(undefined),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
      generateOpaqueToken: jest.fn().mockReturnValue('raw-token'),
      hash: jest.fn((v: string) => `hash:${v}`),
    };
    mail = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    };

    const config = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'BCRYPT_ROUNDS') return '4';
        if (key === 'PASSWORD_RESET_TTL_MIN') return '30';
        if (key === 'EMAIL_VERIFY_TTL_HOURS') return '24';
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
    const dto = { email: 'new@example.com', password: 'Pass1234', name: 'New' };

    describe('[HAPPY] valid input', () => {
      it('creates an unverified EMAIL user, sends verification, returns no tokens', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.user.create.mockResolvedValue(buildUser({ email: dto.email, name: dto.name }));
        prisma.verificationToken.create.mockResolvedValue({});

        const result = await service.register(dto);

        const createArgs = prisma.user.create.mock.calls[0][0];
        expect(createArgs.data.authProvider).toBe('EMAIL');
        check('created user tagged authProvider=EMAIL');
        expect(createArgs.data.emailVerified).toBeUndefined();
        check('did NOT mark the email verified on signup');
        expect(mail.sendVerificationEmail).toHaveBeenCalledWith(dto.email, 'raw-token');
        check('sent a verification email with the raw token');
        expect(result).toEqual({ verificationRequired: true, email: dto.email });
        check('returned { verificationRequired: true } — no tokens');
      });
    });

    describe('[SAD] duplicate email', () => {
      it('throws ConflictException for an existing EMAIL account', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser({ authProvider: 'EMAIL' }));

        await expect(service.register(dto)).rejects.toThrow(ConflictException);
        check('threw ConflictException for duplicate email account');
        expect(prisma.user.create).not.toHaveBeenCalled();
        check('did NOT create a user on conflict');
      });

      it('throws ConflictException (use Google) for an existing GOOGLE account', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser({ authProvider: 'GOOGLE' }));

        await expect(service.register(dto)).rejects.toThrow(/Google/i);
        check('told the user to sign in with Google');
      });
    });

    describe('[SECURITY] password hygiene', () => {
      it('stores a hashed password — never the raw value', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.user.create.mockResolvedValue(buildUser());
        prisma.verificationToken.create.mockResolvedValue({});

        await service.register(dto);

        const storedHash: string = prisma.user.create.mock.calls[0][0].data.passwordHash;
        expect(storedHash).not.toBe(dto.password);
        await expect(bcrypt.compare(dto.password, storedHash)).resolves.toBe(true);
        check('stored a bcrypt hash that verifies against the raw password');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════ login
  describe('login()', () => {
    const dto = { email: 'alice@example.com', password: 'Pass1234' };
    const verifiedUser = async () =>
      buildUser({ passwordHash: await bcrypt.hash(dto.password, 4), emailVerified: new Date() });

    describe('[HAPPY] verified account, correct credentials', () => {
      it('returns tokens', async () => {
        prisma.user.findUnique.mockResolvedValue(await verifiedUser());

        const result = await service.login(dto);

        expect(result.tokens).toEqual(FAKE_TOKENS);
        check('returned tokens for a verified email account');
      });
    });

    describe('[SAD] wrong credentials', () => {
      it('throws Unauthorized when email does not exist', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
        check('threw Unauthorized for unknown email');
      });

      it('throws Unauthorized when the password is wrong', async () => {
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ passwordHash: await bcrypt.hash('nope', 4), emailVerified: new Date() }),
        );
        await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
        check('threw Unauthorized for wrong password');
      });
    });

    describe('[SAD] provider + verification gates', () => {
      it('blocks a GOOGLE account from password login', async () => {
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ authProvider: 'GOOGLE', passwordHash: null }),
        );
        await expect(service.login(dto)).rejects.toThrow(/Google/i);
        check('steered a Google account to Google sign-in');
      });

      it('blocks an unverified account with ForbiddenException', async () => {
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ passwordHash: await bcrypt.hash(dto.password, 4), emailVerified: null }),
        );
        await expect(service.login(dto)).rejects.toThrow(ForbiddenException);
        check('blocked login until the email is verified');
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════════ logout
  describe('logout()', () => {
    it('revokes the refresh token', async () => {
      const result = await service.logout('refresh.jwt');
      expect(tokens.revoke).toHaveBeenCalledWith('refresh.jwt');
      expect(result).toEqual({ success: true });
      check('revoked the refresh token and returned success');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════ me
  describe('me()', () => {
    it('returns the user DTO without the password hash', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser({ passwordHash: 'secret' }));
      const result = await service.me('user-1');
      expect(result.id).toBe('user-1');
      expect(result).not.toHaveProperty('passwordHash');
      check('returned user id and stripped passwordHash');
    });
  });

  // ══════════════════════════════════════════════════════════════════ updateProfile
  describe('updateProfile()', () => {
    it('updates name and avatarUrl', async () => {
      prisma.user.update.mockResolvedValue(buildUser({ name: 'Alice B' }));
      const result = await service.updateProfile('user-1', { name: 'Alice B' });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(result.name).toBe('Alice B');
      check('updated and returned the profile');
    });
  });

  // ═════════════════════════════════════════════════════════════════ changePassword
  describe('changePassword()', () => {
    const dto = { currentPassword: 'OldPass1', newPassword: 'NewPass2' };

    describe('[HAPPY] correct current password', () => {
      it('updates the password and revokes all sessions', async () => {
        prisma.user.findUniqueOrThrow.mockResolvedValue(
          buildUser({ passwordHash: await bcrypt.hash(dto.currentPassword, 4) }),
        );
        prisma.user.update.mockResolvedValue(buildUser());

        const result = await service.changePassword('user-1', dto);

        const newHash: string = prisma.user.update.mock.calls[0][0].data.passwordHash;
        await expect(bcrypt.compare(dto.newPassword, newHash)).resolves.toBe(true);
        expect(tokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
        expect(result).toEqual({ success: true });
        check('rehashed the password and revoked all sessions');
      });
    });

    describe('[SAD] wrong current password', () => {
      it('throws Unauthorized and changes nothing', async () => {
        prisma.user.findUniqueOrThrow.mockResolvedValue(
          buildUser({ passwordHash: await bcrypt.hash('other', 4) }),
        );
        await expect(service.changePassword('user-1', dto)).rejects.toThrow(UnauthorizedException);
        expect(prisma.user.update).not.toHaveBeenCalled();
        check('rejected wrong current password without updating');
      });
    });

    describe('[SECURITY] Google accounts', () => {
      it('throws BadRequest for a Google (passwordless) account', async () => {
        prisma.user.findUniqueOrThrow.mockResolvedValue(
          buildUser({ authProvider: 'GOOGLE', passwordHash: null }),
        );
        await expect(service.changePassword('user-1', dto)).rejects.toThrow(BadRequestException);
        check('blocked password change on a Google account');
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════ verifyEmail
  describe('verifyEmail()', () => {
    const future = () => new Date(Date.now() + 60_000);
    const past = () => new Date(Date.now() - 60_000);
    const record = (over: Partial<Record<string, unknown>> = {}) => ({
      id: 'tok-1',
      userId: 'user-1',
      type: 'EMAIL_VERIFY',
      consumedAt: null,
      expiresAt: future(),
      ...over,
    });

    describe('[HAPPY] valid token', () => {
      it('consumes the token, sets emailVerified, returns tokens', async () => {
        prisma.verificationToken.findUnique.mockResolvedValue(record());
        prisma.user.update.mockResolvedValue(buildUser({ emailVerified: new Date() }));

        const result = await service.verifyEmail({ token: 'raw-token' });

        expect(prisma.verificationToken.findUnique).toHaveBeenCalledWith({
          where: { tokenHash: 'hash:raw-token' },
        });
        check('looked the token up by hash, not raw value');
        expect(prisma.verificationToken.update).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'tok-1' } }),
        );
        expect(prisma.user.update.mock.calls[0][0].data.emailVerified).toBeInstanceOf(Date);
        check('consumed the token and set emailVerified');
        expect(result.tokens).toEqual(FAKE_TOKENS);
        check('signed the user in after verification');
      });
    });

    describe('[SAD / SECURITY] bad tokens', () => {
      it('rejects an unknown token', async () => {
        prisma.verificationToken.findUnique.mockResolvedValue(null);
        await expect(service.verifyEmail({ token: 'x' })).rejects.toThrow(UnauthorizedException);
        check('rejected unknown token');
      });
      it('rejects an expired token', async () => {
        prisma.verificationToken.findUnique.mockResolvedValue(record({ expiresAt: past() }));
        await expect(service.verifyEmail({ token: 'raw-token' })).rejects.toThrow(
          UnauthorizedException,
        );
        check('rejected expired token');
      });
      it('rejects an already-consumed token (no replay)', async () => {
        prisma.verificationToken.findUnique.mockResolvedValue(record({ consumedAt: new Date() }));
        await expect(service.verifyEmail({ token: 'raw-token' })).rejects.toThrow(
          UnauthorizedException,
        );
        check('blocked replay of a used token');
      });
      it('rejects a token of the wrong type', async () => {
        prisma.verificationToken.findUnique.mockResolvedValue(record({ type: 'PASSWORD_RESET' }));
        await expect(service.verifyEmail({ token: 'raw-token' })).rejects.toThrow(
          UnauthorizedException,
        );
        check('rejected a mismatched token type');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════ resendVerification
  describe('resendVerification()', () => {
    it('re-sends for an unverified EMAIL account', async () => {
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ authProvider: 'EMAIL', emailVerified: null }),
      );
      prisma.verificationToken.create.mockResolvedValue({});

      const result = await service.resendVerification({ email: 'alice@example.com' });

      expect(mail.sendVerificationEmail).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
      check('re-sent verification to an unverified account');
    });

    it('stays quiet for verified / Google / unknown emails', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ emailVerified: new Date() }));
      await service.resendVerification({ email: 'alice@example.com' });
      prisma.user.findUnique.mockResolvedValue(buildUser({ authProvider: 'GOOGLE' }));
      await service.resendVerification({ email: 'alice@example.com' });
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.resendVerification({ email: 'ghost@example.com' });

      expect(mail.sendVerificationEmail).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
      check('never leaked which emails exist, sent nothing');
    });
  });

  // ═════════════════════════════════════════════════════════════ requestPasswordReset
  describe('requestPasswordReset()', () => {
    it('issues a reset token for an EMAIL account', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ authProvider: 'EMAIL' }));
      prisma.verificationToken.create.mockResolvedValue({});

      const result = await service.requestPasswordReset({ email: 'alice@example.com' });

      const createArgs = prisma.verificationToken.create.mock.calls[0][0];
      expect(createArgs.data.tokenHash).toBe('hash:raw-token');
      expect(createArgs.data.type).toBe('PASSWORD_RESET');
      expect(mail.sendPasswordReset).toHaveBeenCalledWith('alice@example.com', 'raw-token');
      expect(result).toEqual({ success: true });
      check('stored a hashed reset token and emailed the raw one');
    });

    it('does nothing for a GOOGLE account (still returns success)', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ authProvider: 'GOOGLE' }));
      const result = await service.requestPasswordReset({ email: 'alice@example.com' });
      expect(prisma.verificationToken.create).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
      check('refused to issue a reset for a Google account, without leaking it');
    });

    it('does nothing for an unknown email (still returns success)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.requestPasswordReset({ email: 'ghost@example.com' });
      expect(prisma.verificationToken.create).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
      check('stayed quiet for an unknown email');
    });
  });

  // ═══════════════════════════════════════════════════════════════════ resetPassword
  describe('resetPassword()', () => {
    const future = () => new Date(Date.now() + 60_000);
    const record = (over: Partial<Record<string, unknown>> = {}) => ({
      id: 'tok-1',
      userId: 'user-1',
      type: 'PASSWORD_RESET',
      consumedAt: null,
      expiresAt: future(),
      user: buildUser({ authProvider: 'EMAIL' }),
      ...over,
    });

    describe('[HAPPY] valid token', () => {
      it('sets the new password, revokes sessions, returns tokens', async () => {
        prisma.verificationToken.findUnique.mockResolvedValue(record());
        prisma.user.update.mockResolvedValue(buildUser({ emailVerified: new Date() }));

        const result = await service.resetPassword({ token: 'raw-token', newPassword: 'Fresh123' });

        const newHash: string = prisma.user.update.mock.calls[0][0].data.passwordHash;
        await expect(bcrypt.compare('Fresh123', newHash)).resolves.toBe(true);
        expect(tokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
        expect(result.tokens).toEqual(FAKE_TOKENS);
        check('rehashed the password, revoked sessions, and signed in');
      });
    });

    describe('[SAD / SECURITY]', () => {
      it('rejects an invalid token', async () => {
        prisma.verificationToken.findUnique.mockResolvedValue(null);
        await expect(
          service.resetPassword({ token: 'x', newPassword: 'Fresh123' }),
        ).rejects.toThrow(UnauthorizedException);
        check('rejected an invalid reset token');
      });

      it('rejects a token whose user is a Google account', async () => {
        prisma.verificationToken.findUnique.mockResolvedValue(
          record({ user: buildUser({ authProvider: 'GOOGLE' }) }),
        );
        await expect(
          service.resetPassword({ token: 'raw-token', newPassword: 'Fresh123' }),
        ).rejects.toThrow(ForbiddenException);
        check('refused to set a password on a Google account');
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
          user: buildUser({ id: 'user-1', email: profile.email, authProvider: 'GOOGLE' }),
        });

        const result = await service.loginOrCreateOAuth(profile, 'google');

        expect(prisma.user.findUnique).not.toHaveBeenCalled();
        expect(prisma.oAuthAccount.create).not.toHaveBeenCalled();
        expect(result.tokens).toEqual(FAKE_TOKENS);
        check('logged in via the already-linked Google account');
      });
    });

    describe('[SAD] email belongs to a password account', () => {
      it('throws ConflictException instead of taking over the account', async () => {
        prisma.oAuthAccount.findUnique.mockResolvedValue(null);
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ id: 'user-2', email: profile.email, authProvider: 'EMAIL' }),
        );

        await expect(service.loginOrCreateOAuth(profile, 'google')).rejects.toThrow(
          ConflictException,
        );
        check('blocked Google sign-in for an existing email+password account');
        expect(prisma.oAuthAccount.create).not.toHaveBeenCalled();
        check('did NOT link Google to the password account');
      });
    });

    describe('[HAPPY] brand-new user', () => {
      it('creates a verified GOOGLE user and links the OAuth account', async () => {
        prisma.oAuthAccount.findUnique.mockResolvedValue(null);
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.user.create.mockResolvedValue(
          buildUser({ id: 'user-3', email: profile.email, authProvider: 'GOOGLE', emailVerified: new Date() }),
        );
        prisma.oAuthAccount.create.mockResolvedValue({});

        const result = await service.loginOrCreateOAuth(profile, 'google');

        const createArgs = prisma.user.create.mock.calls[0][0];
        expect(createArgs.data.authProvider).toBe('GOOGLE');
        expect(createArgs.data.emailVerified).toBeInstanceOf(Date);
        check('created a Google user, verified by default');
        expect(prisma.oAuthAccount.create).toHaveBeenCalled();
        expect(result.user.id).toBe('user-3');
        check('linked the OAuth account and returned the new user');
      });
    });
  });
});
