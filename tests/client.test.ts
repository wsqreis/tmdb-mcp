import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TmdbError } from '../src/tmdb/client.ts';
import { TtlCache } from '../src/tmdb/cache.ts';
import { fakeFetch, testClient } from './helpers.ts';

const movieRoute = (url: URL) => (url.pathname.endsWith('/movie/550') ? { body: { id: 550 } } : undefined);

describe('TmdbClient', () => {
  it('sends the read access token as a bearer header, never in the URL', async () => {
    const fetch = fakeFetch(movieRoute);
    await testClient(fetch).get('/movie/550');
    assert.equal(fetch.headers[0]?.authorization, 'Bearer test-token');
    assert.equal(fetch.calls[0]?.searchParams.has('api_key'), false);
  });

  it('falls back to the v3 api key as a query parameter', async () => {
    const fetch = fakeFetch(movieRoute);
    await testClient(fetch, { readAccessToken: undefined, apiKey: 'v3-key' }).get('/movie/550');
    assert.equal(fetch.calls[0]?.searchParams.get('api_key'), 'v3-key');
    assert.equal(fetch.headers[0]?.authorization, undefined);
  });

  it('adds the configured language and drops undefined params', async () => {
    const fetch = fakeFetch(() => ({ body: {} }));
    await testClient(fetch, { language: 'de-DE' }).get('/search/movie', { query: 'Heat', year: undefined });
    const url = fetch.calls[0]!;
    assert.equal(url.searchParams.get('language'), 'de-DE');
    assert.equal(url.searchParams.get('query'), 'Heat');
    assert.equal(url.searchParams.has('year'), false);
  });

  it('serves repeated requests from the cache', async () => {
    const fetch = fakeFetch(movieRoute);
    const client = testClient(fetch);
    await client.get('/movie/550');
    await client.get('/movie/550');
    assert.equal(fetch.calls.length, 1);
  });

  it('retries on 429 honoring Retry-After, then succeeds', async () => {
    let attempts = 0;
    const waits: number[] = [];
    const fetch = fakeFetch(() =>
      ++attempts < 3 ? { status: 429, body: {}, headers: { 'retry-after': '2' } } : { body: { ok: true } },
    );
    const client = testClient(fetch, {
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    const result = await client.get<{ ok: boolean }>('/anything');
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(waits, [2000, 2000]);
  });

  it('gives up after maxRetries and reports the status', async () => {
    const fetch = fakeFetch(() => ({ status: 503, body: {} }));
    await assert.rejects(testClient(fetch, { maxRetries: 2 }).get('/x'), (error: TmdbError) => {
      assert.equal(error.status, 503);
      return true;
    });
    assert.equal(fetch.calls.length, 3);
  });

  it('does not retry a 404 and keeps credentials out of the error', async () => {
    const fetch = fakeFetch();
    await assert.rejects(
      testClient(fetch, { readAccessToken: undefined, apiKey: 'secret-key' }).get('/movie/999999'),
      (error: TmdbError) => {
        assert.equal(error.status, 404);
        assert.match(error.message, /Not found: \/movie\/999999/);
        assert.doesNotMatch(error.message, /secret-key/);
        return true;
      },
    );
    assert.equal(fetch.calls.length, 1);
  });

  it('fails fast with a clear message when credentials are missing', async () => {
    const fetch = fakeFetch();
    await assert.rejects(testClient(fetch, { readAccessToken: undefined }).get('/x'), /TMDB credentials are missing/);
    assert.equal(fetch.calls.length, 0);
  });
});

describe('TtlCache', () => {
  it('expires entries after the TTL', () => {
    let now = 0;
    const cache = new TtlCache<string>(1000, 10, () => now);
    cache.set('a', '1');
    now = 999;
    assert.equal(cache.get('a'), '1');
    now = 2000;
    assert.equal(cache.get('a'), undefined);
  });

  it('evicts the least recently used entry when full', () => {
    const cache = new TtlCache<number>(60_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // "a" is now the most recently used
    cache.set('c', 3);
    assert.equal(cache.get('b'), undefined);
    assert.equal(cache.get('a'), 1);
    assert.equal(cache.get('c'), 3);
  });
});
