import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, skillDir, withSkill } from "../_support.ts";

// Initial sync on a polling trigger. Non-tautology: the prompt asks for the BEHAVIOR (bring in
// records that already existed at deploy, then poll incrementally) and names neither mechanism.
// batching-triggers.md offers exactly two: a look-back date input driving the first poll, or
// onDeployPerform. The tempting wrong answers — poll only from "now" (history missed) or re-fetch
// everything every poll (reprocessing) — satisfy neither the look-back nor the onDeploy path.
export default defineEvalCase({
  id: "component-patterns/polling-trigger-initial-sync",
  prompt: withSkill(
    "component-patterns",
    `Build a Prismatic custom component polling trigger that reads changed records from an API.
When an integration is first deployed it should also bring in the records that already existed
before deployment (a one-time historical sync), and after that first load it should only pick up
new and changed records on each subsequent poll — never reprocessing what it already handled.
The historical records live in the same records endpoint the ongoing poll reads. Write the
trigger file(s) into the current working directory following Prismatic conventions.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("component-patterns")],
    idleTimeoutMs: 300_000,
    maxInterrupts: 4,
  }),
  assertions: [
    { type: "glob-count", glob: "**/*.ts", min: 1, name: "wrote a trigger source file" },
    {
      type: "command-exits-zero",
      name: "seeds history via a look-back input or an onDeployPerform backfill",
      command: 'grep -rqiE --exclude-dir=node_modules "look.?back|onDeployPerform" .',
    },
    {
      type: "command-exits-zero",
      name: "advances an incremental cursor with context.polling.setState",
      command: 'grep -rq --exclude-dir=node_modules "polling.setState" .',
    },
    {
      type: "rubric",
      name: "one-time backfill (look-back first poll or onDeployPerform), then incremental",
      criteria:
        'Judge the generated trigger and explanation. Because the backfill and the ongoing poll read the SAME source, the expected shape is a look-back date input: the first poll (no persisted cursor yet) starts its window from that date and backfills existing records once, then persists a watermark via context.polling.setState and polls incrementally. An onDeployPerform-based backfill is also acceptable. Fail for: a trigger that only ever polls from "now" (so pre-existing records are silently never synced), or one that re-fetches the entire dataset on every poll (reprocessing) with no watermark that advances across runs.',
    },
  ],
  meta: {
    skill: "component-patterns",
    tags: ["component", "trigger", "polling", "initial-sync", "batching"],
  },
});
