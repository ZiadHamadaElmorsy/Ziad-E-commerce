import { HttpException, HttpStatus } from '@nestjs/common';
import { DomainErrorCode } from './domain-error-code.enum';

/**
 * Base class for all typed application/domain errors.
 *
 * Extends Nest's HttpException so the error already carries the correct HTTP
 * status, while adding an explicit, stable error code and optional structured
 * details for the API error envelope:
 *
 *   { "error": { "code": <code>, "message": <message>, "details": <details> } }
 *
 * Only the code, message and details are ever rendered to clients. Stack
 * traces and internal state are never part of the response (see
 * AllExceptionsFilter).
 */
export abstract class DomainError extends HttpException {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: unknown,
  ) {
    super(message, status);
    this.name = new.target.name;
  }
}
