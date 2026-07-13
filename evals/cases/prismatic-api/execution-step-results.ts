import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Non-tautology: the prompt names no field, and the naive answer selects a nonexistent
// output/data field; stepResults and resultsUrl (a presigned S3 URL fetched separately)
// come only from the skill.
export default defineEvalCase({
  id: "prismatic-api/execution-step-results",
  prompt: withSkill(
    "prismatic-api",
    `Given an execution ID from one of my Prismatic runs, what GraphQL query fetches each
step's output data? Explain how I actually retrieve the data values, not just the query
shape. Give me the query text plus that explanation only — do NOT run anything against
my account, don't check my auth, and don't call any MCP or prism commands.`,
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
      name: "selects the stepResults connection",
      pattern: "stepResults",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "selects the resultsUrl field (presigned S3 URL)",
      pattern: "resultsUrl",
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
      name: "singular executionResult query; resultsUrl fetched separately",
      criteria:
        "The response uses the singular executionResult(id: <executionId>) query selecting stepResults nodes with stepName and resultsUrl, and correctly explains that resultsUrl is a short-lived presigned S3 URL that must be fetched separately (a second request) to obtain the step's actual output data — the data is not returned inline by the GraphQL field; it presents text only and requires no auth.",
    },
  ],
  meta: { skill: "prismatic-api", tags: ["api", "graphql", "execution", "logs"] },
});
