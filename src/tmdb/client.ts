import type { Config } from '../config.ts';
import { TtlCache } from './cache.ts';
import type { Genre } from './types.ts';

export class TmdbError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'TmdbError';
    this.status = status;
  }
}

export type QueryParams = Record<string, string | number | boolean | undefined>;

export type TmdbClientOptions = Config['tmdb'] & {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export class TmdbClient {
  readonly language: string;
  readonly region: string;
  readonly #options: TmdbClientOptions;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #cache: TtlCache<unknown>;

  constructor(options: TmdbClientOptions) {
    this.#options = options;
    this.language = options.language;
    this.region = options.region;
    this.#fetch = options.fetch ?? fetch;
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#cache = new TtlCache(options.cacheTtlMs, options.cacheMaxEntries);
  }

  get hasCredentials(): boolean {
    return Boolean(this.#options.readAccessToken || this.#options.apiKey);
  }

  async get<T>(path: string, params: QueryParams = {}): Promise<T> {
    if (!this.hasCredentials) {
      throw new TmdbError(
        401,
        'TMDB credentials are missing. Set TMDB_READ_ACCESS_TOKEN (preferred) or TMDB_API_KEY.',
      );
    }

    const url = this.#buildUrl(path, { language: this.language, ...params });
    const cacheKey = url.toString();
    const cached = this.#cache.get(cacheKey);
    if (cached !== undefined) return cached as T;

    const body = await this.#requestWithRetry(url);
    this.#cache.set(cacheKey, body);
    return body as T;
  }

  /** Genre name -> id lookup, used to let agents pass genres by name. */
  async genres(mediaType: 'movie' | 'tv'): Promise<Genre[]> {
    const { genres } = await this.get<{ genres: Genre[] }>(`/genre/${mediaType}/list`);
    return genres;
  }

  #buildUrl(path: string, params: QueryParams): URL {
    const url = new URL(this.#options.baseUrl.replace(/\/$/, '') + path);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
    // Credentials are added per request, so they never reach the cache key or error messages.
    return url;
  }

  async #requestWithRetry(url: URL): Promise<unknown> {
    const headers: Record<string, string> = { accept: 'application/json' };
    const requestUrl = new URL(url);
    if (this.#options.readAccessToken) {
      headers.authorization = `Bearer ${this.#options.readAccessToken}`;
    } else if (this.#options.apiKey) {
      requestUrl.searchParams.set('api_key', this.#options.apiKey);
    }

    let attempt = 0;
    while (true) {
      let response: Response;
      try {
        response = await this.#fetch(requestUrl, {
          headers,
          signal: AbortSignal.timeout(this.#options.timeoutMs),
        });
      } catch (error) {
        if (attempt >= this.#options.maxRetries) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new TmdbError(0, `Could not reach TMDB: ${reason}`);
        }
        await this.#sleep(this.#backoff(attempt));
        attempt++;
        continue;
      }

      if (response.ok) return response.json();

      if (RETRYABLE_STATUS.has(response.status) && attempt < this.#options.maxRetries) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : this.#backoff(attempt);
        await this.#sleep(delay);
        attempt++;
        continue;
      }

      throw new TmdbError(response.status, await this.#errorMessage(response, url));
    }
  }

  #backoff(attempt: number): number {
    return 250 * 2 ** attempt;
  }

  async #errorMessage(response: Response, url: URL): Promise<string> {
    let detail = '';
    try {
      const body = (await response.json()) as { status_message?: string };
      detail = body.status_message ?? '';
    } catch {
      // Non-JSON error body: fall back to the status text.
    }
    const what = response.status === 404 ? 'Not found' : `TMDB request failed (${response.status})`;
    return `${what}: ${url.pathname.replace(/^\/3/, '')}${detail ? ` - ${detail}` : ''}`;
  }
}
