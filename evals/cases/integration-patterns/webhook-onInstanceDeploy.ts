import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

export default defineEvalCase({
  id: "integration-patterns/webhook-onInstanceDeploy",
  prompt: withSkill(
    "integration-patterns",
    `Add a webhook-triggered flow to a Prismatic Code Native Integration,
including verifying the incoming payload and using the onInstanceDeploy
lifecycle hook to register the webhook with the upstream API. Write the
file(s) into the current directory.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("integration-patterns")],
    idleTimeoutMs: 240_000,
    maxInterrupts: 6,
  }),
  ...scripted,
  assertions: [
    { type: "glob-count", glob: "**/*.ts", min: 1 },
    {
      type: "command-exits-zero",
      name: "registers via context.webhookUrls",
      command: 'grep -rqE --exclude-dir=node_modules "webhookUrls\\[" .',
    },
    {
      type: "command-exits-zero",
      name: "implements onInstanceDeploy",
      command: "grep -rq --exclude-dir=node_modules onInstanceDeploy .",
    },
    {
      type: "rubric",
      name: "webhook trigger + lifecycle hook usage",
      criteria:
        "Judge the generated code and the agent's explanation. The webhook trigger is defined on the flow definition (not as an action); the onInstanceDeploy hook registers using context.webhookUrls[<flow name>] rather than a hardcoded URL or invented helper; payload access follows the documented trigger payload pattern; and any added config uses configVar / connectionConfigVar / dataSourceConfigVar rather than raw object literals. The agent writes the implementation to files rather than pasting every line into the reply — do NOT penalize a detail merely because its code lives in a written file instead of the prose; a separate check already verifies webhookUrls[...] and onInstanceDeploy are present. Fail only for an actually-wrong approach (hardcoded URL, webhook-as-action, raw-object config, invented payload shape).",
    },
  ],
  meta: { skill: "integration-patterns", tags: ["cni", "webhook", "lifecycle"] },
});
