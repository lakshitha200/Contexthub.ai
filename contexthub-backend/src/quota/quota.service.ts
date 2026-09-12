import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaExceededException } from './quota-exceeded.exception';

/** A read of one account's standing for the current window. */
export interface QuotaSummary {
  /** Tokens spent in the current window. */
  used: number;
  /** Tokens allowed per window. */
  limit: number;
  /** Never negative, even when a single call overshoots the limit. */
  remaining: number;
  /** 0 to 100, rounded, for a progress bar. */
  percentUsed: number;
  /** Provider calls made in the current window. */
  calls: number;
  /** When the allowance resets. */
  resetsAt: string;
  /** False once the allowance is spent. */
  allowed: boolean;
  /** When false, quotas are switched off entirely and nothing is enforced. */
  enabled: boolean;
}

/** Midnight UTC of the day a moment falls in. */
function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Midnight UTC of the following day, which is when the bucket rolls. */
function startOfNextUtcDay(now: Date): Date {
  const day = startOfUtcDay(now);
  day.setUTCDate(day.getUTCDate() + 1);
  return day;
}

/**
 * Per-account AI spending limits.
 *
 * The unit is provider-reported tokens, so the number tracks the real bill
 * rather than a guess that drifts away from it.
 *
 * Two deliberate choices:
 *
 * Enforcement is a pre-flight check against what has already been spent, not a
 * reservation of what the next call might cost. A request's true cost is only
 * known once the provider answers, and refusing to start work because the worst
 * case *might* exceed the limit would reject most requests while the account
 * still had room. The consequence is that the final call of a window can
 * overshoot, which is bounded by one request and is the right trade.
 *
 * Recording never throws. Usage accounting failing must not fail a request the
 * user already paid for and already received, so a write failure is logged and
 * swallowed.
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);
  private readonly dailyTokens: number;
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.dailyTokens = Number(
      this.config.get<string>('QUOTA_DAILY_TOKENS', '60000'),
    );
    this.enabled = this.config.get<string>('QUOTA_ENABLED', 'true') !== 'false';
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Throw if this account has nothing left. Call before starting any work that
   * will hit the provider.
   */
  async assertWithinQuota(userId: string): Promise<void> {
    if (!this.enabled) return;

    const summary = await this.summary(userId);
    if (!summary.allowed) {
      throw new QuotaExceededException({
        used: summary.used,
        limit: summary.limit,
        resetsAt: summary.resetsAt,
      });
    }
  }

  /** Current standing for an account. Safe to call on every page load. */
  async summary(userId: string, now = new Date()): Promise<QuotaSummary> {
    const day = startOfUtcDay(now);
    const resetsAt = startOfNextUtcDay(now).toISOString();

    const row = await this.prisma.usageCounter.findUnique({
      where: { userId_day: { userId, day } },
      select: { tokens: true, calls: true },
    });

    const used = row?.tokens ?? 0;
    const limit = this.dailyTokens;

    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      percentUsed: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0,
      calls: row?.calls ?? 0,
      resetsAt,
      allowed: !this.enabled || used < limit,
      enabled: this.enabled,
    };
  }

  /**
   * Add a call's cost to an account's running total.
   *
   * Uses an upsert with an atomic `increment` so two requests finishing at the
   * same moment cannot clobber each other's total, which a read-then-write
   * would do silently.
   */
  async record(
    userId: string,
    tokens: number,
    now = new Date(),
  ): Promise<void> {
    if (!this.enabled || tokens <= 0) return;

    const day = startOfUtcDay(now);
    try {
      await this.prisma.usageCounter.upsert({
        where: { userId_day: { userId, day } },
        create: { userId, day, tokens, calls: 1 },
        update: { tokens: { increment: tokens }, calls: { increment: 1 } },
      });
    } catch (err) {
      // Losing a usage write must never fail a request whose work is already
      // done and already billed by the provider.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to record ${tokens} tokens for user ${userId}: ${message}`,
      );
    }
  }
}
