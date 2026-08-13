import { ValidationError } from '../../common/errors/domain-exceptions';

/**
 * Splits the single documented `customer.name` field (docs/API-SPEC.md §22)
 * into the two persisted Customer name columns (docs/DATABASE.md §7.12):
 * first token -> first_name, the remaining tokens -> last_name.
 *
 * A single-token name yields an empty last_name (no documented split rule
 * exists; empty is the honest representation of "no last name given"). A
 * whitespace-only name is rejected defensively.
 */
export function splitCustomerName(name: string): { firstName: string; lastName: string } {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    throw new ValidationError('Customer name is required.');
  }
  const [firstName, ...rest] = parts;
  return { firstName, lastName: rest.join(' ') };
}
