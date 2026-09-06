import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';

/**
 * One access-log line per request: method, path, status, duration, user.
 * Stamps a requestId on the request and echoes it as X-Request-Id so a log
 * line can be tied back to the error the filter logged for the same request.
 *
 * Logs on the response 'finish' event rather than in tap(), so the status
 * code is the one actually sent (including 201s and errors shaped by the
 * exception filter).
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    request.requestId ??= randomUUID();
    response.setHeader('X-Request-Id', request.requestId);

    const startedAt = Date.now();
    const method = request.method;
    const path = request.originalUrl ?? request.url;

    response.on('finish', () => {
      const status = response.statusCode;
      const user = request.user as { id: string } | undefined;
      const line = `${method} ${path} ${status} ${Date.now() - startedAt}ms user=${
        user?.id ?? 'anon'
      } req=${request.requestId}`;

      if (status >= 500) this.logger.error(line);
      else if (status >= 400) this.logger.warn(line);
      else this.logger.log(line);
    });

    return next.handle();
  }
}
