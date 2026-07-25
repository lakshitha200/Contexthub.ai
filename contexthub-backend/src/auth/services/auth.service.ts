import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthProvider } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthResponseDto,
  RegisterResponseDto,
  UserResponseDto,
} from '../dto/tokens.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { ResendVerificationDto } from '../dto/resend-verification.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { GoogleProfile } from '../strategies/google.strategy';
import { MailService } from './mail.service';
import { TokenService } from './token.service';

type RequestMeta = { userAgent?: string; ipAddress?: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // ------------------------------------------------------------------
  // Email + password
  // ------------------------------------------------------------------

  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      // One email = one provider. If it's a Google account, tell them to use Google.
      if (existing.authProvider === AuthProvider.GOOGLE) {
        throw new ConflictException(
          'This email is already registered with Google. Please sign in with Google instead.',
        );
      }
      throw new ConflictException('This email is already registered. Please sign in.');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds());
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name ?? null,
        authProvider: AuthProvider.EMAIL,
        // emailVerified stays null until they confirm via the verification link.
      },
    });

    await this.sendEmailVerification(user.id, user.email);

    // No tokens yet — the user must verify their email before they can sign in.
    return { verificationRequired: true, email: user.email };
  }

  async login(dto: LoginDto, meta?: RequestMeta): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Google accounts have no password — steer them to the right method.
    if (user.authProvider === AuthProvider.GOOGLE) {
      throw new UnauthorizedException(
        'This account uses Google sign-in. Please continue with Google.',
      );
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password');

    if (!user.emailVerified) {
      throw new ForbiddenException(
        'Please verify your email before signing in. Check your inbox for the verification link.',
      );
    }

    const tokens = await this.tokens.issueTokens(user.id, user.email, meta);
    return { user: this.toUserDto(user), tokens };
  }

  async logout(refreshToken: string) {
    await this.tokens.revoke(refreshToken);
    return { success: true };
  }

  async me(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.toUserDto(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserResponseDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name, avatarUrl: dto.avatarUrl },
    });
    return this.toUserDto(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.authProvider === AuthProvider.GOOGLE || !user.passwordHash) {
      throw new BadRequestException('This account uses Google sign-in and has no password.');
    }
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(dto.newPassword, this.bcryptRounds());
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.tokens.revokeAllForUser(userId);
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Email verification
  // ------------------------------------------------------------------

  async verifyEmail(dto: VerifyEmailDto, meta?: RequestMeta): Promise<AuthResponseDto> {
    const tokenHash = this.tokens.hash(dto.token);
    const record = await this.prisma.verificationToken.findUnique({ where: { tokenHash } });

    if (
      !record ||
      record.type !== 'EMAIL_VERIFY' ||
      record.consumedAt ||
      record.expiresAt < new Date() ||
      !record.userId
    ) {
      throw new UnauthorizedException('Invalid or expired verification link');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      await tx.verificationToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
      return tx.user.update({
        where: { id: record.userId! },
        data: { emailVerified: new Date() },
      });
    });

    // Verified → sign them straight in.
    const tokens = await this.tokens.issueTokens(user.id, user.email, meta);
    return { user: this.toUserDto(user), tokens };
  }

  async resendVerification(dto: ResendVerificationDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Only unverified email accounts get a new link. Stay quiet otherwise so we
    // don't reveal which emails exist or which provider they use.
    if (user && user.authProvider === AuthProvider.EMAIL && !user.emailVerified) {
      await this.sendEmailVerification(user.id, user.email);
    }
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Password reset (email accounts only)
  // ------------------------------------------------------------------

  async requestPasswordReset(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Always return success so we don't reveal which emails are registered.
    // Only email accounts can reset — Google accounts sign in with Google.
    if (user && user.authProvider === AuthProvider.EMAIL) {
      const raw = this.tokens.generateOpaqueToken();
      const tokenHash = this.tokens.hash(raw);
      const expiresAt = new Date(Date.now() + this.passwordResetTtlMs());

      await this.prisma.verificationToken.create({
        data: {
          userId: user.id,
          identifier: dto.email,
          tokenHash,
          type: 'PASSWORD_RESET',
          expiresAt,
        },
      });

      await this.mail.sendPasswordReset(dto.email, raw);
    }

    return { success: true };
  }

  async resetPassword(dto: ResetPasswordDto, meta?: RequestMeta): Promise<AuthResponseDto> {
    const tokenHash = this.tokens.hash(dto.token);
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !record ||
      record.type !== 'PASSWORD_RESET' ||
      record.consumedAt ||
      record.expiresAt < new Date() ||
      !record.userId ||
      !record.user
    ) {
      throw new UnauthorizedException('Invalid or expired password reset link');
    }

    // Defence in depth — reset is for email accounts only.
    if (record.user.authProvider !== AuthProvider.EMAIL) {
      throw new ForbiddenException('This account uses Google sign-in and has no password.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, this.bcryptRounds());

    const user = await this.prisma.$transaction(async (tx) => {
      await tx.verificationToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
      return tx.user.update({
        where: { id: record.userId! },
        // Resetting the password also proves control of the inbox.
        data: { passwordHash, emailVerified: new Date() },
      });
    });

    // Invalidate any existing sessions for safety, then issue a fresh one.
    await this.tokens.revokeAllForUser(user.id);
    const tokens = await this.tokens.issueTokens(user.id, user.email, meta);
    return { user: this.toUserDto(user), tokens };
  }

  // ------------------------------------------------------------------
  // Google OAuth
  // ------------------------------------------------------------------

  async loginOrCreateOAuth(
    profile: GoogleProfile,
    provider: 'google',
    meta?: RequestMeta,
  ): Promise<AuthResponseDto> {
    const existingAccount = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId: profile.providerAccountId,
        },
      },
      include: { user: true },
    });

    if (existingAccount) {
      const tokens = await this.tokens.issueTokens(
        existingAccount.user.id,
        existingAccount.user.email,
        meta,
      );
      return { user: this.toUserDto(existingAccount.user), tokens };
    }

    let user = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (user) {
      // Email is already an email+password account — don't silently take it over.
      if (user.authProvider === AuthProvider.EMAIL) {
        throw new ConflictException(
          'This email is already registered with a password. Please sign in with your email and password.',
        );
      }
    } else {
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          authProvider: AuthProvider.GOOGLE,
          // Google has already verified the address for us.
          emailVerified: new Date(),
        },
      });
    }

    await this.prisma.oAuthAccount.create({
      data: {
        userId: user.id,
        provider,
        providerAccountId: profile.providerAccountId,
        accessToken: profile.accessToken,
        refreshToken: profile.refreshToken,
        scope: 'email profile',
      },
    });

    const tokens = await this.tokens.issueTokens(user.id, user.email, meta);
    return { user: this.toUserDto(user), tokens };
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private async sendEmailVerification(userId: string, email: string) {
    const raw = this.tokens.generateOpaqueToken();
    const tokenHash = this.tokens.hash(raw);
    const expiresAt = new Date(Date.now() + this.emailVerifyTtlMs());

    await this.prisma.verificationToken.create({
      data: {
        userId,
        identifier: email,
        tokenHash,
        type: 'EMAIL_VERIFY',
        expiresAt,
      },
    });

    await this.mail.sendVerificationEmail(email, raw);
  }

  private toUserDto(user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    emailVerified: Date | null;
    createdAt: Date;
  }): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    };
  }

  private bcryptRounds(): number {
    return Number(this.config.get<string>('BCRYPT_ROUNDS', '12'));
  }

  private passwordResetTtlMs(): number {
    const minutes = Number(this.config.get<string>('PASSWORD_RESET_TTL_MIN', '30'));
    return minutes * 60 * 1000;
  }

  private emailVerifyTtlMs(): number {
    const hours = Number(this.config.get<string>('EMAIL_VERIFY_TTL_HOURS', '24'));
    return hours * 60 * 60 * 1000;
  }
}
