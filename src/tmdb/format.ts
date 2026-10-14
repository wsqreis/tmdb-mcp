import type {
  MovieDetails,
  MovieSummary,
  PersonCredit,
  PersonDetails,
  PersonSummary,
  TitleSummary,
  TrendingItem,
  TvDetails,
  TvSummary,
  WatchProviders,
} from '../schemas.ts';
import type {
  Genre,
  RawCast,
  RawMovie,
  RawMovieDetails,
  RawPerson,
  RawPersonCredit,
  RawPersonDetails,
  RawProvider,
  RawTv,
  RawTvDetails,
  RawWatchProviders,
} from './types.ts';

const OVERVIEW_MAX = 300;
const BIOGRAPHY_MAX = 800;
const TOP_CAST = 8;
const NOTABLE_CREDITS = 15;

export const JUSTWATCH_ATTRIBUTION = 'Streaming availability data provided by JustWatch via TMDB.';

export function truncate(text: string | undefined, max: number): string {
  const clean = (text ?? '').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}…`;
}

export function yearOf(date: string | undefined | null): number | null {
  if (!date) return null;
  const year = Number.parseInt(date.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

const score = (value: number | undefined): number | null =>
  value === undefined || value === 0 ? null : Math.round(value * 10) / 10;

const nullable = <T>(value: T | undefined | null | ''): T | null =>
  value === undefined || value === '' ? null : value;

export type GenreIndex = Map<number, string>;

export const genreIndex = (genres: Genre[]): GenreIndex =>
  new Map(genres.map((genre) => [genre.id, genre.name]));

const genreNames = (ids: number[] | undefined, index: GenreIndex): string[] =>
  (ids ?? []).map((id) => index.get(id)).filter((name): name is string => Boolean(name));

export function toMovieSummary(movie: RawMovie, genres: GenreIndex): MovieSummary {
  return {
    id: movie.id,
    title: movie.title,
    year: yearOf(movie.release_date),
    rating: score(movie.vote_average),
    votes: movie.vote_count ?? 0,
    genres: genreNames(movie.genre_ids, genres),
    overview: truncate(movie.overview, OVERVIEW_MAX),
  };
}

export function toTvSummary(show: RawTv, genres: GenreIndex): TvSummary {
  return {
    id: show.id,
    name: show.name,
    year: yearOf(show.first_air_date),
    rating: score(show.vote_average),
    votes: show.vote_count ?? 0,
    genres: genreNames(show.genre_ids, genres),
    overview: truncate(show.overview, OVERVIEW_MAX),
  };
}

export function toTitleSummary(
  mediaType: 'movie' | 'tv',
  item: RawMovie | RawTv,
  genres: GenreIndex,
): TitleSummary {
  if (mediaType === 'movie') {
    const { title, ...rest } = toMovieSummary(item as RawMovie, genres);
    return { mediaType, ...rest, title };
  }
  const { name, ...rest } = toTvSummary(item as RawTv, genres);
  return { mediaType, ...rest, title: name };
}

export function toPersonSummary(person: RawPerson): PersonSummary {
  return {
    id: person.id,
    name: person.name,
    department: nullable(person.known_for_department),
    knownFor: (person.known_for ?? [])
      .map((work) => work.title ?? work.name)
      .filter((title): title is string => Boolean(title)),
  };
}

const topCast = (cast: RawCast[] | undefined) =>
  [...(cast ?? [])]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, TOP_CAST)
    .map((member) => ({ name: member.name, character: nullable(member.character) }));

export function toMovieDetails(movie: RawMovieDetails): MovieDetails {
  const crew = movie.credits?.crew ?? [];
  const namesFor = (jobs: string[]) => [
    ...new Set(crew.filter((member) => jobs.includes(member.job ?? '')).map((member) => member.name)),
  ];
  const trailer = (movie.videos?.results ?? [])
    .filter((video) => video.site === 'YouTube' && video.type === 'Trailer')
    .sort((a, b) => Number(b.official ?? false) - Number(a.official ?? false))[0];

  return {
    id: movie.id,
    title: movie.title,
    tagline: nullable(movie.tagline),
    releaseDate: nullable(movie.release_date),
    runtimeMinutes: movie.runtime || null,
    genres: (movie.genres ?? []).map((genre) => genre.name),
    rating: score(movie.vote_average),
    votes: movie.vote_count ?? 0,
    overview: truncate(movie.overview, OVERVIEW_MAX * 2),
    originalLanguage: nullable(movie.original_language),
    directors: namesFor(['Director']),
    writers: namesFor(['Screenplay', 'Writer', 'Story', 'Novel']),
    topCast: topCast(movie.credits?.cast),
    budgetUsd: movie.budget || null,
    revenueUsd: movie.revenue || null,
    imdbId: nullable(movie.imdb_id),
    trailerUrl: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null,
  };
}

export function toTvDetails(show: RawTvDetails): TvDetails {
  return {
    id: show.id,
    name: show.name,
    firstAirDate: nullable(show.first_air_date),
    lastAirDate: nullable(show.last_air_date),
    status: nullable(show.status),
    seasons: show.number_of_seasons ?? null,
    episodes: show.number_of_episodes ?? null,
    episodeRuntimeMinutes: show.episode_run_time?.[0] ?? null,
    genres: (show.genres ?? []).map((genre) => genre.name),
    networks: (show.networks ?? []).map((network) => network.name),
    creators: (show.created_by ?? []).map((creator) => creator.name),
    topCast: topCast(show.credits?.cast),
    rating: score(show.vote_average),
    votes: show.vote_count ?? 0,
    overview: truncate(show.overview, OVERVIEW_MAX * 2),
  };
}

const toCredit = (credit: RawPersonCredit): PersonCredit => ({
  id: credit.id,
  mediaType: credit.media_type,
  title: credit.title ?? credit.name ?? 'Untitled',
  year: yearOf(credit.release_date ?? credit.first_air_date),
  role: nullable(credit.character ?? credit.job),
});

export function toPersonDetails(person: RawPersonDetails): PersonDetails {
  const credits = [
    ...(person.combined_credits?.cast ?? []),
    ...(person.combined_credits?.crew ?? []),
  ];
  // vote_count is a decent proxy for "how well known is this work".
  // A person can appear twice for one title (e.g. director and writer); keep the first.
  const seen = new Set<string>();
  const notable = credits
    .filter((credit) => credit.media_type === 'movie' || credit.media_type === 'tv')
    .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
    .filter((credit) => {
      const key = `${credit.media_type}:${credit.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, NOTABLE_CREDITS)
    .map(toCredit);

  return {
    id: person.id,
    name: person.name,
    birthday: nullable(person.birthday),
    deathday: nullable(person.deathday),
    placeOfBirth: nullable(person.place_of_birth),
    department: nullable(person.known_for_department),
    biography: truncate(person.biography, BIOGRAPHY_MAX),
    notableCredits: notable,
  };
}

