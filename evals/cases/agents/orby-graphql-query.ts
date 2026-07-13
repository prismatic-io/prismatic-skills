import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir } from "../_support.ts";

// Hermetic: Orby is platform-coupled, so it gets a GraphQL-construction question
// answerable purely from the prismatic-api skill, with nothing run against an account.
// Non-tautology: the asserted symbols are exact skill identifiers the prompt lacks.
export default defineEvalCase({
  id: "agents/orby-graphql-query",
  prompt: `Show me the GraphQL query to fetch the 10 most recent execution results for a
given instance, plus the query to pull that execution's logs. I just want the query
text so I can reuse it — do NOT run anything against my account and don't check my auth.`,
  driver: claudeCode({
    agent: "orby",
    readDirs: [skillDir("prismatic-api"), skillDir("prismatic-docs")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "uses the executionResults field",
      pattern: "executionResults",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "queries logs by the executionResult argument",
      pattern: "executionResult\\s*:",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "paginates the recent executions with first:",
      pattern: "first\\s*:",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "did not execute a live query or MCP platform call",
      // No `prism graphql:query` via Bash and no prism_* MCP tool call.
      fn: (run: Run) =>
        !calledPlatform(run) && !toolCallInputs(run).some((i) => i.includes("graphql:query")),
    },
    {
      type: "rubric",
      name: "correct, documented GraphQL; nothing executed",
      criteria:
        "The response provides two GraphQL queries: one selecting executionResults(instance: <id>, first: 10) with recent-execution node fields (e.g. id, startedAt, endedAt, error), and one selecting logs(executionResult: <executionId>) with node fields (e.g. timestamp, message, severity). It presents the query text only — it does not execute the queries, does not run `prism graphql:query`, does not call MCP tools, and does not require the user to authenticate. Judge only what appears in the trace; the queries need not be verified against a live schema.",
    },
  ],
  meta: { agent: "orby", priority: "P0", tags: ["orby", "graphql", "hermetic"] },
});
