import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

export default defineEvalCase({
  id: "cyclr-migration/actiontype-mapping",
  prompt: withSkill(
    "cyclr-migration",
    "What do Cyclr ActionType 2, ActionType 4, and ActionType 5 map to in Prismatic CNI?",
  ),
  driver: claudeCode({
    readDirs: [skillDir("cyclr-migration")],
    idleTimeoutMs: 90_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "ActionType 5 maps to webhook",
      // Case-insensitive: agents typically write "Webhook" capitalized.
      pattern: "ActionType.{0,12}5.{0,80}webhook|webhook.{0,80}ActionType.{0,12}5",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "covers conditional / script logic",
      pattern: "conditional|if.else",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "correct ActionType semantics",
      criteria:
        "ActionType 2 → conditional (if/else) logic. ActionType 4 → custom TypeScript / script logic. ActionType 5 → webhook trigger — specifically a webhook, NOT a polling trigger or generic action.",
    },
  ],
  meta: { skill: "cyclr-migration", tags: ["migration", "cyclr", "actiontypes"] },
});
