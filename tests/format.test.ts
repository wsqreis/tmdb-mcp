import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toMovieDetails, toPersonDetails, toWatchProviders, truncate, yearOf } from '../src/tmdb/format.ts';

describe('format', () => {
  it('truncates long text at a word boundary', () => {
    const text = 'one two three four five six seven eight nine ten';
    assert.equal(truncate(text, 20), 'one two three four…');
    assert.equal(truncate('short', 20), 'short');
    assert.equal(truncate(undefined, 20), '');
  });

  it('parses the year from TMDB dates, tolerating empty strings', () => {
    assert.equal(yearOf('1994-09-23'), 1994);
    assert.equal(yearOf(''), null);
    assert.equal(yearOf(undefined), null);
  });

  it('extracts directors, writers, ordered cast and the official trailer', () => {
    const details = toMovieDetails({
      id: 1,
      title: 'Film',
      credits: {
        cast: [
          { name: 'Second', character: 'B', order: 1 },
          { name: 'First', character: 'A', order: 0 },
        ],
        crew: [
          { name: 'Dir', job: 'Director' },
          { name: 'Dir', job: 'Screenplay' },
          { name: 'Composer', job: 'Original Music Composer' },
        ],
      },
      videos: {
        results: [
          { key: 'teaser', site: 'YouTube', type: 'Teaser' },
          { key: 'fan', site: 'YouTube', type: 'Trailer', official: false },
          { key: 'official', site: 'YouTube', type: 'Trailer', official: true },
        ],
      },
      budget: 0,
      tagline: '',
    });
    assert.deepEqual(details.directors, ['Dir']);
    assert.deepEqual(details.writers, ['Dir']);
    assert.deepEqual(details.topCast.map((member) => member.name), ['First', 'Second']);
    assert.equal(details.trailerUrl, 'https://www.youtube.com/watch?v=official');
    assert.equal(details.budgetUsd, null, 'TMDB uses 0 for unknown budgets');
    assert.equal(details.tagline, null);
  });

  it('ranks person credits by vote count and removes duplicate titles', () => {
    const person = toPersonDetails({
      id: 1,
      name: 'Someone',
      combined_credits: {
        cast: [
          { id: 10, media_type: 'movie', title: 'Small', vote_count: 5, character: 'Lead' },
          { id: 20, media_type: 'movie', title: 'Big', vote_count: 5000, character: 'Hero' },
        ],
        crew: [{ id: 20, media_type: 'movie', title: 'Big', vote_count: 5000, job: 'Producer' }],
      },
    });
    assert.deepEqual(
      person.notableCredits.map((credit) => [credit.title, credit.role]),
      [
        ['Big', 'Hero'],
        ['Small', 'Lead'],
      ],
    );
  });

  it('reports a region without offers as unavailable', () => {
    const providers = toWatchProviders(
      { results: { US: { link: 'https://tmdb/x', flatrate: [{ provider_name: 'Netflix' }] } } },
      'BR',
    );
    assert.equal(providers.available, false);
    assert.deepEqual(providers.subscription, []);
    assert.match(providers.attribution, /JustWatch/);
  });
});
