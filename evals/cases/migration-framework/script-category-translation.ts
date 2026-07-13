import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// The prompt names the field "category" but supplies neither value. The two values
// (mapping / processing), the CNI symbol onExecution, and the single-document /
// per-record semantics come only from migration-code-gen-guide.md.
export default defineEvalCase({
  id: "migration-framework/script-category-translation",
  prompt: withSkill(
    "migration-framework",
    `The standard integration schema's \`scripts\` section tags each entry with a
\`category\`. In the migration framework, what are the two possible category values,
and how does each one map into the structure of the generated Code Native Integration
during code generation? Just explain — do not run anything against the platform.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("migration-framework")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "a processing (stream) script becomes the main loop body in onExecution",
      pattern: "onExecution",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "a mapping script is single-document / per-record",
      pattern: "single-document|per-record",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "both categories named and structurally translated, not swapped",
      criteria:
        "The answer names exactly the two categories mapping and processing and correctly explains that a mapping script is single-document (transforms one record at a time) and becomes a per-record helper function, while a processing script is stream/multi-document and becomes the main loop body inside the flow's onExecution.",
    },
  ],
  meta: { skill: "migration-framework", tags: ["migration", "scripts", "codegen"] },
});
