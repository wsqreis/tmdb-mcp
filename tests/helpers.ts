import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from '../src/config.ts';
import { createServer } from '../src/server.ts';
import { TmdbClient, type TmdbClientOptions } from '../src/tmdb/client.ts';

export type Route = (url: URL) => { status?: number; body: unknown; headers?: Record<string, string> } | undefined;

export type FakeFetch = typeof fetch & { calls: URL[]; headers: Array<Record<string, string>> };

export const MOVIE_GENRES = [
  { id: 28, name: 'Action' },
  { id: 35, name: 'Comedy' },
  { id: 53, name: 'Thriller' },
  { id: 878, name: 'Science Fiction' },
];
export const TV_GENRES = [
  { id: 18, name: 'Drama' },
  { id: 10765, name: 'Sci-Fi & Fantasy' },
];

const genreRoute: Route = (url) => {
  if (url.pathname.endsWith('/genre/movie/list')) return { body: { genres: MOVIE_GENRES } };
  if (url.pathname.endsWith('/genre/tv/list')) return { body: { genres: TV_GENRES } };
  return undefined;
};

/** A fetch stand-in that answers from route handlers and records every request. */
export function fakeFetch(...routes: Route[]): FakeFetch {
  const calls: URL[] = [];
  const headers: Array<Record<string, string>> = [];
  const impl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push(url);
    headers.push((init?.headers ?? {}) as Record<string, string>);
    for (const route of [...routes, genreRoute]) {
      const hit = route(url);
      if (hit) {
        return new Response(JSON.stringify(hit.body), {
          status: hit.status ?? 200,
          headers: { 'content-type': 'application/json', ...hit.headers },
        });
      }
    }
    return new Response(JSON.stringify({ status_message: 'The resource you requested could not be found.' }), {
      status: 404,
    });
  };
  return Object.assign(impl, { calls, headers }) as FakeFetch;
}

export function testClient(fetch: FakeFetch, overrides: Partial<TmdbClientOptions> = {}) {
  return new TmdbClient({
    ...loadConfig({}).tmdb,
    readAccessToken: 'test-token',
    sleep: async () => {},
    ...overrides,
    fetch,
  });
}

/** Connects a real MCP client to the server over an in-memory transport. */
export async function connect(client: TmdbClient) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = createServer(client);
  await server.connect(serverSide);
  const mcp = new Client({ name: 'test', version: '0.0.0' });
  await mcp.connect(clientSide);
  return {
    mcp,
    call: (name: string, args: Record<string, unknown> = {}) =>
      mcp.callTool({ name, arguments: args }) as Promise<CallToolResult>,
    close: async () => {
      await mcp.close();
      await server.close();
    },
  };
}

export const textOf = (result: CallToolResult) =>
  result.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
