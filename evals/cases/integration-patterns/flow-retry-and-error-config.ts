import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins both retry layers: immediate step retry (errorConfig.errorHandlerType, seconds)
// and delayed whole-flow re-invocation (retryConfig, minutes). Non-tautology: the SDK
// field names are absent from the prompt, so a hand-rolled Math.pow loop that satisfies
// the prose still fails all three greps.
export default defineEvalCase({
  id: "integration-patterns/flow-retry-and-error-config",
  prompt: withSkill(
    "integration-patterns",
    `I have a Code Native Integration flow whose onExecution calls a flaky third-party
API. Configure the flow so that (a) if a single execution attempt fails it retries
immediately a couple of times before giving up, and (b) if it still fails, the
platform re-invokes the entire flow after a delay, backing off exponentially, giving
up after 5 attempts. Write the flow definition into the current directory. Do not
deploy or run anything against my account.`,
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
      name: "declares a flow-level retryConfig block",
      command: 'grep -rqE --exclude-dir=node_modules "retryConfig:[[:space:]]*\\{" .',
    },
    {
      type: "command-exits-zero",
      name: "declares an errorConfig.errorHandlerType for the immediate retry",
      command: 'grep -rq --exclude-dir=node_modules "errorHandlerType" .',
    },
    {
      type: "command-exits-zero",
      name: "uses the declarative usesExponentialBackoff flag (not a hand-rolled loop)",
      command: 'grep -rq --exclude-dir=node_modules "usesExponentialBackoff" .',
    },
    {
      type: "rubric",
      name: "both retry layers, correct time units, no hand-rolled loop",
      criteria:
        'The flow declares both a retryConfig (maxAttempts: 5, a delayMinutes value, usesExponentialBackoff: true — delayed whole-flow retry in minutes) and an errorConfig with errorHandlerType: "retry" using delaySeconds (immediate step retry in seconds), correctly distinguishing minutes-scale whole-flow retry from seconds-scale immediate retry, and does NOT implement retry as a hand-rolled setTimeout/Math.pow loop nor deploy anything.',
    },
  ],
  meta: { skill: "integration-patterns", tags: ["cni", "retry", "error-config"] },
});
