import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request, Response } from 'express';
import { REQUEST_ID_HEADER } from '../context/request-context.constants';
import { DomainError } from '../errors/domain.error';

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Global exception filter that renders every API error using the project's
 * error envelope (see docs/API-SPEC.md, section "Error Response Convention"):
 *
 *   { "error": { "code": "...", "message": "...", "details": { ... } } }
 *
 * Priority:
 * 1. DomainError (typed application errors) -> uses its explicit code.
 * 2. HttpException (Nest built-ins, ValidationPipe) -> status-derived code.
 * 3. Anything else -> INTERNAL_SERVER_ERROR.
 *
 * Unknown/internal errors are logged server-side and replaced with a generic
 * message so stack traces, credentials and infrastructure details never leak
 * to the client. Log lines are enriched with the request correlation ID.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    if (exception instanceof DomainError) {
      this.handleDomainError(exception, request, response);
      return;
    }

    if (exception instanceof HttpException) {
      this.handleHttpException(exception, request, response);
      return;
    }

    // Unknown/internal error: never leak internals to the client.
    const message = exception instanceof Error ? exception.message : 'Non-Error exception thrown';
    const stack = exception instanceof Error ? exception.stack : undefined;
    this.logger.error(
      `[${this.requestId(request)}] Unhandled exception on ${request.method} ${request.originalUrl}: ${message}`,
      stack,
    );

    const body: ErrorResponseBody = {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      },
    };
    httpAdapter.reply(response, body, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private handleDomainError(exception: DomainError, request: Request, response: Response): void {
    const { httpAdapter } = this.httpAdapterHost;
    const status = exception.getStatus();

    const body: ErrorResponseBody = {
      error: {
        code: exception.code,
        message: exception.message,
        ...(exception.details !== undefined ? { details: exception.details } : {}),
      },
    };

    this.logger.warn(
      `[${this.requestId(request)}] Request ${request.method} ${request.originalUrl} failed with code ${exception.code} (${status})`,
    );

    httpAdapter.reply(response, body, status);
  }

  private handleHttpException(
    exception: HttpException,
    request: Request,
    response: Response,
  ): void {
    const { httpAdapter } = this.httpAdapterHost;
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let message: string = exception.message;
    let details: unknown;
    let isValidation = false;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const body = exceptionResponse as { message?: unknown; error?: string };
      if (Array.isArray(body.message)) {
        isValidation = true;
        message = 'Request validation failed.';
        details = body.message;
      } else if (typeof body.message === 'string') {
        message = body.message;
      } else if (typeof body.error === 'string') {
        message = body.error;
      }
    }

    const body: ErrorResponseBody = {
      error: {
        code: isValidation ? 'VALIDATION_ERROR' : this.statusToCode(status),
        message,
        ...(details !== undefined ? { details } : {}),
      },
    };

    this.logger.warn(
      `[${this.requestId(request)}] Request ${request.method} ${request.originalUrl} failed with status ${status}`,
    );

    httpAdapter.reply(response, body, status);
  }

  private statusToCode(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'RESOURCE_NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'TOO_MANY_REQUESTS';
      default:
        return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST';
    }
  }

  private requestId(request: Request): string {
    const direct = request.requestId;
    if (direct) {
      return direct;
    }
    const header = request.headers?.[REQUEST_ID_HEADER];
    return typeof header === 'string' ? header : '-';
  }
}
