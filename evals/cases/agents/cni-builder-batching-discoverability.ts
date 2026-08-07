import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir } from "../_support.ts";

// Pins batching discoverability from symptom language: a high-volume sync with an "initial sync of
// all existing records" must surface batchConfig + batchFlowTrigger during planning. The initial
// sync reads the SAME source as the ongoing poll (HubSpot Leads), so it belongs to the first poll
// (empty cursor → all existing Leads, batched) rather than a separate onDeploy backfill.
//
// Non-tautology: the prompt contains no "batch"/"batchFlowTrigger" token, so a plain polling flow
// that chunks writes at the application level fails the regex and the rubric.
export default defineEvalCase({
  id: "agents/cni-builder-batching-discoverability",
  prompt: `I need an integration that syncs Lead records from HubSpot into a MySQL database. It
should check for new or updated records every 3 minutes, and also do an initial sync of all the
records that already exist. Before we build anything — don't scaffold, search components, or check
my auth — just walk me through how you'd design this, and how you'd handle that initial sync of
existing records versus the ongoing checks.`,
  driver: claudeCode({
    agent: "cni-builder",
    readDirs: [skillDir("integration-patterns")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "surfaces batching even though the prompt never says 'batch'",
      pattern: "batch",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "ran nothing (stayed in planning)",
      fn: (run: Run) =>
        !calledPlatform(run) && !toolCallInputs(run).some((i) => i.includes("prismatic-tools")),
    },
    {
      type: "rubric",
      name: "surfaces batching from symptom language; treats the initial sync as the first poll; no over-engineered backfill",
      criteria:
        'The user described a high-volume record sync with an explicit initial sync of all existing records, but never said the word "batch". PASS requires BOTH: (1) the agent SURFACES batching — it proposes (or at minimum raises for the user to decide) a batched flow: batchConfig + a trigger built with batchFlowTrigger that dispatches records as independent per-batch executions; and (2) it treats the initial sync correctly — because the initial load and the ongoing poll read the SAME source (HubSpot Leads), the initial sync is NOT a separate mechanism: the first poll runs with an empty cursor and pulls all existing Leads (batched), and later polls handle only new/updated Leads. A strong answer also flags bounding batch concurrency (concurrentBatchLimit) to protect the tenant, and may mention onDeploy ONLY to note it is NOT needed here (it is for webhook flows or different-source backfills). FAIL if the agent never raises batching at all; or commits to a plain single-execution polling/scheduled flow that processes the whole fetch in one execution (at most application-level chunking); or insists the initial sync needs a separate bespoke backfill / onDeploy fire for this same-source case (over-engineering — the first poll already does it).',
    },
  ],
  meta: {
    agent: "cni-builder",
    priority: "P1",
    tags: ["cni-builder", "batch", "discoverability", "decision"],
  },
});
