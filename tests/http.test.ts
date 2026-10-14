import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createHttpApp } from '../src/http/app.ts';
import { RateLimiter } from '../src/http/rateLimit.ts';
import { fakeFetch, testClient } from './helpers.ts';

const TOKEN = 'secret';

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
};

describe('HTTP transport', () => {
  let base: string;
  const app = createHttpApp(
    { host: '127.0.0.1', port: 0, authToken: TOKEN, rateLimitPerMinute: 3 },
    testClient(fakeFetch()),
  );

  before(async () => {
    await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  });
  after(() => new Promise<void>((resolve) => app.close(() => resolve())));

  const post = (body: unknown, token: string | null = TOKEN) =>
    fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  it('refuses to start without an auth token', () => {
    assert.throws(
      () => createHttpApp({ host: '127.0.0.1', port: 0, rateLimitPerMinute: 60 }, testClient(fakeFetch())),
      /MCP_HTTP_AUTH_TOKEN is required/,
    );
  });

  it('answers the health check without auth', async () => {
    const response = await fetch(`${base}/healthz`);
    assert.equal(response.status, 200);
  });

  it('rejects requests without a valid bearer token', async () => {
    assert.equal((await post(initialize, null)).status, 401);
    assert.equal((await post(initialize, 'wrong')).status, 401);
  });

  // Runs last: it spends the 3 requests/minute budget.
  it('handles MCP initialize, then rate-limits the client', async () => {
    const ok = await post(initialize);
    assert.equal(ok.status, 200);
    assert.match(await ok.text(), /"serverInfo":\{"name":"tmdb-mcp"/);

    await post(initialize);
    await post(initialize);
    const limited = await post(initialize);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
  });
});

describe('RateLimiter', () => {
  it('refills tokens over time', () => {
    let now = 0;
    const limiter = new RateLimiter(60, () => now); // one token per second
    for (let i = 0; i < 60; i++) assert.equal(limiter.take('ip'), 0);
    assert.equal(limiter.take('ip'), 1);
    now = 1000;
    assert.equal(limiter.take('ip'), 0);
  });

  it('tracks clients independently', () => {
    const limiter = new RateLimiter(1);
    assert.equal(limiter.take('a'), 0);
    assert.ok(limiter.take('a') > 0);
    assert.equal(limiter.take('b'), 0);
  });
});
