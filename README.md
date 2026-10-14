# tmdb-mcp

[![CI](https://github.com/wsqreis/tmdb-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/wsqreis/tmdb-mcp/actions/workflows/ci.yml)

An [MCP](https://modelcontextprotocol.io) server that gives AI agents access to [The Movie Database (TMDB)](https://www.themoviedb.org/): movies, TV shows, people, trending titles, recommendations and where to watch.

It is designed around how agents actually use tools, not around TMDB's endpoints:

- **Compact, typed outputs.** Every tool returns a trimmed result with a declared output schema (`structuredContent`). Agents pay for each token a tool returns, so raw TMDB payloads (image paths, popularity floats, duplicate ids) are cut down to the fields that help answer questions.
- **Names, not ids.** `discover` takes genres and streaming services by name (`"sci-fi"`, `"Netflix"`) and resolves them to TMDB ids itself, so "a 90s thriller on Netflix under 2 hours" is a single call.
- **One call per question.** Detail tools bundle what is usually needed together (credits, trailer, top cast), instead of making the agent chain three requests.
- **Errors the agent can act on.** Unknown genres come back with the list of valid ones; a 404 tells the agent to search for a valid id first.
- **Production basics.** In-memory TTL/LRU cache, retries with `Retry-After` on 429/5xx, request timeouts, and an HTTP mode with bearer auth and per-client rate limiting.

### Measured output size

Characters returned to the agent versus the raw TMDB response for the same request (`npm run smoke`, 14 Oct 2026):

| Tool | Example | Tool output | Raw TMDB | Reduction |
|---|---|---:|---:|---:|
| `get_movie_details` | Inception, with credits and videos | 1,115 | 213,588 | 99.4% |
| `get_watch_providers` | Inception, US | 432 | 88,595 | 99.5% |
| `get_person_details` | Christopher Nolan, with credits | 2,350 | 96,965 | 97.5% |
| `search_movies` | "Inception" | 4,184 | 7,063 | 40.7% |
| `discover` | sci-fi on Netflix, score ≥ 7 | 8,179 | 12,920 | 36.6% |

The large savings come from endpoints that return far more than a question needs: full cast and crew lists, every video, every country's streaming offers. Search and discover results are already lists of summaries, so the saving there comes from dropping image paths and internal fields.

## Tools

| Tool | What it does |
|---|---|
| `search_movies` | Find movies by title (optionally by year) |
| `search_tv_shows` | Find TV series by name |
| `search_people` | Find actors, directors and crew |
| `get_movie_details` | Runtime, genres, score, directors, writers, top cast, budget, revenue, trailer |
| `get_tv_show_details` | Status, seasons, episodes, networks, creators, top cast |
| `get_person_details` | Biography and the 15 best-known credits with roles |
| `get_watch_providers` | Where a title streams, rents or sells in a given country |
| `discover` | Find titles by genres, years, score, runtime, language and streaming service |
| `get_trending` | Trending movies, shows or people, today or this week |
| `get_recommendations` | "More like this" for a movie or show |

It also provides a resource, `tmdb://genres`, with the valid genre names, and a `movie_night` prompt that picks three movies for a group from the services they subscribe to.

## Quick start

1. Get a free TMDB API Read Access Token at <https://www.themoviedb.org/settings/api>.
2. Add the server to your MCP client.

**Claude Code**

```bash
claude mcp add tmdb -e TMDB_READ_ACCESS_TOKEN=your-token -- npx -y @wsqreis/tmdb-mcp
```

**Claude Desktop** (`claude_desktop_config.json`) or any client using the same format:

```json
{
  "mcpServers": {
    "tmdb": {
      "command": "npx",
      "args": ["-y", "@wsqreis/tmdb-mcp"],
      "env": { "TMDB_READ_ACCESS_TOKEN": "your-token" }
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`):

```json
{
  "inputs": [{ "id": "tmdb-token", "type": "promptString", "description": "TMDB Read Access Token", "password": true }],
  "servers": {
    "tmdb": {
      "command": "npx",
      "args": ["-y", "@wsqreis/tmdb-mcp"],
      "env": { "TMDB_READ_ACCESS_TOKEN": "${input:tmdb-token}" }
    }
  }
}
```

Then ask things like:

- *"What should I watch tonight? Something like Arrival, available on Netflix in the UK."*
- *"Which movies have Denis Villeneuve and Roger Deakins made together?"*
- *"Best-rated Korean thrillers from the 2010s under two hours."*

## Remote (HTTP) mode

The same server can run as a remote MCP endpoint over [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http):

```bash
TMDB_READ_ACCESS_TOKEN=... MCP_HTTP_AUTH_TOKEN=$(openssl rand -hex 32) npx -y @wsqreis/tmdb-mcp --http
# or
docker build -t tmdb-mcp . && docker run -p 3000:3000 --env-file .env tmdb-mcp
```

- `POST /mcp` requires `Authorization: Bearer <MCP_HTTP_AUTH_TOKEN>`. The server refuses to start in HTTP mode without a token, so it is never exposed without auth by accident.
- Each client IP gets a token bucket of `MCP_HTTP_RATE_LIMIT_PER_MINUTE` requests (default 60). Over the limit it returns `429` with `Retry-After`.
- It runs stateless: a fresh MCP server per request, so instances scale horizontally without sticky sessions.
- `GET /healthz` is open for load balancers and container health checks.

When deploying behind a reverse proxy, every request will appear to come from the proxy's IP. Enforce per-client limits at the proxy, or extend the limiter to read a trusted `X-Forwarded-For`.

## Configuration

| Variable | Default | |
|---|---|---|
| `TMDB_READ_ACCESS_TOKEN` | – | v4 token (preferred), sent as a bearer header |
| `TMDB_API_KEY` | – | v3 key, used only if no read access token is set |
| `TMDB_LANGUAGE` | `en-US` | Language of titles and overviews |
| `TMDB_REGION` | `US` | Default country for watch providers and `streamingOn` |
| `TMDB_CACHE_TTL_SECONDS` | `600` | `0` disables the cache |
| `TMDB_CACHE_MAX_ENTRIES` | `500` | LRU eviction above this |
| `TMDB_TIMEOUT_MS` / `TMDB_MAX_RETRIES` | `10000` / `3` | Per-request timeout and retries on 429/5xx |
| `MCP_HTTP_HOST` / `MCP_HTTP_PORT` | `127.0.0.1` / `3000` | HTTP mode only |
| `MCP_HTTP_AUTH_TOKEN` | – | Required in HTTP mode |
| `MCP_HTTP_RATE_LIMIT_PER_MINUTE` | `60` | Per client IP, `0` disables |

## Development

Requires Node.js 22.18+ (TypeScript runs natively in development; the published package is compiled to JavaScript).

```bash
npm install
npm test            # unit + MCP protocol + HTTP tests, no network needed
npm run typecheck
npm run inspect     # open the MCP Inspector against the local server
cp .env.example .env && npm run smoke   # live check against TMDB, with output-size comparison
```

The tests drive the server through a real MCP client over an in-memory transport, with a fake `fetch` standing in for TMDB, so they cover schemas, argument validation and error handling end to end without network access.

```
src/
├── index.ts          # entry point: stdio (default) or --http
├── server.ts         # MCP server: tools, resource, prompt, instructions
├── schemas.ts        # zod output schemas (compact shapes)
├── tools/            # tool definitions, name→id resolution, error mapping
├── tmdb/             # HTTP client (auth, cache, retries), raw types, formatters
└── http/             # Streamable HTTP app, bearer auth, rate limiter
```

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data is provided by [JustWatch](https://www.justwatch.com/) through TMDB.

## License

[MIT](LICENSE)
