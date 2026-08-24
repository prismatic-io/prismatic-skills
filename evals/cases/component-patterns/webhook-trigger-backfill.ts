import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, skillDir, withSkill } from "../_support.ts";

// Webhook trigger paired with a deploy-time historical sync. Non-tautology: the prompt states the
// behavior (live events carry only ids; deployment should also pull existing records) and names
// neither onDeployPerform nor the fetch-by-id step. batching-triggers.md → "Webhook triggers" is
// the only source of both. The tempting wrong answer emits the raw event payload and has no
// historical sync at all (a webhook only delivers go-forward events).
export default defineEvalCase({
  id: "component-patterns/webhook-trigger-backfill",
  prompt: withSkill(
    "component-patterns",
    `Build a Prismatic custom component webhook trigger. The API's webhook events carry only a
record id and an event type, not the full record. Downstream needs the complete record objects.
On top of live events, when an integration is first deployed the trigger should also sync the
records that already existed (the webhook will never resend those). Write the trigger file(s)
into the current working directory following Prismatic conventions exactly.`,
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
      name: "syncs historical records on deploy via onDeployPerform",
      command: 'grep -rq --exclude-dir=node_modules "onDeployPerform" .',
    },
    {
      type: "rubric",
      name: "onDeploy backfill + live perform fetches full records for the event ids",
      criteria:
        "Judge the generated trigger. It defines onDeployPerform to pull the pre-existing records once on instance deploy (the webhook cannot resend them), and its live perform FETCHES the full record(s) by the id(s) carried in the webhook event rather than emitting the raw event payload — so the live feed and the backfill emit the same complete record shape. Credit is fine whether or not it also batches. Fail for: no historical sync at all, or a perform that forwards the id-only event payload downstream without fetching the full records.",
    },
  ],
  meta: {
    skill: "component-patterns",
    tags: ["component", "trigger", "webhook", "initial-sync", "batching"],
  },
});
