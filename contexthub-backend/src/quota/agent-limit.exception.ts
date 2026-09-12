import { HttpException, HttpStatus } from '@nestjs/common';

/** Machine-readable discriminator, distinct from the token allowance so the UI
 *  can say which limit was hit. Running out of deep searches is not the same as
 *  running out of tokens, and telling someone the wrong one is worse than
 *  saying nothing. */
export const AGENT_LIMIT_CODE = 'AGENT_LIMIT_REACHED';

export interface AgentLimitDetails {
  /** Deep searches already started in the current window. */
  used: number;
  /** Deep searches allowed per window. */
  limit: number;
  /** ISO timestamp when the allowance resets. */
  resetsAt: string;
}

/**
 * Thrown when an account has used its deep search runs for the day.
 *
 * The ordinary question path is untouched, so this is never a dead end: the
 * user can still ask, just without the agent doing multiple searches for them.
 */
export class AgentLimitException extends HttpException {
  constructor(readonly details: AgentLimitDetails) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        code: AGENT_LIMIT_CODE,
        message:
          'You have used your deep search for today. Normal questions still work.',
        details,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
