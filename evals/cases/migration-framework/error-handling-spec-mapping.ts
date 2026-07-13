import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins schema-to-answers mapping: error_handling.strategy maps retry->retry, stop->fail,
// continue->ignore into error_handler_type; unmapped strategies ("log") surface in
// additional_requirements, and error_retry_* items are never auto-populated.
// Non-tautology: the asserted item names come only from the mapping reference, not the prompt.
export default defineEvalCase({
  id: "migration-framework/error-handling-spec-mapping",
  prompt: withSkill(
    "migration-framework",
    `In the Prismatic migration pipeline, a parsed export produces a standard integration
schema whose \`error_handling\` section looks like this:

\`\`\`json
"error_handling": { "strategy": ["log", "retry"], "retry_config": { "max_retries": 3 } }
\`\`\`

When the schema-to-answers mapping converts this section into the integration requirements
spec, which spec item captures the strategy and what slug value is written, and what happens
to the "log" strategy? Answer from the migration framework's mapping reference only — do not
run anything against the platform.`,
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
      name: "maps the mapped 'retry' strategy to error_handler_type = retry",
      pattern: "error_handler_type[\\s\\S]{0,160}retry",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "routes the unmapped 'log' strategy to additional_requirements",
      pattern: "additional_requirements",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "error_handling mapping matches schema-to-answers behavior",
      criteria:
        'The answer states that error_handling.strategy populates the error_handler_type CHOICE item, mapping only strategies that have a spec-choice equivalent (retry->retry, stop->fail, continue->ignore), and here writes retry for the "retry" strategy. It correctly explains that "log" has NO spec-choice equivalent, so it is captured in additional_requirements rather than mapped to a choice slug (it must NOT claim "log" maps to ignore). It does not claim error_retry_* items are auto-populated from the schema.',
    },
  ],
  meta: {
    skill: "migration-framework",
    tags: ["migration", "schema", "error-handling", "mapping"],
  },
});
