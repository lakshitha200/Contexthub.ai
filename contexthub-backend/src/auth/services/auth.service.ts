import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthResponseDto, TokensResponseDto, UserResponseDto } from '../dto/tokens.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { LoginDto } from '../dto/login.dto';
import { MagicLinkRequestDto } from '../dto/magic-link.dto';
import { RegisterDto } from '../dto/register.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
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

  async register(dto: RegisterDto, meta?: RequestMeta): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds());
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name ?? null,
      },
    });

    const tokens = await this.tokens.issueTokens(user.id, user.email, meta);
    return { user: this.toUserDto(user), tokens };
  }

  async login(dto: LoginDto, meta?: RequestMeta): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password');

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
    if (!user.passwordHash) {
      throw new BadRequestException('Account has no password set — use magic link or social login');
    }
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(dto.newPassword, this.bcryptRounds());
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.tokens.revokeAllForUser(userId);
    return { success: true };
  }

  async requestMagicLink(dto: MagicLinkRequestDto) {
    const raw = this.tokens.generateOpaqueToken();
    const tokenHash = this.tokens.hash(raw);
    const expiresAt = new Date(Date.now() + this.magicLinkTtlMs());

    let user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { email: dto.email, name: dto.name ?? null },
      });
    }

    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        identifier: dto.email,
        tokenHash,
        type: 'MAGIC_LINK',
        expiresAt,
      },
    });

    await this.mail.sendMagicLink(dto.email, raw);
    return { success: true };
  }

  async verifyMagicLink(rawToken: string, meta?: RequestMeta): Promise<AuthResponseDto> {
    const tokenHash = this.tokens.hash(rawToken);
    const record = await this.prisma.verificationToken.findUnique({ where: { tokenHash } });

    if (
      !record ||
      record.type !== 'MAGIC_LINK' ||
      record.consumedAt ||
      record.expiresAt < new Date() ||
      !record.userId
    ) {
      throw new UnauthorizedException('Invalid or expired magic link');
    }

    await this.prisma.verificationToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });

    const user = await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: new Date() },
    });

    const tokens = await this.tokens.issueTokens(user.id, user.email, meta);
    return { user: this.toUserDto(user), tokens };
  }

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
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
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

  private magicLinkTtlMs(): number {
    const minutes = Number(this.config.get<string>('MAGIC_LINK_TTL_MIN', '15'));
    return minutes * 60 * 1000;
  }
}
