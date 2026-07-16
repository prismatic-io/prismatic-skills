import { defineEvalCase, type Run, toolCalls } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Companion to batch-flow-trigger.ts, but pins the batchSize > 1 path: grouped batches
// (onExecution receives an array) plus a concurrency cap. Pins the three numbers to the
// right homes — 500 is the API fetch page size (a request param), 50 is
// batchConfig.batchSize, 15 is batchConfig.concurrentBatchLimit. Non-tautology: the prompt
// carries only natural-language numbers and behavior (no batchSize/concurrentBatchLimit/
// batchFlowTrigger tokens), so the tempting wrong answers all fail a grep — hand-rolled
// .slice chunking + a Promise pool, putting 500 in batchSize, or mapping "15 at a time" to
// queueConfig.concurrencyLimit (which is also 2–15) instead of batchConfig.concurrentBatchLimit.
export default defineEvalCase({
  id: "integration-patterns/batch-flow-grouped-concurrency",
  prompt: withSkill(
    "integration-patterns",
    `Scaffold a Code Native Integration flow that runs on a schedule and pulls records from an
external API. Fetch the records from the API 500 at a time (that is its maximum page size) and
page through until there are none left. Process the fetched records in groups of 50, and make
sure no more than 15 of those groups are ever being processed at the same time. Write the
TypeScript files into the current directory. Do NOT deploy the integration and do NOT check my
Prismatic auth — just produce the code.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("integration-patterns")],
    idleTimeoutMs: 300_000,
    maxInterrupts: 6,
  }),
  ...scripted,
  assertions: [
    {
      type: "command-exits-zero",
      name: "declares batchConfig.batchSize of 50 (the group size, not the 500 fetch page)",
      command: 'grep -rqE --exclude-dir=node_modules "batchSize:[[:space:]]*50([^0-9]|$)" .',
    },
    {
      type: "command-exits-zero",
      name: "caps parallelism with batchConfig.concurrentBatchLimit of 15",
      command:
        'grep -rqE --exclude-dir=node_modules "concurrentBatchLimit:[[:space:]]*15([^0-9]|$)" .',
    },
    {
      type: "command-exits-zero",
      name: "builds the trigger with batchFlowTrigger",
      command: 'grep -rq --exclude-dir=node_modules "batchFlowTrigger" .',
    },
    {
      type: "predicate",
      name: "did not deploy or check auth",
      // Checks what the agent EXECUTED (prism_* MCP calls, Bash), not what it wrote.
      // A Bash command matching 2+ tokens is the agent grepping this list, not deploying.
      fn: (run: Run) => {
        if (calledPlatform(run)) return false;
        const tokens = [
          "integrations:import",
          "prism login",
          "instances:create",
          "graphql:query",
          "deploy-integration",
          "check-prism-access",
        ];
        return !toolCalls(run).some((c) => {
          if (c.name !== "Bash") return false;
          const cmd = JSON.stringify(c.input ?? {});
          return tokens.filter((t) => cmd.includes(t)).length === 1;
        });
      },
    },
    {
      type: "rubric",
      name: "grouped batches of 50, capped at 15 concurrent, three numbers in the right homes, no hand-rolled throttle",
      criteria:
        "Judge the generated code and the agent's explanation. The flow is a batched CNI flow whose batchConfig sets batchSize: 50 AND concurrentBatchLimit: 15, with a trigger built with batchFlowTrigger that pages through the source via the returned paginationState (returning null/omitting it to stop). The three numbers must land in the right homes: 500 is the API fetch page size — a request parameter (e.g. limit/pageSize: 500) inside the trigger's fetch call, NOT batchConfig.batchSize; 50 is batchConfig.batchSize; 15 is batchConfig.concurrentBatchLimit. Because batchSize > 1, onExecution processes an ARRAY of up to 50 records read from params.onTrigger.results.body.data (e.g. iterating or bulk-handling them), not a single record. (Note: a trigger that returns { items } while onExecution reads results.body.data is CORRECT and intended — spectral wraps the returned items into the wire payload's body.data; do NOT treat that as an inconsistency or a contract mismatch.) The agent writes the implementation to files rather than pasting every line into the reply — do NOT penalize a detail merely because its code lives in a written file; separate checks already verify batchSize: 50, concurrentBatchLimit: 15, and batchFlowTrigger. Fail for an actually-wrong approach: putting 500 in batchSize (conflating fetch page size with group size), expressing the 15-concurrency cap with queueConfig.concurrencyLimit instead of batchConfig.concurrentBatchLimit, hand-rolling the grouping/throttling (a .slice chunk loop or a Promise pool / p-limit inside onExecution) instead of using batchConfig, treating body.data as a single record, or deploying anything.",
    },
  ],
  meta: { skill: "integration-patterns", tags: ["cni", "batch", "trigger", "concurrency"] },
});
