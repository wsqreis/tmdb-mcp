import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Config } from '../config.ts';
import { createServer } from '../server.ts';
import type { TmdbClient } from '../tmdb/client.ts';
import { RateLimiter } from './rateLimit.ts';

const MAX_BODY_BYTES = 1_000_000;

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/** Constant-time comparison; hashing first makes both sides the same length. */
function tokenMatches(header: string | undefined, expected: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? '');
  if (!match?.[1]) return false;
  return timingSafeEqual(sha256(match[1]), sha256(expected));
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body));
}

const jsonRpcError = (code: number, message: string) => ({ jsonrpc: '2.0', error: { code, message }, id: null });

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new RangeError('Request body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Streamable HTTP transport in stateless mode: every POST gets a fresh MCP server,
 * so instances can scale horizontally without sticky sessions.
 */
export function createHttpApp(config: Config['http'], client: TmdbClient): Server {
  const { authToken } = config;
  if (!authToken) {
    throw new Error('MCP_HTTP_AUTH_TOKEN is required in HTTP mode, so the server is never exposed without auth.');
  }
  const limiter = new RateLimiter(config.rateLimitPerMinute);

  return createHttpServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;

    if (path === '/healthz' && req.method === 'GET') {
      return sendJson(res, 200, { status: 'ok' });
    }
    if (path !== '/mcp') {
      return sendJson(res, 404, { error: 'Not found' });
    }
    if (!tokenMatches(req.headers.authorization, authToken)) {
      return sendJson(res, 401, jsonRpcError(-32001, 'Unauthorized'), { 'www-authenticate': 'Bearer' });
    }
    const retryAfter = limiter.take(req.socket.remoteAddress ?? 'unknown');
    if (retryAfter > 0) {
      return sendJson(res, 429, jsonRpcError(-32002, 'Rate limit exceeded'), { 'retry-after': String(retryAfter) });
    }
    if (req.method !== 'POST') {
      // Stateless mode has no server-initiated stream (GET) or session to delete (DELETE).
      return sendJson(res, 405, jsonRpcError(-32000, 'Method not allowed'), { allow: 'POST' });
    }

    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      const tooLarge = error instanceof RangeError;
      return sendJson(res, tooLarge ? 413 : 400, jsonRpcError(-32700, tooLarge ? 'Request too large' : 'Parse error'));
    }

    const server = createServer(client);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) sendJson(res, 500, jsonRpcError(-32603, 'Internal server error'));
    }
  });
}
