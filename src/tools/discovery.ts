import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { paged, titleSummary, trendingItem } from '../schemas.ts';
import type { QueryParams, TmdbClient } from '../tmdb/client.ts';
import { toTitleSummary, toTrendingItem } from '../tmdb/format.ts';
import type { Paged, RawMovie, RawPerson, RawTv } from '../tmdb/types.ts';
import { genreIndexes, resolveGenres, resolveProviders } from './lookups.ts';
import { READ_ONLY, run } from './result.ts';

const SORT = {
  popularity: 'popularity.desc',
  rating: 'vote_average.desc',
  newest: { movie: 'primary_release_date.desc', tv: 'first_air_date.desc' },
  revenue: 'revenue.desc',
} as const;

export function registerDiscoveryTools(server: McpServer, client: TmdbClient): void {
  server.registerTool(
    'discover',
    {
      title: 'Discover movies or TV shows',
      description:
        'Find titles by criteria instead of by name: genres (by name, e.g. "sci-fi", "comedy"), year range, minimum score, ' +
        'max runtime, original language and streaming service (e.g. "Netflix") in a country. ' +
        'Best tool for requests like "a good 90s thriller on Netflix under 2 hours".',
      inputSchema: {
        mediaType: z.enum(['movie', 'tv']).default('movie'),
        genres: z.array(z.string()).default([]).describe('All of these genres must match'),
        excludeGenres: z.array(z.string()).default([]),
        yearFrom: z.number().int().min(1870).max(2100).optional(),
        yearTo: z.number().int().min(1870).max(2100).optional(),
        minRating: z.number().min(0).max(10).optional().describe('Minimum TMDB score, 0-10'),
        minVotes: z
          .number()
          .int()
          .min(0)
          .default(200)
          .describe('Minimum vote count; keeps obscure titles with a handful of votes out of rating sorts'),
        maxRuntimeMinutes: z.number().int().positive().optional(),
        originalLanguage: z
          .string()
          .regex(/^[a-z]{2}$/)
          .optional()
          .describe('ISO 639-1 code of the original language, e.g. "ko" for Korean'),
        streamingOn: z
          .array(z.string())
          .default([])
          .describe('Streaming services by name; matches titles available on ANY of them in `region`'),
        region: z
          .string()
          .regex(/^[A-Za-z]{2}$/)
          .optional()
          .describe('Country for `streamingOn`, ISO 3166-1 (default: server region)'),
        sortBy: z.enum(['popularity', 'rating', 'newest', 'revenue']).default('popularity'),
        page: z.number().int().min(1).max(500).default(1),
      },
      outputSchema: paged(titleSummary),
      annotations: READ_ONLY,
    },
    (args) =>
      run(async () => {
        const { mediaType } = args;
        const region = (args.region ?? client.region).toUpperCase();
        const [withGenres, withoutGenres, providers, genres] = await Promise.all([
          resolveGenres(client, mediaType, args.genres),
          resolveGenres(client, mediaType, args.excludeGenres),
          resolveProviders(client, mediaType, region, args.streamingOn),
          genreIndexes(client),
        ]);

        const dateField = mediaType === 'movie' ? 'primary_release_date' : 'first_air_date';
        const sort = args.sortBy === 'newest' ? SORT.newest[mediaType] : SORT[args.sortBy];
        const params: QueryParams = {
          with_genres: withGenres.join(','),
          without_genres: withoutGenres.join(','),
          [`${dateField}.gte`]: args.yearFrom ? `${args.yearFrom}-01-01` : undefined,
          [`${dateField}.lte`]: args.yearTo ? `${args.yearTo}-12-31` : undefined,
          'vote_average.gte': args.minRating,
          'vote_count.gte': args.minVotes,
          'with_runtime.lte': args.maxRuntimeMinutes,
          with_original_language: args.originalLanguage,
          with_watch_providers: providers.join('|'),
          watch_region: providers.length ? region : undefined,
          // TMDB has no revenue sort for TV; fall back to popularity.
          sort_by: mediaType === 'tv' && args.sortBy === 'revenue' ? SORT.popularity : sort,
          include_adult: false,
          page: args.page,
        };

        const raw = await client.get<Paged<RawMovie | RawTv>>(`/discover/${mediaType}`, params);
        return {
          page: raw.page,
          totalPages: raw.total_pages,
          totalResults: raw.total_results,
          results: raw.results.map((item) => toTitleSummary(mediaType, item, genres[mediaType])),
        };
      }),
  );

  server.registerTool(
    'get_trending',
    {
      title: 'Trending now',
      description: 'What is trending on TMDB today or this week: movies, TV shows, people, or all of them mixed.',
      inputSchema: {
        mediaType: z.enum(['all', 'movie', 'tv', 'person']).default('all'),
        timeWindow: z.enum(['day', 'week']).default('week'),
      },
      outputSchema: z.object({ results: z.array(trendingItem) }),
      annotations: READ_ONLY,
    },
    ({ mediaType, timeWindow }) =>
      run(async () => {
        const [raw, genres] = await Promise.all([
          client.get<Paged<RawMovie | RawTv | RawPerson>>(`/trending/${mediaType}/${timeWindow}`),
          genreIndexes(client),
        ]);
        const results = raw.results
          // Single-type endpoints omit media_type, so fill it in from the request.
          .map((item) => (mediaType === 'all' ? item : { ...item, media_type: mediaType }))
          .map((item) => toTrendingItem(item, genres.movie, genres.tv))
          .filter((item) => item !== null);
        return { results };
      }),
  );

  server.registerTool(
    'get_recommendations',
    {
      title: 'Similar titles',
      description:
        'Titles that people who liked a given movie or show also liked. Use for "something like X" requests; ' +
        'combine with get_watch_providers to check availability.',
      inputSchema: {
        mediaType: z.enum(['movie', 'tv']),
        id: z.number().int().positive().describe('TMDB id of the title to base recommendations on'),
        page: z.number().int().min(1).max(500).default(1),
      },
      outputSchema: paged(titleSummary),
      annotations: READ_ONLY,
    },
    ({ mediaType, id, page }) =>
      run(async () => {
        const [raw, genres] = await Promise.all([
          client.get<Paged<RawMovie | RawTv>>(`/${mediaType}/${id}/recommendations`, { page }),
          genreIndexes(client),
        ]);
        return {
          page: raw.page,
          totalPages: raw.total_pages,
          totalResults: raw.total_results,
          results: raw.results.map((item) => toTitleSummary(mediaType, item, genres[mediaType])),
        };
      }),
  );
}
