import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

export default defineEvalCase({
  id: "prismatic-docs/polling-trigger-example",
  prompt: withSkill(
    "prismatic-docs",
    "Find an example of a polling trigger in a Prismatic Code Native Integration.",
  ),
  driver: claudeCode({
    readDirs: [skillDir("prismatic-docs")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 3,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "cites a real prismatic.io/docs or github.com/prismatic-io URL",
      pattern: "prismatic\\.io/docs|github\\.com/prismatic-io",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "shows a real polling API symbol",
      // /polling/ alone would echo the prompt; these exact spellings come only from a
      // real example. CNI uses triggerType: "polling" + context.polling; the Spectral
      // pollingTrigger helper counts only as the component-level variant.
      pattern: "triggerType:\\s*[\"']polling|context\\.polling|pollingTrigger",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "never fetched llms-full.txt",
      // Skill's hard rule (file exceeds 10MB, times out). Check tool calls, not prose.
      fn: (run: Run) => !toolCallInputs(run).some((i) => i.includes("llms-full.txt")),
    },
    {
      type: "rubric",
      name: "no llms-full.txt, real URL, correct polling trigger API",
      criteria:
        'Does NOT fetch llms-full.txt (it exceeds 10MB and will timeout) — uses llms.txt, WebSearch, or a direct doc/examples URL instead. Cites a URL under prismatic.io/docs or github.com/prismatic-io/examples. The example shown uses the documented polling trigger API for CNI (triggerType: "polling" with context.polling — or the component-level pollingTrigger helper if the example is explicitly component-level) — not invented syntax.',
    },
  ],
  meta: { skill: "prismatic-docs", tags: ["docs", "polling", "trigger"] },
});
