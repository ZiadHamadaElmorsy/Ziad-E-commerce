import { validate, ValidationError as ClassValidatorError } from 'class-validator';
import { ValidationError } from '../../common/errors/domain-exceptions';

/**
 * Service-boundary DTO validation for operations that have no HTTP controller
 * pipe (CustomerAddress operations are NOT exposed as endpoints in this phase
 * — API-SPEC §20 documents no address endpoints — but the service must still
 * enforce the DTO contract for its programmatic consumers).
 *
 * Mirrors the global ValidationPipe behavior: class-validator constraints are
 * evaluated and failures are rendered through the shared error envelope as a
 * VALIDATION_ERROR with a flat message array in `details` (same shape the
 * pipe produces).
 */
export async function validateDtoOrThrow(dto: object): Promise<void> {
  const errors = await validate(dto);
  if (errors.length > 0) {
    throw new ValidationError('Request validation failed.', collectConstraintMessages(errors));
  }
}

function collectConstraintMessages(errors: ClassValidatorError[]): string[] {
  const messages: string[] = [];
  for (const error of errors) {
    if (error.constraints) {
      messages.push(...Object.values(error.constraints));
    }
    if (error.children && error.children.length > 0) {
      messages.push(...collectConstraintMessages(error.children));
    }
  }
  return messages;
}
