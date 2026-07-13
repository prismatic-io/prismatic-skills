import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Non-tautology: the prompt says "publish it" / "the new version"; the camelCase
// publishIntegration and versionNumber tokens come only from the skill.
export default defineEvalCase({
  id: "prismatic-api/publish-integration-mutation",
  prompt: withSkill(
    "prismatic-api",
    `I've imported a new version of one of my Prismatic integrations. What's the GraphQL
mutation to publish it so the version becomes available for deployment, and which field
in the response confirms the new version was created? Mutation text only — do not run
it, don't check my auth, and don't call any MCP or prism commands.`,
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
      name: "uses the publishIntegration mutation",
      pattern: "publishIntegration",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "identifies versionNumber as the confirming field",
      pattern: "versionNumber",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "did not execute the mutation or check auth",
      fn: (run: Run) =>
        !calledPlatform(run) && !toolCallInputs(run).some((i) => i.includes("graphql:query")),
    },
    {
      type: "rubric",
      name: "input-wrapped publishIntegration returning versionNumber + errors",
      criteria:
        "The response gives the publishIntegration mutation with the id inside an input: { id: ... } wrapper, selects the returned integration { ... versionNumber } (identifying versionNumber as the confirming field) and the errors { field messages } block; it presents mutation text only and requires no authentication.",
    },
  ],
  meta: { skill: "prismatic-api", tags: ["api", "graphql", "integrations", "mutation"] },
});
