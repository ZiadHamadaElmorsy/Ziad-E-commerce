/**
 * Typed access to frontend environment configuration.
 *
 * NEXT_PUBLIC_* variables are inlined at build time by Next.js and are safe
 * for the browser bundle. They must never contain secrets.
 */
export const appConfig = {
  name: 'Ziad E-commerce',
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1',
} as const;
