import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Non-tautology: the prompt says "disabled"/"failed state" in plain English; the
// enabled and inFailedState symbols come only from the skill, and the schema has no
// status filter for a naive query to fall back on.
export default defineEvalCase({
  id: "prismatic-api/instances-by-status",
  prompt: withSkill(
    "prismatic-api",
    `I want the GraphQL query to list the instances of one of my integrations that are
currently disabled or that are sitting in a failed state, so I can audit them. Give me
the query text only — do NOT run it against my account, don't check my auth, and don't
call any MCP or prism commands.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("prismatic-api")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "selects the inFailedState node field",
      pattern: "inFailedState",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "uses the enabled filter/field for disabled instances",
      pattern: "enabled",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "did not execute the query or check auth",
      fn: (run: Run) =>
        !calledPlatform(run) && !toolCallInputs(run).some((i) => i.includes("graphql:query")),
    },
    {
      type: "rubric",
      name: "instances collection, documented filters, relay pagination",
      criteria:
        "The response gives a GraphQL query against the instances(...) collection scoped to the integration, selecting node fields including enabled and inFailedState plus Relay pageInfo { hasNextPage endCursor }, so the caller can identify disabled (enabled: false) and failed (inFailedState: true) instances. Using the documented enabled: Boolean filter argument is acceptable but NOT required — because the user wants disabled OR failed and inFailedState is a selectable field, not a filter argument, selecting both as node fields is fully correct. It must not invent an undocumented status argument or a failed filter argument, presents query text only, and requires no authentication.",
    },
  ],
  meta: { skill: "prismatic-api", tags: ["api", "graphql", "instances", "filtering"] },
});
