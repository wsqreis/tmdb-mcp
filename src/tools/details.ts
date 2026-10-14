import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { movieDetails, personDetails, tvDetails, watchProviders } from '../schemas.ts';
import type { TmdbClient } from '../tmdb/client.ts';
import { toMovieDetails, toPersonDetails, toTvDetails, toWatchProviders } from '../tmdb/format.ts';
import type { RawMovieDetails, RawPersonDetails, RawTvDetails, RawWatchProviders } from '../tmdb/types.ts';
import { READ_ONLY, run } from './result.ts';

const id = z.number().int().positive();

export function registerDetailTools(server: McpServer, client: TmdbClient): void {
  server.registerTool(
    'get_movie_details',
    {
      title: 'Movie details',
      description:
        'Full details for one movie in a single call: runtime, genres, score, directors, writers, top cast, budget, revenue and trailer.',
      inputSchema: { movieId: id.describe('TMDB movie id (from search_movies or discover)') },
      outputSchema: movieDetails,
      annotations: READ_ONLY,
    },
    ({ movieId }) =>
      run(async () =>
        toMovieDetails(
          await client.get<RawMovieDetails>(`/movie/${movieId}`, { append_to_response: 'credits,videos' }),
        ),
      ),
  );

  server.registerTool(
    'get_tv_show_details',
    {
      title: 'TV show details',
      description: 'Full details for one TV series: status, seasons, episodes, networks, creators, top cast and score.',
      inputSchema: { tvId: id.describe('TMDB TV show id (from search_tv_shows or discover)') },
      outputSchema: tvDetails,
      annotations: READ_ONLY,
    },
    ({ tvId }) =>
      run(async () =>
        toTvDetails(await client.get<RawTvDetails>(`/tv/${tvId}`, { append_to_response: 'credits' })),
      ),
  );

  server.registerTool(
    'get_person_details',
    {
      title: 'Person details',
      description:
        'Biography and the 15 best-known movies/shows of an actor or crew member, with the role they had in each.',
      inputSchema: { personId: id.describe('TMDB person id (from search_people)') },
      outputSchema: personDetails,
      annotations: READ_ONLY,
    },
    ({ personId }) =>
      run(async () =>
        toPersonDetails(
          await client.get<RawPersonDetails>(`/person/${personId}`, { append_to_response: 'combined_credits' }),
        ),
      ),
  );

  server.registerTool(
    'get_watch_providers',
    {
      title: 'Where to watch',
      description:
        'Where a movie or show can be streamed, rented or bought in a country. ' +
        'Data comes from JustWatch; mention that source when showing it to users.',
      inputSchema: {
        mediaType: z.enum(['movie', 'tv']),
        id: id.describe('TMDB movie or TV show id'),
        region: z
          .string()
          .regex(/^[A-Za-z]{2}$/)
          .optional()
          .describe('ISO 3166-1 country code, e.g. "US", "GB", "DE". Defaults to the server region.'),
      },
      outputSchema: watchProviders,
      annotations: READ_ONLY,
    },
    ({ mediaType, id, region }) =>
      run(async () => {
        const raw = await client.get<RawWatchProviders>(`/${mediaType}/${id}/watch/providers`);
        return toWatchProviders(raw, (region ?? client.region).toUpperCase());
      }),
  );
}
