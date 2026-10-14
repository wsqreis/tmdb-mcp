export type Config = {
  tmdb: {
    /** v4 "API Read Access Token" (preferred) or v3 API key. */
    readAccessToken?: string;
    apiKey?: string;
    baseUrl: string;
    language: string;
    region: string;
    cacheTtlMs: number;
    cacheMaxEntries: number;
    timeoutMs: number;
    maxRetries: number;
  };
  http: {
    host: string;
    port: number;
    /** Bearer token clients must send in HTTP mode. */
    authToken?: string;
    rateLimitPerMinute: number;
  };
};

const int = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative integer, got "${value}"`);
  }
  return parsed;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    tmdb: {
      readAccessToken: env.TMDB_READ_ACCESS_TOKEN || undefined,
      apiKey: env.TMDB_API_KEY || undefined,
      baseUrl: env.TMDB_BASE_URL || 'https://api.themoviedb.org/3',
      language: env.TMDB_LANGUAGE || 'en-US',
      region: env.TMDB_REGION || 'US',
      cacheTtlMs: int(env.TMDB_CACHE_TTL_SECONDS, 600) * 1000,
      cacheMaxEntries: int(env.TMDB_CACHE_MAX_ENTRIES, 500),
      timeoutMs: int(env.TMDB_TIMEOUT_MS, 10_000),
      maxRetries: int(env.TMDB_MAX_RETRIES, 3),
    },
    http: {
      host: env.MCP_HTTP_HOST || '127.0.0.1',
      port: int(env.MCP_HTTP_PORT, 3000),
      authToken: env.MCP_HTTP_AUTH_TOKEN || undefined,
      rateLimitPerMinute: int(env.MCP_HTTP_RATE_LIMIT_PER_MINUTE, 60),
    },
  };
}
