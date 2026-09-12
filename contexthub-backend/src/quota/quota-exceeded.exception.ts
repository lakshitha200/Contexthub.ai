import { HttpException, HttpStatus } from '@nestjs/common';

/** Machine-readable discriminator. The frontend keys its modal off this, not
 *  off the status code, because 429 also means ordinary rate limiting. */
export const QUOTA_EXCEEDED_CODE = 'QUOTA_EXCEEDED';

/** What the client needs to render a useful "you are out" screen. */
export interface QuotaExceededDetails {
  /** Tokens already spent in the current window. */
  used: number;
  /** Tokens allowed per window. */
  limit: number;
  /** ISO timestamp when the allowance resets. */
  resetsAt: string;
}

/**
 * Thrown when an account has spent its daily AI allowance.
 *
 * 429 rather than 402 or 403: the request is well formed and the account is
 * entitled to make it, just not yet. That is exactly "try again later", and it
 * is the status clients already know not to retry immediately. `Retry-After`
 * is set from the same reset time so well behaved clients back off correctly
 * without parsing the body.
 */
export class QuotaExceededException extends HttpException {
  constructor(readonly details: QuotaExceededDetails) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        code: QUOTA_EXCEEDED_CODE,
        message:
          'You have used your AI allowance for today. It resets automatically.',
        details,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** Seconds until reset, for the `Retry-After` header. */
  retryAfterSeconds(): number {
    const ms = new Date(this.details.resetsAt).getTime() - Date.now();
    return Math.max(1, Math.ceil(ms / 1000));
  }
}
