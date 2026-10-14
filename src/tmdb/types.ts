// Partial shapes of TMDB v3 responses: only the fields this server reads.

export type Genre = { id: number; name: string };

export type Paged<T> = {
  page: number;
  total_pages: number;
  total_results: number;
  results: T[];
};

export type RawMovie = {
  id: number;
  title: string;
  release_date?: string;
  overview?: string;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
  media_type?: string;
};

export type RawTv = {
  id: number;
  name: string;
  first_air_date?: string;
  overview?: string;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
  media_type?: string;
};

export type RawPerson = {
  id: number;
  name: string;
  known_for_department?: string;
  known_for?: Array<{ title?: string; name?: string }>;
  media_type?: string;
};

export type RawCast = { name: string; character?: string; order?: number };
export type RawCrew = { name: string; job?: string };

export type RawMovieDetails = RawMovie & {
  tagline?: string;
  runtime?: number;
  genres?: Genre[];
  original_language?: string;
  budget?: number;
  revenue?: number;
  imdb_id?: string;
  homepage?: string;
  credits?: { cast?: RawCast[]; crew?: RawCrew[] };
  videos?: { results?: Array<{ key: string; site: string; type: string; official?: boolean }> };
};

export type RawTvDetails = RawTv & {
  last_air_date?: string;
  status?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  genres?: Genre[];
  networks?: Array<{ name: string }>;
  created_by?: Array<{ name: string }>;
  credits?: { cast?: RawCast[] };
};

export type RawPersonCredit = {
  id: number;
  media_type: 'movie' | 'tv';
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  character?: string;
  job?: string;
  vote_count?: number;
};

export type RawPersonDetails = {
  id: number;
  name: string;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  known_for_department?: string;
  biography?: string;
  combined_credits?: { cast?: RawPersonCredit[]; crew?: RawPersonCredit[] };
};

export type RawProvider = { provider_name: string };

export type RawWatchProviders = {
  results?: Record<
    string,
    {
      link?: string;
      flatrate?: RawProvider[];
      free?: RawProvider[];
      ads?: RawProvider[];
      rent?: RawProvider[];
      buy?: RawProvider[];
    }
  >;
};
