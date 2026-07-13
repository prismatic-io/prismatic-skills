import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Fixture-grounded analysis: a tiny Boomi export is staged via lux fixtures, and the
// asserted names (Order Sync, NormalizeOrder) exist only in the staged files, so the
// regexes prove the analysis was read from disk rather than echoed from the prompt.
export default defineEvalCase({
  id: "boomi-migration/analyze-fixture-export",
  prompt: withSkill(
    "boomi-migration",
    `A Boomi export has already been unpacked into the current working directory:
a MAIN process, an [OTEL] monitoring process, and a Groovy transform. Read the
actual files present and walk me through analyzing THIS export into the standard
integration schema. Do not run external tools; ground the analysis in what the
files contain.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("boomi-migration")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 2,
  }),
  fixtures: { kind: "dir", path: "boomi-export-sample" },
  ...scripted,
  assertions: [
    { type: "glob-count", glob: "**/*.{xml,groovy}", min: 3, name: "export files were staged" },
    // for tool-called, `name` is the tool name and doubles as the label
    { type: "tool-called", name: "Read", minTimes: 1 },
    {
      type: "regex",
      name: "names the actual process found in the staged export",
      pattern: "OrderSync|Order Sync",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "carries the Groovy business logic through by name",
      pattern: "NormalizeOrder",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "grounded analysis: MAIN entry, OTEL excluded, Groovy verbatim",
      criteria:
        "The analysis is grounded in the specific files present: it names the MAIN-prefixed process (Order Sync) as the primary migration entry point, excludes the [OTEL] telemetry process from business-logic analysis, and treats the NormalizeOrder Groovy (canonical id, summed line-item total, NA/INTL region) as source that must be carried into the schema verbatim — not summarized away or dropped.",
    },
  ],
  meta: { skill: "boomi-migration", tags: ["migration", "boomi", "fixtures"] },
});