const providerNames = (providers: RawProvider[] | undefined) =>
  (providers ?? []).map((provider) => provider.provider_name);

export function toWatchProviders(raw: RawWatchProviders, region: string): WatchProviders {
  const offer = raw.results?.[region];
  return {
    region,
    available: Boolean(offer),
    link: nullable(offer?.link),
    subscription: providerNames(offer?.flatrate),
    free: providerNames(offer?.free),
    withAds: providerNames(offer?.ads),
    rent: providerNames(offer?.rent),
    buy: providerNames(offer?.buy),
    attribution: JUSTWATCH_ATTRIBUTION,
  };
}

export function toTrendingItem(
  item: RawMovie | RawTv | RawPerson,
  movieGenres: GenreIndex,
  tvGenres: GenreIndex,
): TrendingItem | null {
  if (item.media_type === 'movie') {
    const movie = toMovieSummary(item as RawMovie, movieGenres);
    return { mediaType: 'movie', id: movie.id, title: movie.title, year: movie.year, rating: movie.rating, overview: movie.overview };
  }
  if (item.media_type === 'tv') {
    const show = toTvSummary(item as RawTv, tvGenres);
    return { mediaType: 'tv', id: show.id, title: show.name, year: show.year, rating: show.rating, overview: show.overview };
  }
  if (item.media_type === 'person') {
    const person = toPersonSummary(item as RawPerson);
    return {
      mediaType: 'person',
      id: person.id,
      title: person.name,
      year: null,
      rating: null,
      overview: person.knownFor.length ? `Known for: ${person.knownFor.join(', ')}` : '',
    };
  }
  return null;
}
