/**
 * graphql.ts — Thin wrapper around `prism graphql:query`.
 */

import { runPrismQuery } from "./prism-retry.ts";

export class GraphQLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphQLError";
  }
}

export const graphql = async (
  query: string,
  variables?: Record<string, unknown>,
  timeout = 30,
): Promise<unknown> => {
  const cmd = ["prism", "graphql:query", query];
  if (variables) {
    cmd.push("--variables", JSON.stringify(variables));
  }
  const result = await runPrismQuery(cmd, timeout);
  if (result.returncode !== 0) {
    throw new GraphQLError(`Query failed: ${result.stderr.trim() || "Unknown error"}`);
  }
  if (!result.stdout.trim()) {
    throw new GraphQLError("Query returned empty response");
  }
  try {
    return JSON.parse(result.stdout);
  } catch (e) {
    throw new GraphQLError(`Failed to parse response: ${e}`);
  }
};

export const ensureAuthenticated = async (): Promise<void> => {
  const result = await runPrismQuery(["prism", "me"], 15);
  if (result.returncode !== 0) {
    throw new GraphQLError("Not authenticated with Prismatic. Run 'prism login' first.");
  }
};
