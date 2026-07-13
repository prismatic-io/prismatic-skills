import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

export default defineEvalCase({
  id: "boomi-migration/analyze-export",
  prompt: withSkill(
    "boomi-migration",
    `I have a Dell Boomi export directory with about 40 XML files including a MAIN
process, some [OTEL] monitoring processes, a handful of Groovy
transform.function components, and several connector-settings files. Walk me
through analyzing it and producing the standard integration schema. Do not run
anything; describe the workflow.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("boomi-migration")],
    idleTimeoutMs: 150_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "uses prismatic-tools parse-export --platform boomi",
      pattern: "parse-export[\\s\\S]{0,60}boomi",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "says OTEL/monitoring processes are excluded",
      // Require an exclusion verb near the term; the prompt already names "[OTEL]".
      pattern:
        "(exclud|skip|ignore|omit|leave out|filter out)[\\s\\S]{0,80}(OTEL|monitoring)|(OTEL|monitoring)[\\s\\S]{0,80}(exclud|skip|ignore|omit|leave out|filter out)",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "parser-first, MAIN entry point, verbatim Groovy",
      criteria:
        "The workflow uses `prismatic-tools parse-export <dir> --platform boomi` (optionally --summary first) as the first step — it does NOT suggest reading/parsing the XML manually. Processes prefixed [OTEL]/[Monitoring]/[MONITORING] are excluded from business-logic analysis. The MAIN process (name-prefix MAIN/[MAIN]) is identified as the primary migration entry point. Groovy source from script.mapping, script.processing, and transform.function components is carried into the output schema verbatim — not summarized or dropped.",
    },
  ],
  meta: { skill: "boomi-migration", tags: ["migration", "boomi"] },
});
