import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// The prompt supplies only Boomi tokens (processcall, abort=true, wait=true,
// process.orderId). The CNI targets — crossFlowState / "step context" and "synchronous
// execution" — are not in the prompt; they come only from the mapping references.
export default defineEvalCase({
  id: "boomi-migration/process-call-to-crossflow",
  prompt: withSkill(
    "boomi-migration",
    `I'm migrating a Boomi MAIN process that uses a Process Call shape ('shapetype' =
'processcall') with 'abort' = true and 'wait' = true to invoke another process, and
passes data into it through a Dynamic Process Property named 'process.orderId'. What are
the Prismatic CNI equivalents for (a) the Process Call shape, (b) the abort=true /
wait=true settings, and (c) the Dynamic Process Property? Answer from the mapping rules
only — don't run any tools or check my platform.`,
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
      name: "maps the Dynamic Process Property to step context / crossFlowState",
      pattern: "crossFlowState|step context",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "abort=true + wait=true -> synchronous execution",
      pattern: "synchronous",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "did not run tools or touch the platform",
      fn: (run: Run) =>
        !calledPlatform(run) &&
        !toolCallInputs(run).some((i) => i.includes("graphql:query") || i.includes("parse-export")),
    },
    {
      type: "rubric",
      name: "sub-flow invoke, synchronous+error-propagation, flow-scoped variable",
      criteria:
        "The response maps the Process Call shape to invoking a sub-flow (or inlining its steps), explains abort=true with wait=true means synchronous execution with error propagation to the caller, and maps the Dynamic Process Property (process.*) to a flow-scoped variable passed via step context or crossFlowState, answering from the mapping rules without running tools.",
    },
  ],
  meta: { skill: "boomi-migration", tags: ["migration", "boomi", "process-call", "cross-flow"] },
});
