import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TokensResponseDto } from '../dto/tokens.dto';
import { JwtPayload } from '../strategies/jwt.strategy';
import { JwtRefreshPayload } from '../strategies/jwt-refresh.strategy';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async issueTokens(
    userId: string,
    email: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<TokensResponseDto> {
    const jti = randomUUID();
    const accessToken = await this.signAccess(userId, email);
    const refreshToken = await this.signRefresh(userId, email, jti);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(refreshToken),
        userAgent: meta?.userAgent,
        ipAddress: meta?.ipAddress,
        expiresAt: this.refreshExpiryDate(),
      },
    });

    return { accessToken, refreshToken };
  }

  async rotate(
    payload: JwtRefreshPayload,
    rawToken: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<TokensResponseDto> {
    const hash = this.hash(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      if (stored && !stored.revokedAt) {
        await this.prisma.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(payload.sub, payload.email, meta);
  }

  async revoke(rawToken: string) {
    const hash = this.hash(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  generateOpaqueToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private signAccess(userId: string, email: string) {
    const payload: JwtPayload = { sub: userId, email };
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
    });
  }

  private signRefresh(userId: string, email: string, jti: string) {
    const payload: JwtRefreshPayload = { sub: userId, email, jti };
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    });
  }

  private refreshExpiryDate(): Date {
    const days = Number(this.config.get<string>('JWT_REFRESH_EXPIRES_DAYS', '7'));
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
