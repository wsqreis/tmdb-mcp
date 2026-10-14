import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { movieSummary, paged, personSummary, tvSummary } from '../schemas.ts';
import type { TmdbClient } from '../tmdb/client.ts';
import { toMovieSummary, toPersonSummary, toTvSummary } from '../tmdb/format.ts';
import type { Paged, RawMovie, RawPerson, RawTv } from '../tmdb/types.ts';
import { genreIndexes } from './lookups.ts';
import { READ_ONLY, run } from './result.ts';

const page = z.number().int().min(1).max(500).default(1).describe('Results page (20 per page)');

const pageInfo = <T>(raw: Paged<unknown>, results: T[]) => ({
  page: raw.page,
  totalPages: raw.total_pages,
  totalResults: raw.total_results,
  results,
});

export function registerSearchTools(server: McpServer, client: TmdbClient): void {
  server.registerTool(
    'search_movies',
    {
      title: 'Search movies',
      description:
        'Find movies by title (fuzzy). Returns ids to use with get_movie_details, get_recommendations and get_watch_providers. ' +
        'Pass `year` to disambiguate remakes.',
      inputSchema: {
        query: z.string().min(1).describe('Movie title or part of it'),
        year: z.number().int().min(1870).max(2100).optional().describe('Release year'),
        page,
      },
      outputSchema: paged(movieSummary),
      annotations: READ_ONLY,
    },
    ({ query, year, page }) =>
      run(async () => {
        const [raw, genres] = await Promise.all([
          client.get<Paged<RawMovie>>('/search/movie', { query, year, page, include_adult: false }),
          genreIndexes(client),
        ]);
        return pageInfo(raw, raw.results.map((movie) => toMovieSummary(movie, genres.movie)));
      }),
  );

  server.registerTool(
    'search_tv_shows',
    {
      title: 'Search TV shows',
      description: 'Find TV series by name (fuzzy). Returns ids to use with get_tv_show_details and other tools.',
      inputSchema: {
        query: z.string().min(1).describe('Show name or part of it'),
        firstAirYear: z.number().int().min(1920).max(2100).optional().describe('Year the show first aired'),
        page,
      },
      outputSchema: paged(tvSummary),
      annotations: READ_ONLY,
    },
    ({ query, firstAirYear, page }) =>
      run(async () => {
        const [raw, genres] = await Promise.all([
          client.get<Paged<RawTv>>('/search/tv', {
            query,
            first_air_date_year: firstAirYear,
            page,
            include_adult: false,
          }),
          genreIndexes(client),
        ]);
        return pageInfo(raw, raw.results.map((show) => toTvSummary(show, genres.tv)));
      }),
  );

  server.registerTool(
    'search_people',
    {
      title: 'Search people',
      description: 'Find actors, directors and other crew by name. Returns ids to use with get_person_details.',
      inputSchema: {
        query: z.string().min(1).describe('Person name'),
        page,
      },
      outputSchema: paged(personSummary),
      annotations: READ_ONLY,
    },
    ({ query, page }) =>
      run(async () => {
        const raw = await client.get<Paged<RawPerson>>('/search/person', { query, page, include_adult: false });
        return pageInfo(raw, raw.results.map(toPersonSummary));
      }),
  );
}
