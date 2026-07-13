import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

export default defineEvalCase({
  id: "prismatic-api/paginate-integrations",
  prompt: withSkill(
    "prismatic-api",
    `Write a script that paginates through all integrations in my Prismatic
organization and prints their names.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("prismatic-api")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 3,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "uses hasNextPage as loop condition",
      pattern: "hasNextPage",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "uses endCursor for cursor-based pagination",
      pattern: "endCursor",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "cursor-based loop, real entity, not offset/limit",
      criteria:
        "The pagination loop continues until pageInfo.hasNextPage is false, using endCursor as the `after` argument on subsequent pages — does NOT use offset/limit pagination or stop after a single page. The GraphQL query selects both nodes { ... } and pageInfo { hasNextPage, endCursor }. Uses the real Prismatic entity (integrations) — not a fabricated one.",
    },
  ],
  meta: { skill: "prismatic-api", tags: ["api", "pagination", "graphql"] },
});
