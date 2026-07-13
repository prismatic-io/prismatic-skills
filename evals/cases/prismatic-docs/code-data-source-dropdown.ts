import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins the code-component data-source return shape. Non-tautology: the prompt never
// names result/label/key — the `result` wrapper (vs. a naive bare array) comes only
// from the doc.
export default defineEvalCase({
  id: "prismatic-docs/code-data-source-dropdown",
  prompt: withSkill(
    "prismatic-docs",
    `Find the Prismatic example for populating a config wizard dropdown with options
fetched from a third-party API using a code component data source. Show me the exact
shape the data source function must return so the options render in the dropdown, and
cite the doc.`,
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
      name: "shows the return { result: ... } wrapper",
      // The {0,80} span keeps it anchored to a `return` so prose "the result" cannot pass.
      pattern: "return[\\s\\S]{0,80}result",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "never fetched llms-full.txt",
      fn: (run: Run) => !toolCallInputs(run).some((i) => i.includes("llms-full.txt")),
    },
    {
      type: "rubric",
      name: "{ result: [{ label, key }] } return shape, real citation, nothing invented",
      criteria:
        "The response finds the documented code component data source example: the function returns { result: [...] } where each option carries label and key; it cites a real prismatic.io/docs or github.com/prismatic-io URL, and invents no different return shape (no bare array, no name/value fields). Do NOT penalize the exact perform signature/parameter destructuring, and do NOT penalize fetching llms.txt — the prismatic-docs skill endorses llms.txt as its page index (only llms-full.txt is off-limits, which a separate check covers).",
    },
  ],
  meta: { skill: "prismatic-docs", tags: ["docs", "data-source", "config-wizard", "citation"] },
});
