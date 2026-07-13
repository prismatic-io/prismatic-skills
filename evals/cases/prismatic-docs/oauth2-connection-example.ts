import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins the documented OAuth2 connection example (find + cite). Non-tautology: the prompt
// says "helper function" / "enum" but never oauth2Connection or
// OAuth2Type.AuthorizationCode — those spellings come only from the doc.
export default defineEvalCase({
  id: "prismatic-docs/oauth2-connection-example",
  prompt: withSkill(
    "prismatic-docs",
    `Find the Prismatic example for defining an OAuth 2.0 (authorization code grant)
connection in a custom connector. I want to see the exact helper function and the enum
the example uses, plus a link to the doc.`,
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
      name: "shows the oauth2Connection helper (not generic connection())",
      pattern: "oauth2Connection",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "never fetched llms-full.txt",
      fn: (run: Run) => !toolCallInputs(run).some((i) => i.includes("llms-full.txt")),
    },
    {
      type: "rubric",
      name: "oauth2Connection + OAuth2Type.AuthorizationCode, real citation, nothing invented",
      criteria:
        "The response finds the documented OAuth2 connection example: it uses oauth2Connection(...) (not generic connection(...)) from @prismatic-io/spectral and selects oauth2Type: OAuth2Type.AuthorizationCode; it cites a real prismatic.io/docs or github.com/prismatic-io URL, does NOT fetch llms-full.txt, and invents no connection fields or grant types.",
    },
  ],
  meta: { skill: "prismatic-docs", tags: ["docs", "oauth2", "connection", "citation"] },
});
