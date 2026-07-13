import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Non-tautology: the prompt is plain English — createCustomer and externalId come only
// from the skill, so the regexes prove the answer is grounded in it.
export default defineEvalCase({
  id: "prismatic-api/create-customer-mutation",
  prompt: withSkill(
    "prismatic-api",
    `Show me the GraphQL mutation to add a new customer to my Prismatic org, passing a
name and an identifier from my own system so I can map the customer back to my records
later. I only need the mutation text — do not run it, don't check my auth, and don't
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
      name: "uses the createCustomer mutation",
      pattern: "createCustomer",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "maps the caller's own-system id to externalId",
      pattern: "externalId",
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
      name: "input-wrapped createCustomer with externalId and errors block",
      criteria:
        "The response provides the createCustomer mutation with args wrapped in input: { ... }, passing a name and the externalId, and selects both the created customer { id ... } and the errors { field messages } block; it presents mutation text only and requires no authentication.",
    },
  ],
  meta: { skill: "prismatic-api", tags: ["api", "graphql", "customers", "mutation"] },
});
