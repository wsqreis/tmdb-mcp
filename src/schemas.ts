import { z } from 'zod';

// Output shapes are deliberately compact: agents pay for every token we return,
// so raw TMDB payloads are trimmed to the fields that help answer questions.

const year = z.number().int().nullable().describe('Release / first-air year');
const rating = z.number().nullable().describe('TMDB user score, 0-10');
const votes = z.number().int().describe('Number of TMDB votes behind the score');

export const movieSummary = z.object({
  id: z.number().int(),
  title: z.string(),
  year,
  rating,
  votes,
  genres: z.array(z.string()),
  overview: z.string(),
});

export const tvSummary = z.object({
  id: z.number().int(),
  name: z.string(),
  year,
  rating,
  votes,
  genres: z.array(z.string()),
  overview: z.string(),
});

export const personSummary = z.object({
  id: z.number().int(),
  name: z.string(),
  department: z.string().nullable(),
  knownFor: z.array(z.string()),
});

const castMember = z.object({ name: z.string(), character: z.string().nullable() });

export const movieDetails = z.object({
  id: z.number().int(),
  title: z.string(),
  tagline: z.string().nullable(),
  releaseDate: z.string().nullable(),
  runtimeMinutes: z.number().int().nullable(),
  genres: z.array(z.string()),
  rating,
  votes,
  overview: z.string(),
  originalLanguage: z.string().nullable(),
  directors: z.array(z.string()),
  writers: z.array(z.string()),
  topCast: z.array(castMember),
  budgetUsd: z.number().nullable(),
  revenueUsd: z.number().nullable(),
  imdbId: z.string().nullable(),
  trailerUrl: z.string().nullable(),
});

export const tvDetails = z.object({
  id: z.number().int(),
  name: z.string(),
  firstAirDate: z.string().nullable(),
  lastAirDate: z.string().nullable(),
  status: z.string().nullable(),
  seasons: z.number().int().nullable(),
  episodes: z.number().int().nullable(),
  episodeRuntimeMinutes: z.number().int().nullable(),
  genres: z.array(z.string()),
  networks: z.array(z.string()),
  creators: z.array(z.string()),
  topCast: z.array(castMember),
  rating,
  votes,
  overview: z.string(),
});

export const personCredit = z.object({
  id: z.number().int(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string(),
  year,
  role: z.string().nullable().describe('Character played or crew job'),
});

export const personDetails = z.object({
  id: z.number().int(),
  name: z.string(),
  birthday: z.string().nullable(),
  deathday: z.string().nullable(),
  placeOfBirth: z.string().nullable(),
  department: z.string().nullable(),
  biography: z.string(),
  notableCredits: z.array(personCredit),
});

export const watchProviders = z.object({
  region: z.string(),
  available: z.boolean(),
  link: z.string().nullable().describe('TMDB page listing all offers for this title'),
  subscription: z.array(z.string()),
  free: z.array(z.string()),
  withAds: z.array(z.string()),
  rent: z.array(z.string()),
  buy: z.array(z.string()),
  attribution: z.string(),
});

export const paged = <T extends z.ZodType>(item: T) =>
  z.object({
    page: z.number().int(),
    totalPages: z.number().int(),
    totalResults: z.number().int(),
    results: z.array(item),
  });

/** Movie or TV result in one shape, for tools that work with either. */
export const titleSummary = z.object({
  mediaType: z.enum(['movie', 'tv']),
  id: z.number().int(),
  title: z.string(),
  year,
  rating,
  votes,
  genres: z.array(z.string()),
  overview: z.string(),
});

export const trendingItem = z.object({
  mediaType: z.enum(['movie', 'tv', 'person']),
  id: z.number().int(),
  title: z.string(),
  year,
  rating,
  overview: z.string(),
});

export type MovieSummary = z.infer<typeof movieSummary>;
export type TvSummary = z.infer<typeof tvSummary>;
export type PersonSummary = z.infer<typeof personSummary>;
export type MovieDetails = z.infer<typeof movieDetails>;
export type TvDetails = z.infer<typeof tvDetails>;
export type PersonDetails = z.infer<typeof personDetails>;
export type PersonCredit = z.infer<typeof personCredit>;
export type WatchProviders = z.infer<typeof watchProviders>;
export type TitleSummary = z.infer<typeof titleSummary>;
export type TrendingItem = z.infer<typeof trendingItem>;
