/** Joins class names, filtering falsy values. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/** Formats an EGP amount from integer minor units (piastres) to `EGP 500.00`. */
export function formatEgpHtml(piastres: number | null | undefined): string {
  if (piastres === null || piastres === undefined) {
    return '—';
  }
  const pounds = piastres / 100;
  return new Intl.NumberFormat('en-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 2,
  }).format(pounds);
}

/** Formats a date string as `Aug 13, 2026, 2:30 PM`. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/** Formats a value into a human-friendly title case (e.g. DRAFT -> Draft). */
export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Builds initials from a name or email for avatars. */
export function initialsFrom(name: string | undefined | null, email?: string | null): string {
  const source = (name ?? email ?? '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/** Validates an email address. */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
