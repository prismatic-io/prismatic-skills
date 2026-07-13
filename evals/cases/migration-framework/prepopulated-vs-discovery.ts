import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

export default defineEvalCase({
  id: "migration-framework/prepopulated-vs-discovery",
  prompt: withSkill(
    "migration-framework",
    `Once the parser has emitted migration-schema.json, what parts of the
integration requirements spec are pre-populated versus left for live
discovery?`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("migration-framework")],
    idleTimeoutMs: 120_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "identifies source_component / destination_component as live discovery",
      pattern: "source_component|destination_component",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "identifies trigger_type or systems as pre-populated",
      pattern: "trigger_type|source_system|destination_system",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "correct pre-populated vs live discovery split",
      criteria:
        "source_component and destination_component require live discovery (live registry search) and cannot be pre-populated from the export alone. Connection selection (*_connection, *_connection_type) also requires live discovery. Pre-populated from the parsed export includes at minimum: trigger_type, source_system / destination_system, and transformations. Does NOT claim that component selection or connection selection can be pre-populated from the export alone.",
    },
  ],
  meta: { skill: "migration-framework", tags: ["migration", "schema", "discovery"] },
});
