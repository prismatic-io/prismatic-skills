import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins cross-flow state (crossFlowState or integrationState) as the cursor handoff
// from onInstanceDeploy to the scheduled onExecution (instanceState is unavailable in
// lifecycle hooks). Non-tautology: the prompt names no hook or state object;
// instanceState is the documented wrong answer.
export default defineEvalCase({
  id: "integration-patterns/deploy-vs-execution-baseline",
  prompt: withSkill(
    "integration-patterns",
    `I'm building a Code Native Integration that syncs records from a CRM. When a
customer first sets it up it should do a one-time backfill of all their existing
records; after that, a scheduled flow should pull only records changed since the
previous run. Where in the integration should the one-time backfill run, and how do I
hand the 'where I left off' marker from that one-time step to the scheduled
executions so they don't refetch everything? Explain the approach and name the
specific context state object to use. Do not write a full integration and do not
deploy or check my auth.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("integration-patterns")],
    idleTimeoutMs: 240_000,
    maxInterrupts: 3,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "hands off the cursor via crossFlowState or integrationState",
      pattern: "crossFlowState|integrationState",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "runs the one-time backfill in onInstanceDeploy",
      pattern: "onInstanceDeploy",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "did not deploy or check auth",
      fn: (run: Run) =>
        !calledPlatform(run) &&
        !toolCallInputs(run).some((i) =>
          /integrations:import|prism login|instances:create|graphql:query/.test(i),
        ),
    },
    {
      type: "rubric",
      name: "backfill in deploy hook, incremental in onExecution, cursor in crossFlowState",
      criteria:
        "The answer places the one-time backfill in onInstanceDeploy guarded by an idempotency flag (e.g. baselineComplete), puts the incremental changed-since sync in the scheduled flow's onExecution, and correctly explains that instanceState is NOT available in lifecycle hooks so the cursor must be stored in crossFlowState (or integrationState) to hand off from the deploy hook to scheduled executions.",
    },
  ],
  meta: { skill: "integration-patterns", tags: ["cni", "lifecycle", "state", "baseline"] },
});
