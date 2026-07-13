import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins the exposed_inputs pagination recipe: cursor + page-size inputs (the numeric
// one with a util.types.to* clean fn), a { data } return, all through createClient.
// Non-tautology: the prompt describes paging in plain English and names none of these.
export default defineEvalCase({
  id: "component-patterns/pagination-exposed-inputs",
  prompt: withSkill(
    "component-patterns",
    `Generate a Prismatic custom component action for a REST API whose list endpoint
returns one page of records at a time. Customers may hold a very large number of
records, so the action should let the integration builder fetch a single page per
call, pass in where to resume, and hand back whatever the caller needs in order to
request the following page. Write the file(s) into the current working directory.
Follow Prismatic conventions exactly.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("component-patterns")],
    idleTimeoutMs: 300_000,
    maxInterrupts: 4,
  }),
  ...scripted,
  assertions: [
    { type: "glob-count", glob: "**/*.ts", min: 1, name: "wrote a source file" },
    {
      type: "command-exits-zero",
      name: "numeric paging input carries a util.types.to* clean fn",
      command: 'grep -rqE --exclude-dir=node_modules "util\\.types\\.to" .',
    },
    {
      type: "command-exits-zero",
      name: "returns results in a { data: ... } wrapper",
      // Anchored so identifiers like `metadata:` can't satisfy it.
      command: 'grep -rqE --exclude-dir=node_modules "(^|[^A-Za-z0-9_])data[[:space:]]*:" .',
    },
    {
      type: "command-exits-zero",
      name: "uses the Spectral client, not a raw HTTP lib",
      command:
        '! grep -rqE --exclude-dir=node_modules "(from |require\\()[\'\\"](axios|node-fetch|got|undici)[\'\\"]" .',
    },
    {
      type: "rubric",
      name: "exposed_inputs shape: cursor+limit inputs, clean fn, { data } return",
      criteria:
        "The action exposes pagination controls as its own inputs (a cursor/offset/page input plus a page-size input), gives the numeric page-size a clean function using util.types.toInt or toNumber, fetches one page per call through createClient, and returns a { data: ... } object including both the page of records and the cursor/offset needed for the next page.",
    },
  ],
  meta: { skill: "component-patterns", tags: ["component", "pagination", "exposed-inputs"] },
});
