import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { TmdbError } from '../tmdb/client.ts';

export const READ_ONLY = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Runs a tool body and turns the outcome into an MCP result (structured + text). */
export async function run<T extends Record<string, unknown>>(
  body: () => Promise<T>,
): Promise<CallToolResult> {
  try {
    const data = await body();
    return {
      content: [{ type: 'text', text: JSON.stringify(data) }],
      structuredContent: data,
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: describe(error) }],
    };
  }
}

function describe(error: unknown): string {
  if (error instanceof TmdbError) {
    if (error.status === 401) return `${error.message} Check the TMDB credentials configured for this server.`;
    if (error.status === 404) return `${error.message}. Verify the id, or search first to get a valid id.`;
    if (error.status === 429) return 'TMDB rate limit reached. Wait a few seconds and try again.';
    return error.message;
  }
  if (error instanceof ToolInputError) return error.message;
  return `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
}

/** An error caused by the agent's arguments; the message tells it how to fix the call. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}
