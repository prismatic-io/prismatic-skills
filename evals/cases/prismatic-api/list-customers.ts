import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

export default defineEvalCase({
  id: "prismatic-api/list-customers",
  prompt: withSkill(
    "prismatic-api",
    `I'm operating as Orby — list the first 20 customers in the Prismatic
organization. What's the right API call to make?`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("prismatic-api")],
    idleTimeoutMs: 120_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "cites the MCP-first access hierarchy",
      pattern: "mcp__|MCP tool|Priority 1",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "GraphQL uses relay-style nodes / pageInfo",
      pattern: "nodes|pageInfo",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "hierarchy-aware fallback, relay pagination, real entities only",
      criteria:
        "Follows the two-tier access hierarchy: FIRST checks for a Priority-1 MCP tool, and because there is no customers-list MCP tool, correctly falls back to Priority 2 — `prism graphql:query` with `--variables` (never string interpolation). Recommending the prism CLI here is correct, not a violation, precisely because no customers MCP tool exists. Any GraphQL shown uses Relay-style pagination: nodes { ... } and pageInfo { hasNextPage, endCursor }. References real Prismatic top-level entities (customers, integrations, instances, components) — not fabricated query fields.",
    },
  ],
  meta: { skill: "prismatic-api", tags: ["api", "customers", "mcp", "ci"] },
});
