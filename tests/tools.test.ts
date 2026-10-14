import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { connect, fakeFetch, testClient, textOf } from './helpers.ts';

const paged = (results: unknown[]) => ({ page: 1, total_pages: 1, total_results: results.length, results });

describe('MCP tools', () => {
  it('exposes the tools with read-only annotations', async () => {
    const session = await connect(testClient(fakeFetch()));
    const { tools } = await session.mcp.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      'discover',
      'get_movie_details',
      'get_person_details',
      'get_recommendations',
      'get_trending',
      'get_tv_show_details',
      'get_watch_providers',
      'search_movies',
      'search_people',
      'search_tv_shows',
    ]);
    assert.ok(tools.every((tool) => tool.annotations?.readOnlyHint === true));
    await session.close();
  });

  it('search_movies returns compact summaries with genre names', async () => {
    const fetch = fakeFetch((url) =>
      url.pathname.endsWith('/search/movie')
        ? {
            body: paged([
              {
                id: 603,
                title: 'The Matrix',
                release_date: '1999-03-31',
                vote_average: 8.217,
                vote_count: 26000,
                genre_ids: [28, 878],
                overview: 'A hacker learns the truth.',
                popularity: 99,
                backdrop_path: '/x.jpg',
              },
            ]),
          }
        : undefined,
    );
    const session = await connect(testClient(fetch));
    const result = await session.call('search_movies', { query: 'matrix' });

    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, {
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [
        {
          id: 603,
          title: 'The Matrix',
          year: 1999,
          rating: 8.2,
          votes: 26000,
          genres: ['Action', 'Science Fiction'],
          overview: 'A hacker learns the truth.',
        },
      ],
    });
    // Raw fields agents don't need are dropped.
    assert.doesNotMatch(textOf(result), /backdrop_path|popularity/);
    await session.close();
  });

  it('discover resolves genre and provider names into TMDB filters', async () => {
    const fetch = fakeFetch(
      (url) =>
        url.pathname.endsWith('/watch/providers/movie')
          ? { body: { results: [{ provider_id: 8, provider_name: 'Netflix' }, { provider_id: 9, provider_name: 'Amazon Prime Video' }] } }
          : undefined,
      (url) => (url.pathname.endsWith('/discover/movie') ? { body: paged([]) } : undefined),
    );
    const session = await connect(testClient(fetch));
    const result = await session.call('discover', {
      genres: ['sci-fi', 'thriller'],
      streamingOn: ['netflix'],
      region: 'gb',
      yearFrom: 1990,
      yearTo: 1999,
      maxRuntimeMinutes: 120,
      sortBy: 'rating',
    });

    assert.equal(result.isError, undefined, textOf(result));
    const query = fetch.calls.find((url) => url.pathname.endsWith('/discover/movie'))!.searchParams;
    assert.equal(query.get('with_genres'), '878,53');
    assert.equal(query.get('with_watch_providers'), '8');
    assert.equal(query.get('watch_region'), 'GB');
    assert.equal(query.get('primary_release_date.gte'), '1990-01-01');
    assert.equal(query.get('primary_release_date.lte'), '1999-12-31');
    assert.equal(query.get('with_runtime.lte'), '120');
    assert.equal(query.get('sort_by'), 'vote_average.desc');
    assert.equal(query.get('vote_count.gte'), '200');
    await session.close();
  });

  it('discover maps TV-specific genre names and date fields', async () => {
    const fetch = fakeFetch((url) => (url.pathname.endsWith('/discover/tv') ? { body: paged([]) } : undefined));
    const session = await connect(testClient(fetch));
    await session.call('discover', { mediaType: 'tv', genres: ['science fiction'], yearFrom: 2010, sortBy: 'newest' });

    const query = fetch.calls.find((url) => url.pathname.endsWith('/discover/tv'))!.searchParams;
    assert.equal(query.get('with_genres'), '10765');
    assert.equal(query.get('first_air_date.gte'), '2010-01-01');
    assert.equal(query.get('sort_by'), 'first_air_date.desc');
    await session.close();
  });

  it('tells the agent which genres are valid when one is unknown', async () => {
    const session = await connect(testClient(fakeFetch()));
    const result = await session.call('discover', { genres: ['spaghetti western'] });

    assert.equal(result.isError, true);
    assert.match(textOf(result), /Unknown movie genre "spaghetti western"/);
    assert.match(textOf(result), /Science Fiction/);
    await session.close();
  });

  it('turns a TMDB 404 into an actionable tool error', async () => {
    const session = await connect(testClient(fakeFetch()));
    const result = await session.call('get_movie_details', { movieId: 999999999 });

    assert.equal(result.isError, true);
    assert.match(textOf(result), /Not found.*search first/);
    await session.close();
  });

  it('get_trending fills in media_type for single-type endpoints', async () => {
    const fetch = fakeFetch((url) =>
      url.pathname.endsWith('/trending/tv/day')
        ? { body: paged([{ id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20', vote_average: 8.9 }]) }
        : undefined,
    );
    const session = await connect(testClient(fetch));
    const result = await session.call('get_trending', { mediaType: 'tv', timeWindow: 'day' });

    assert.deepEqual(result.structuredContent, {
      results: [{ mediaType: 'tv', id: 1396, title: 'Breaking Bad', year: 2008, rating: 8.9, overview: '' }],
    });
    await session.close();
  });

  it('serves the genre list as a resource', async () => {
    const session = await connect(testClient(fakeFetch()));
    const resource = await session.mcp.readResource({ uri: 'tmdb://genres' });
    const first = resource.contents[0];
    assert.ok(first && 'text' in first);
    assert.deepEqual(JSON.parse(first.text).tv, ['Drama', 'Sci-Fi & Fantasy']);
    await session.close();
  });
});
