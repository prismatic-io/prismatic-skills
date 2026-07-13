import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

export default defineEvalCase({
  id: "boomi-migration/shape-mapping",
  prompt: withSkill(
    "boomi-migration",
    "What do the Boomi shapes Map, Decision, and Branch map to in Prismatic CNI?",
  ),
  driver: claudeCode({
    readDirs: [skillDir("boomi-migration")],
    idleTimeoutMs: 90_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "covers transformation / conditional / sequential",
      // All three CNI concepts in order; Branch → sequential (per the skill), NOT parallel.
      pattern: "transform[\\s\\S]*?conditional[\\s\\S]*?(sequential|single-thread)",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "correct shape semantics",
      criteria:
        "Map → data transformation logic (not a non-existent Prismatic 'map' primitive). Decision → conditional (if/else) logic. Branch → sequential step execution (CNI is single-threaded; Boomi's branch paths run one after another) — NOT a claim that Branch maps to parallel execution in CNI, and not a semantics-free 'branching' label.",
    },
  ],
  meta: { skill: "boomi-migration", tags: ["migration", "boomi", "shapes", "ci"] },
});
