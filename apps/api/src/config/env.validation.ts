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

  return config;
}
