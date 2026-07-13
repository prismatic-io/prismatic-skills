import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

export default defineEvalCase({
  id: "migration-framework/schema-sections",
  prompt: withSkill(
    "migration-framework",
    `I'm writing a new platform parser (say, for MuleSoft) that will emit the
standard integration schema consumed by the Prismatic migration pipeline.
Describe the top-level sections of the schema and what each one represents,
and explain how confidence scoring works.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("migration-framework")],
    idleTimeoutMs: 150_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "mentions key top-level schema sections",
      pattern:
        "metadata[\\s\\S]{0,400}flows|flows[\\s\\S]{0,400}systems|systems[\\s\\S]{0,400}scripts",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "mentions confidence score numeric thresholds",
      pattern: "0\\.8|0\\.5|0\\.49",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "correct schema sections, confidence ranges, scripts requires full source",
      criteria:
        "Identifies the documented top-level schema sections, covering at minimum: metadata, integration, flows, systems, scripts, and config_variables. Describes three-tier confidence scoring with correct numeric ranges: high (0.8–1.0), medium (0.5–0.79), low (0.0–0.49) — not arbitrary or different thresholds. Notes that the scripts section must contain full source code (not just metadata references), because downstream code generation needs to translate it.",
    },
  ],
  meta: { skill: "migration-framework", tags: ["migration", "schema"] },
});
