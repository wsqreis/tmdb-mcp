// Live smoke test against the real TMDB API: `node --env-file=.env scripts/smoke.ts`
// It also prints the response size of each tool next to the raw TMDB payload,
// to show how much the compact outputs save.
import { loadConfig } from '../src/config.ts';
import { TmdbClient } from '../src/tmdb/client.ts';
import { connect, textOf } from '../tests/helpers.ts';

const config = loadConfig();
const client = new TmdbClient(config.tmdb);
if (!client.hasCredentials) {
  console.error('Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY in .env first.');
  process.exit(1);
}

const raw = new TmdbClient({ ...config.tmdb, cacheTtlMs: 0 });
const session = await connect(client);

const checks: Array<{ tool: string; args: Record<string, unknown>; rawPath: string; rawParams?: Record<string, string> }> = [
  { tool: 'search_movies', args: { query: 'Inception' }, rawPath: '/search/movie', rawParams: { query: 'Inception' } },
  { tool: 'get_movie_details', args: { movieId: 27205 }, rawPath: '/movie/27205', rawParams: { append_to_response: 'credits,videos' } },
  { tool: 'get_person_details', args: { personId: 525 }, rawPath: '/person/525', rawParams: { append_to_response: 'combined_credits' } },
  { tool: 'discover', args: { genres: ['sci-fi'], streamingOn: ['Netflix'], minRating: 7 }, rawPath: '/discover/movie', rawParams: { with_genres: '878' } },
  { tool: 'get_watch_providers', args: { mediaType: 'movie', id: 27205 }, rawPath: '/movie/27205/watch/providers' },
];

let failed = false;
for (const check of checks) {
  const result = await session.call(check.tool, check.args);
  const compact = textOf(result).length;
  const original = JSON.stringify(await raw.get(check.rawPath, check.rawParams)).length;
  const status = result.isError ? 'FAIL' : 'ok  ';
  failed ||= Boolean(result.isError);
  console.log(
    `${status} ${check.tool.padEnd(20)} ${String(compact).padStart(7)} chars  (raw TMDB: ${original}, ${Math.round((1 - compact / original) * 100)}% smaller)`,
  );
  if (result.isError) console.log(`     ${textOf(result)}`);
}

await session.close();
process.exit(failed ? 1 : 0);
