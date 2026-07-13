import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins the builder API surface: prismatic.showWorkflows (list) and showWorkflow (open one
// directly), plus the WORKFLOW_ENABLED / WORKFLOW_DISABLED events (not marketplace
// INSTANCE_* events). Non-tautology: the prompt names no SDK symbol; all come only from
// workflow-builder.md and sdk-api.md.
export default defineEvalCase({
  id: "embedded/workflow-builder-vs-marketplace",
  prompt: withSkill(
    "embedded-patterns",
    `We already embed the Prismatic integration marketplace in our app. Now we want to
let our customers build their own automations from scratch. Explain how embedding the
workflow builder differs from the marketplace, show how to display the list of a
customer's workflows and how to open one specific workflow straight into the builder from
our own button, and explain how we can tell when a customer turns one of their workflows
on or off.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("embedded-patterns")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 3,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "renders the workflow list with prismatic.showWorkflows",
      pattern: "showWorkflows",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "opens a specific workflow directly with prismatic.showWorkflow",
      pattern: "showWorkflow\\b",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "detects on/off via the builder WORKFLOW_ENABLED/DISABLED events",
      pattern: "WORKFLOW_(ENABLED|DISABLED)",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "builder-vs-marketplace distinction plus correct API surface",
      criteria:
        "The answer distinguishes the workflow builder (customers build their own workflows; one flow per workflow; inline configuration; customer-scoped reusable connections; single Enable/Disable) from the marketplace (customers activate integrations you built), shows prismatic.showWorkflows({ selector }) to render the list and prismatic.showWorkflow({ workflowId, selector }) to open one specific workflow directly, detects on/off via WORKFLOW_ENABLED/WORKFLOW_DISABLED rather than INSTANCE_* events, and notes the builder uses the same JWT auth as the marketplace.",
    },
  ],
  meta: { skill: "embedded-patterns", tags: ["embedded", "workflow-builder", "sdk"] },
});
