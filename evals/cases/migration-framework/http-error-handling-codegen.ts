import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// The prompt describes the Boomi anti-pattern (a Decision shape inspects the returned
// status code); correct output must instead try/catch the throwing Spectral/axios client
// and read status off the error's .response — both absent from the prompt, so echoing
// the prompt yields the unreachable post-await status check the rubric rejects.
export default defineEvalCase({
  id: "migration-framework/http-error-handling-codegen",
  prompt: withSkill(
    "migration-framework",
    `I'm migrating a Boomi HTTP connector step to a Prismatic Code Native Integration. In
Boomi, the process does an HTTP GET and then a Decision shape inspects the returned
status code to branch on errors. Write the equivalent TypeScript for the HTTP call and
its error handling, following the migration framework's code-generation guidance for
Prismatic's HTTP client. Write it to \`httpCall.ts\` in the current working directory.
Do NOT run anything against my Prismatic account or check auth — just produce the file.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("migration-framework")],
    idleTimeoutMs: 240_000,
    maxInterrupts: 3,
  }),
  ...scripted,
  assertions: [
    {
      type: "file-matches",
      path: "httpCall.ts",
      pattern: "catch\\s*\\(",
      name: "wraps the HTTP call in try/catch",
    },
    {
      type: "command-exits-zero",
      name: "reads status off the thrown error's .response",
      command: "test -f httpCall.ts && grep -qE '\\.response(\\.|\\?)' httpCall.ts",
    },
    {
      type: "predicate",
      name: "did not run against the platform",
      fn: (run: Run) =>
        !calledPlatform(run) && !toolCallInputs(run).some((i) => i.includes("graphql:query")),
    },
    {
      type: "rubric",
      name: "try/catch on the throwing client; no post-await status check",
      criteria:
        "The TypeScript wraps the HTTP call in try/catch because the Spectral/axios client throws on non-2xx, and reads the status from the caught error (e.g. error.response.status) inside the catch; it does NOT check response.status on the awaited result, which the skill notes is unreachable because the await already threw.",
    },
  ],
  meta: { skill: "migration-framework", tags: ["migration", "http", "error-handling", "codegen"] },
});
