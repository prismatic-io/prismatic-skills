import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Component-level webhook trigger with register/teardown lifecycle hooks.
// Non-tautology: the asserted symbols (onInstanceDeploy/onInstanceDelete,
// webhookUrls[context.flow.name], instanceState) come only from trigger-patterns.md;
// none appear in the prompt.
export default defineEvalCase({
  id: "component-patterns/webhook-trigger-lifecycle",
  prompt: withSkill(
    "component-patterns",
    `Generate a Prismatic custom component trigger that lets an integration receive
real-time events from a third-party API via a callback URL. When an instance is
deployed the trigger should register that callback with the API, and when the
instance is removed it should tear the registration back down. Write the file(s)
into the current working directory. Follow Prismatic conventions exactly.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("component-patterns")],
    idleTimeoutMs: 300_000,
    maxInterrupts: 4,
  }),
  ...scripted,
  assertions: [
    { type: "glob-count", glob: "**/*.ts", min: 1, name: "wrote a trigger source file" },
    {
      type: "command-exits-zero",
      name: "defines both onInstanceDeploy and onInstanceDelete lifecycle hooks",
      command:
        'grep -rq --exclude-dir=node_modules "onInstanceDeploy" . && grep -rq --exclude-dir=node_modules "onInstanceDelete" .',
    },
    {
      type: "command-exits-zero",
      name: "registers via the webhookUrls[context.flow.name] path",
      command: 'grep -rqF --exclude-dir=node_modules "webhookUrls[context.flow.name]" .',
    },
    {
      type: "command-exits-zero",
      name: "persists the registration id via instanceState",
      command: 'grep -rq --exclude-dir=node_modules "instanceState" .',
    },
    {
      type: "rubric",
      name: "register/cleanup lifecycle, payload passthrough, scheduleSupport invalid",
      criteria:
        'The trigger registers its callback in onInstanceDeploy using context.webhookUrls[context.flow.name], stores the returned id in instanceState, deregisters it in onInstanceDelete using that stored id, and its perform returns the full incoming TriggerPayload as-is (return { payload }) rather than a reconstructed subset, with scheduleSupport set to "invalid".',
    },
  ],
  meta: { skill: "component-patterns", tags: ["component", "trigger", "webhook", "lifecycle"] },
});
