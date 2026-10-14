#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.ts';
import { createHttpApp } from './http/app.ts';
import { createServer } from './server.ts';
import { TmdbClient } from './tmdb/client.ts';

const config = loadConfig();
const client = new TmdbClient(config.tmdb);

if (!client.hasCredentials) {
  // Log to stderr: stdout is reserved for the MCP protocol in stdio mode.
  console.error('Warning: TMDB_READ_ACCESS_TOKEN / TMDB_API_KEY not set; every tool call will fail until it is.');
}

if (process.argv.includes('--http')) {
  const app = createHttpApp(config.http, client);
  app.listen(config.http.port, config.http.host, () => {
    console.error(`tmdb-mcp listening on http://${config.http.host}:${config.http.port}/mcp`);
  });
  const shutdown = () => app.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} else {
  await createServer(client).connect(new StdioServerTransport());
}
