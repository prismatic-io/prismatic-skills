import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// The prompt supplies only Boomi vocabulary plus createClient; the asserted isAxiosError
// guard and error.response-based status read come only from the skill, so a naive answer
// that branches on a returned response.status fails.
export default defineEvalCase({
  id: "boomi-migration/catch-errors-http-status-to-try-catch",
  prompt: withSkill(
    "boomi-migration",
    `I'm converting a Boomi process that wraps an HTTP connector call in a Catch Errors
shape, and downstream it routes responses by HTTP status: 200 goes down a success path
and 400 goes down an error path. In Prismatic CNI I'm using Spectral's 'createClient'.
How should I structure this error handling in TypeScript? Explain the pattern and show
the code shape. Do not run anything or touch my platform.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("boomi-migration")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "guards the catch block with axios.isAxiosError",
      pattern: "isAxiosError",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "reads status off the caught error's .response",
      pattern: "error\\.response",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "did not run anything or touch the platform",
      fn: (run: Run) =>
        !calledPlatform(run) &&
        !toolCallInputs(run).some((i) => i.includes("graphql:query") || i.includes("parse-export")),
    },
    {
      type: "rubric",
      name: "throwing client -> try/catch; 200/400 route via status inside catch",
      criteria:
        "The answer explains that createClient wraps axios.create() with no custom validateStatus so the client throws on 4xx/5xx; therefore checking response.status after an awaited request is dead code, and status-specific handling (the 400 path) belongs inside a catch guarded by axios.isAxiosError(error) && error.response?.status; it maps the Boomi Catch Errors shape to a try/catch wrapper and the 200/400 route to status checks inside the catch, not to branching on a returned status.",
    },
  ],
  meta: { skill: "boomi-migration", tags: ["migration", "boomi", "http", "error-handling"] },
});
