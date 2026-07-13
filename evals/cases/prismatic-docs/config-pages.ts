import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

export default defineEvalCase({
  id: "prismatic-docs/config-pages",
  prompt: withSkill("prismatic-docs", "How do config pages work in Prismatic?"),
  driver: claudeCode({
    readDirs: [skillDir("prismatic-docs")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 3,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "cites a prismatic.io/docs URL",
      pattern: "prismatic\\.io/docs",
      against: "transcript-all",
    },
    {
      // The skill cites the HTML URL; the .md URL appears only in the WebFetch call,
      // so assert against tool inputs, not transcript text.
      type: "predicate",
      name: "fetches the markdown (.md) version of a doc page",
      fn: (run: Run) => toolCallInputs(run).some((i) => /prismatic\.io\/docs[^\s"']*\.md/.test(i)),
    },
    {
      type: "rubric",
      name: "grounded config-pages answer, real URL cited, no invented features",
      criteria:
        "Explains config pages accurately, grounded in the fetched Prismatic doc (config wizard pages, config variables, visibility). Cites at least one prismatic.io/docs URL in plain HTML form (without trailing .md) so the user can open it in a browser. Does not invent config-page features absent from the official docs (no fabricated field types or made-up UI elements).",
    },
  ],
  meta: { skill: "prismatic-docs", tags: ["docs", "config-pages"] },
});
