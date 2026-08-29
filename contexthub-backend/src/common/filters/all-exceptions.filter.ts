import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Prisma } from '../../../generated/prisma/client';

/** Shape every failed request returns, so the frontend can rely on one contract. */
export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  method: string;
  requestId: string;
  timestamp: string;
}

interface NormalizedError {
  status: number;
  message: string | string[];
  error: string;
}

/**
 * Catches everything that escapes a controller — HttpExceptions, Prisma errors
 * and unexpected throws — and turns it into a single JSON contract.
 * Registered globally via APP_FILTER in AppModule.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw exception;

    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    // The interceptor normally sets this; guards can throw before it runs.
    request.requestId ??= randomUUID();

    const { status, message, error } = this.normalize(exception);

    const body: ErrorResponseBody = {
      statusCode: status,
      error,
      message,
      path: request.originalUrl ?? request.url,
      method: request.method,
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
    };

    this.log(status, body, exception);

    // A streamed/aborted response cannot be rewritten.
    if (response.headersSent) return;
    response.status(status).json(body);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { status, message: payload, error: this.reason(status) };
      }

      const shaped = payload as { message?: string | string[]; error?: string };
      return {
        status,
        message: shaped.message ?? exception.message,
        error: shaped.error ?? this.reason(status),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrisma(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid database query',
        error: 'Bad Request',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      // Never leak internals to clients in production.
      message:
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : exception instanceof Error
            ? exception.message
            : 'Internal server error',
      error: 'Internal Server Error',
    };
  }

  private fromPrisma(
    exception: Prisma.PrismaClientKnownRequestError,
  ): NormalizedError {
    const target =
      (exception.meta?.target as string[] | string | undefined) ?? [];
    const fields = Array.isArray(target) ? target.join(', ') : target;

    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: fields
            ? `A record with this ${fields} already exists`
            : 'A record with these values already exists',
          error: 'Conflict',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'The requested record was not found',
          error: 'Not Found',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Related record does not exist',
          error: 'Bad Request',
        };
      case 'P2000':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: fields
            ? `Value too long for field ${fields}`
            : 'Value too long for one of the fields',
          error: 'Bad Request',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database error',
          error: 'Internal Server Error',
        };
    }
  }

  private log(status: number, body: ErrorResponseBody, exception: unknown) {
    const line = `${body.method} ${body.path} ${status} req=${body.requestId} - ${
      Array.isArray(body.message) ? body.message.join('; ') : body.message
    }`;

    if (status >= 500) {
      this.logger.error(
        line,
        exception instanceof Error ? exception.stack : undefined,
      );
      return;
    }
    this.logger.warn(line);
  }

  private reason(status: number): string {
    // "Not Found" from NOT_FOUND, "Bad Request" from BAD_REQUEST, etc.
    const name = HttpStatus[status] as string | undefined;
    if (!name) return 'Error';
    return name
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
