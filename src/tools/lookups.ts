import type { TmdbClient } from '../tmdb/client.ts';
import { genreIndex, type GenreIndex } from '../tmdb/format.ts';
import { ToolInputError } from './result.ts';

export async function genreIndexes(client: TmdbClient): Promise<{ movie: GenreIndex; tv: GenreIndex }> {
  const [movie, tv] = await Promise.all([client.genres('movie'), client.genres('tv')]);
  return { movie: genreIndex(movie), tv: genreIndex(tv) };
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Resolves human names (e.g. "sci-fi", "Netflix") to TMDB ids, with a helpful error on misses. */
function resolveNames(
  wanted: string[],
  available: Array<{ id: number; name: string }>,
  kind: string,
  aliases: Record<string, string> = {},
): number[] {
  const byName = new Map(available.map((item) => [normalize(item.name), item.id]));
  return wanted.map((name) => {
    const key = normalize(aliases[normalize(name)] ?? name);
    const id = byName.get(key);
    if (id === undefined) {
      const options = available.map((item) => item.name).slice(0, 40).join(', ');
      throw new ToolInputError(`Unknown ${kind} "${name}". Valid options include: ${options}.`);
    }
    return id;
  });
}

const GENRE_ALIASES: Record<string, string> = {
  scifi: 'Science Fiction',
  sf: 'Science Fiction',
  romcom: 'Romance',
  animated: 'Animation',
  doc: 'Documentary',
  documentaries: 'Documentary',
};

const TV_GENRE_ALIASES: Record<string, string> = {
  ...GENRE_ALIASES,
  scifi: 'Sci-Fi & Fantasy',
  sciencefiction: 'Sci-Fi & Fantasy',
  fantasy: 'Sci-Fi & Fantasy',
  action: 'Action & Adventure',
  adventure: 'Action & Adventure',
  war: 'War & Politics',
};

export async function resolveGenres(
  client: TmdbClient,
  mediaType: 'movie' | 'tv',
  names: string[],
): Promise<number[]> {
  if (names.length === 0) return [];
  const genres = await client.genres(mediaType);
  return resolveNames(names, genres, `${mediaType} genre`, mediaType === 'tv' ? TV_GENRE_ALIASES : GENRE_ALIASES);
}

export async function resolveProviders(
  client: TmdbClient,
  mediaType: 'movie' | 'tv',
  region: string,
  names: string[],
): Promise<number[]> {
  if (names.length === 0) return [];
  const { results } = await client.get<{ results: Array<{ provider_id: number; provider_name: string }> }>(
    `/watch/providers/${mediaType}`,
    { watch_region: region },
  );
  const providers = results.map((provider) => ({ id: provider.provider_id, name: provider.provider_name }));
  return resolveNames(names, providers, `streaming provider in ${region}`);
}
