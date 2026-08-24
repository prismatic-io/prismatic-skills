import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, skillDir, withSkill } from "../_support.ts";

// Net-new batched polling trigger. Non-tautology: the prompt is behavioral only (high volume,
// per-record executions, bounded parallelism) and names none of the asserted symbols —
// triggerResolverSupport / batchConfig / concurrentBatchLimit / resolveItems all come from
// batching-triggers.md, not the prompt. The tempting wrong answer is a plain pollingTrigger
// that returns the whole poll as one payload, which sets none of them.
export default defineEvalCase({
  id: "component-patterns/polling-trigger-batch",
  prompt: withSkill(
    "component-patterns",
    `Build a brand-new Prismatic custom component polling trigger for an API that returns a
large number of changed records each poll. Each record needs its own downstream work (one
API call per record), a single bad record must not fail the whole run, and the parallelism
must be bounded so we don't overwhelm the tenant. This trigger is brand new — nothing depends
on its output yet. Write the trigger file(s) into the current working directory following
Prismatic conventions exactly.`,
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
      name: 'net-new trigger forces batching with triggerResolverSupport: "required"',
      command: `grep -rqE --exclude-dir=node_modules "triggerResolverSupport:[[:space:]]*[\\"']required[\\"']" .`,
    },
    {
      type: "command-exits-zero",
      name: "bounds parallelism with an integer concurrentBatchLimit",
      command: 'grep -rqE --exclude-dir=node_modules "concurrentBatchLimit:[[:space:]]*[0-9]+" .',
    },
    {
      type: "command-exits-zero",
      name: "declares a triggerResolver with resolveItems",
      command: 'grep -rq --exclude-dir=node_modules "resolveItems" .',
    },
    {
      type: "rubric",
      name: "required-resolver batching, passthrough resolveItems, bounded concurrency, no internal page loop",
      criteria:
        'Judge the generated trigger. It is built with pollingTrigger() and declares triggerResolverSupport: "required", a batchConfig with an integer concurrentBatchLimit (a bounded value such as 1, NOT omitted), and a triggerResolver.resolveItems. Because the trigger is net-new, perform returns the records already in item shape and resolveItems is a passthrough that just unwraps payload.body.data — it should NOT reshape/convert a { createdRecords, updatedRecords } envelope. Fail for: a plain pollingTrigger that returns the whole poll as one payload with no resolver, an omitted concurrentBatchLimit, a converting resolver on this net-new trigger, or a perform that drains every page in an internal while-loop instead of paginating.',
    },
  ],
  meta: {
    skill: "component-patterns",
    tags: ["component", "trigger", "polling", "batching"],
  },
});
