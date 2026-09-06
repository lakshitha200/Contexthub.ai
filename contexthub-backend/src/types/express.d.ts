import type { ActiveMembership } from '../workspace/decorators/current-membership.decorator';

declare module 'express-serve-static-core' {
  interface Request {
    membership?: ActiveMembership;
    /** Correlation id set by LoggingInterceptor (or AllExceptionsFilter as fallback). */
    requestId?: string;
  }
}

export {};
