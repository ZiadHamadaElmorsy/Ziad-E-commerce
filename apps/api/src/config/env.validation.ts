const REQUIRED_ENV_VARS = ['DATABASE_URL'] as const;

const VALID_NODE_ENVS = ['development', 'test', 'production'] as const;

/**
 * Fail-fast environment validation used by @nestjs/config.
 * Throws before the application boots when required variables are missing or
 * malformed, instead of failing later at runtime with obscure errors.
 */
export function validate(config: Record<string, unknown>): Record<string, unknown> {
  const missing = REQUIRED_ENV_VARS.filter((key) => {
    const value = config[key];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy the repository root `.env.example` to `.env` and fill in the values.',
    );
  }

  const nodeEnv = config.NODE_ENV;
  if (
    nodeEnv !== undefined &&
    !VALID_NODE_ENVS.includes(nodeEnv as (typeof VALID_NODE_ENVS)[number])
  ) {
    throw new Error(
      `NODE_ENV must be one of: ${VALID_NODE_ENVS.join(', ')}. Received: ${String(nodeEnv)}`,
    );
  }

  const port = Number(config.PORT ?? 4000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(
      `PORT must be an integer between 1 and 65535. Received: ${String(config.PORT)}`,
    );
  }

  // Phase 21 — fail fast on malformed numeric configuration so a production
  // deployment never boots with a silently-zero rate-limit / expiry / media
  // value (which would be interpreted as "no limit").
  const positiveIntVars = [
    'RATE_LIMIT_DEFAULT_WINDOW_MS',
    'RATE_LIMIT_DEFAULT_LIMIT',
    'RATE_LIMIT_AUTH_LIMIT',
    'RATE_LIMIT_STOREFRONT_READ_LIMIT',
    'RATE_LIMIT_CART_LIMIT',
    'RATE_LIMIT_CHECKOUT_LIMIT',
    'RATE_LIMIT_PAYMENT_LIMIT',
    'RATE_LIMIT_ORDER_LOOKUP_LIMIT',
    'RATE_LIMIT_MEDIA_LIMIT',
    'RATE_LIMIT_WEBHOOK_LIMIT',
    'RATE_LIMIT_MERCHANT_API_LIMIT',
    'CART_TTL_MS',
    'RESERVATION_TTL_MS',
    'RESERVATION_EXPIRY_INTERVAL_MS',
    'RESERVATION_EXPIRY_BATCH_SIZE',
    'MEDIA_MAX_UPLOAD_BYTES',
  ] as const;

  for (const name of positiveIntVars) {
    const raw = config[name];
    if (raw === undefined || raw === '') {
      continue;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`${name} must be a positive integer. Received: ${String(raw)}`);
    }
  }

  const mediaMime = config.MEDIA_ALLOWED_MIME_TYPES;
  if (mediaMime !== undefined && String(mediaMime).trim().length === 0) {
    throw new Error('MEDIA_ALLOWED_MIME_TYPES must contain at least one MIME type.');
  }

  // Phase 23 — production CORS hardening: a wildcard origin would allow any
  // website to call the authenticated merchant API with credentials. Fail fast
  // at boot instead of silently weakening the allowlist.
  if (nodeEnv === 'production') {
    const corsRaw = config.CORS_ORIGINS;
    if (corsRaw === undefined || String(corsRaw).trim().length === 0) {
      throw new Error('CORS_ORIGINS must be set in production (comma-separated allowlist).');
    }
    const origins = String(corsRaw).split(',').map((origin) => origin.trim()).filter(Boolean);
    if (origins.length === 0) {
      throw new Error('CORS_ORIGINS must contain at least one origin in production.');
    }
    if (origins.some((origin) => origin === '*')) {
      throw new Error('CORS_ORIGINS must not contain "*" in production (wildcard origins are forbidden).');
    }
  }

  return config;
}
