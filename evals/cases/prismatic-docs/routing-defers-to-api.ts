import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

export default defineEvalCase({
  id: "prismatic-docs/routing-defers-to-api",
  prompt: withSkill(
    "prismatic-docs",
    `List my customers and tell me which Prismatic instances I currently have
deployed.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("prismatic-docs")],
    idleTimeoutMs: 120_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "names the Prismatic API as the right route",
      // Accept the skill slug or prose ("the Prismatic API") — what matters is
      // naming the API route, not the hyphenation.
      pattern: "prismatic[- ]api",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "routes operational query to prismatic-api, not a docs fetch",
      criteria:
        "The prismatic-docs skill's 'When to Use This Skill' routing table directs operational/data questions ('List my customers', 'What integrations do I have?', 'Deploy this instance') to the prismatic-api skill instead of this docs skill. The response must recognize that 'list my customers' and 'which instances I have deployed' are live-account/operational queries and route them to the prismatic-api skill (or the prism API / MCP tools) rather than attempting to answer by fetching or searching prismatic.io/docs. It should NOT present documentation pages as the answer to these operational asks, and ideally explicitly says docs cannot return account-specific data.",
    },
  ],
  meta: { skill: "prismatic-docs", tags: ["docs", "routing", "prismatic-api"] },
});
