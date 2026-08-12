export interface SupabaseConfig {
  url?: string;
  anonKey?: string;
  serviceRoleKey?: string;
}

export interface AppConfiguration {
  nodeEnv: string;
  port: number;
  databaseUrl?: string;
  corsOrigins: string;
  supabase: SupabaseConfig;
}

export default (): AppConfiguration => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  databaseUrl: process.env.DATABASE_URL,
  corsOrigins: process.env.CORS_ORIGINS ?? 'http://localhost:3000',
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
});
