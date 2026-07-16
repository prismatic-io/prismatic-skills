import { defineEvalCase, type Run, toolCalls } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins the CNI-only batched-flow shape: flow.batchConfig + a trigger built with
// batchFlowTrigger whose fire returns { items, paginationState? }. Non-tautology: the prompt
// is behavioral only (no batchConfig/batchFlowTrigger/paginationState/batchSize tokens), so
// the two tempting wrong answers — a plain polling flow (context.polling.getState/setState) or
// hand-rolled chunking with a for-loop inside onExecution — satisfy the prose yet fail every grep.
export default defineEvalCase({
  id: "integration-patterns/batch-flow-trigger",
  prompt: withSkill(
    "integration-patterns",
    `Scaffold a Code Native Integration flow that runs on a schedule and pulls orders from an
external API. The API returns orders one page at a time behind a cursor, and there can be
thousands of them. I want each order handled as its OWN independent execution — so a single
bad order fails and retries on its own instead of taking down the whole run — and the flow must
keep pulling pages until the API has no more orders. Write the TypeScript files into the current
directory. Do NOT deploy the integration and do NOT check my Prismatic auth — just produce the code.`,
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
      name: "declares a flow-level batchConfig block",
      command: 'grep -rqE --exclude-dir=node_modules "batchConfig:[[:space:]]*\\{" .',
    },
    {
      type: "command-exits-zero",
      name: "builds the trigger with batchFlowTrigger",
      command: 'grep -rq --exclude-dir=node_modules "batchFlowTrigger" .',
    },
    {
      type: "command-exits-zero",
      name: "paginates via the returned paginationState (not context.polling state)",
      command: 'grep -rq --exclude-dir=node_modules "paginationState" .',
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
      name: "batched flow with per-record dispatch + cursor pagination, no hand-rolled loop, nothing deployed",
      criteria:
        "Judge the generated code and the agent's explanation. The flow is a batched CNI flow: it declares batchConfig (with a batchSize — 1, so each order becomes its own execution) AND a trigger built with batchFlowTrigger whose fire returns { items, paginationState? } — items are the fetched orders and paginationState carries the next-page cursor, returned as null/omitted to stop, so the platform pages through until the source is exhausted. onExecution reads a single order from params.onTrigger.results.body.data. (Note: a trigger that returns { items } while onExecution reads results.body.data is CORRECT and intended — spectral wraps the returned items into the wire payload's body.data; do NOT treat that as an inconsistency or a contract mismatch.) The agent writes the implementation to files rather than pasting every line into the reply — do NOT penalize a detail merely because its code lives in a written file; separate checks already verify batchConfig, batchFlowTrigger, and paginationState. Fail only for an actually-wrong approach: a plain scheduled or polling flow that loops over the page inside onExecution (hand-rolled chunking, no per-record executions), a flat onTrigger declared alongside batchConfig (forbidden on a batched flow), reprocessing via context.polling state instead of paginationState, or deploying anything.",
    },
  ],
  meta: { skill: "integration-patterns", tags: ["cni", "batch", "trigger", "pagination"] },
});
