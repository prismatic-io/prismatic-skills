import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

export default defineEvalCase({
  id: "cyclr-migration/analyze-export",
  prompt: withSkill(
    "cyclr-migration",
    `I have a Cyclr cycle JSON export. Walk me through analyzing it and producing
the standard integration schema. Do not run anything; describe the workflow.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("cyclr-migration")],
    idleTimeoutMs: 150_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "uses prismatic-tools parse-export --platform cyclr",
      pattern: "parse-export[\\s\\S]{0,60}cyclr",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "mentions ExportedConnectors (as encrypted/unusable)",
      pattern: "ExportedConnectors",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "parser-first, no ExportedConnectors parsing, correct trigger identification",
      criteria:
        "Uses `prismatic-tools parse-export <path> --platform cyclr` (optionally --summary first) as the first step — does NOT suggest manually reading or parsing the JSON. Does NOT attempt to decrypt or parse ExportedConnectors for auth details; connector/auth details come from AccountConnector blocks inside Steps. Trigger identification follows the documented rules (first step in execution_order, ActionType=5 for webhook, Interval>0 for polling, or the step with no incoming edges).",
    },
  ],
  meta: { skill: "cyclr-migration", tags: ["migration", "cyclr"] },
});
