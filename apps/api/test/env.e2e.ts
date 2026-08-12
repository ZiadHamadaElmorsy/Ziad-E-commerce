/**
 * Jest e2e environment setup.
 *
 * Runs before the test file is imported, so process.env values are present
 * before AppModule (and its ConfigModule validation) is evaluated.
 * Placeholder values only — the e2e suite overrides PrismaService, so no real
 * database is contacted.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ziad_e2e';
