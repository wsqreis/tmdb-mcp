import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TmdbClient } from './tmdb/client.ts';
import { registerDetailTools } from './tools/details.ts';
import { registerDiscoveryTools } from './tools/discovery.ts';
import { registerSearchTools } from './tools/search.ts';

export const SERVER_NAME = 'tmdb-mcp';
export const SERVER_VERSION = '0.1.0';

const INSTRUCTIONS = `Tools for The Movie Database (TMDB).
- To answer about a specific title or person, search first to get its id, then call a get_*_details tool.
- For open-ended requests ("a funny 90s movie on Netflix"), use discover with genres and streamingOn instead of searching.
- When showing where to watch, credit JustWatch as the source.
- This product uses the TMDB API but is not endorsed or certified by TMDB.`;

export function createServer(client: TmdbClient): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  registerSearchTools(server, client);
  registerDetailTools(server, client);
  registerDiscoveryTools(server, client);

  server.registerResource(
    'genres',
    'tmdb://genres',
    {
      title: 'TMDB genres',
      description: 'Valid genre names for movies and TV shows, as accepted by the discover tool',
      mimeType: 'application/json',
    },
    async (uri) => {
      const [movie, tv] = await Promise.all([client.genres('movie'), client.genres('tv')]);
      const body = { movie: movie.map((genre) => genre.name), tv: tv.map((genre) => genre.name) };
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(body) }] };
    },
  );

  server.registerPrompt(
    'movie_night',
    {
      title: 'Plan a movie night',
      description: 'Pick three movies for a group, available on the streaming services they have',
      argsSchema: {
        audience: z.string().describe('Who is watching, e.g. "two adults and a 10-year-old"'),
        mood: z.string().describe('What they feel like, e.g. "light comedy", "mind-bending sci-fi"'),
        services: z.string().optional().describe('Comma-separated streaming services they subscribe to'),
        country: z.string().optional().describe('Country code, e.g. "US"'),
      },
    },
    ({ audience, mood, services, country }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Plan a movie night for ${audience}. Mood: ${mood}.` +
              (services ? ` Only suggest movies available on: ${services}${country ? ` in ${country}` : ''}.` : '') +
              '\nUse the discover tool (genres, minRating, streamingOn) to find candidates, check the top ones with ' +
              'get_movie_details, and confirm availability with get_watch_providers. Suggest exactly three movies, ' +
              'one line each on why it fits, plus runtime and where to watch.',
          },
        },
      ],
    }),
  );

  return server;
}
