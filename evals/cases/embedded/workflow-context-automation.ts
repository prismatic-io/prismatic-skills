import { defineEvalCase, type Run } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins the workflow-contexts surface: create a pre-configured workflow from an org-defined
// context via prismatic.createWorkflow (contextStableKey + contextData + externalId), open
// it with prismatic.showWorkflow, and list a record's automations with queryWorkflows.
// Non-tautology: the prompt describes the scenario ("already wired", "scoped to that
// ticket", "list the automations for it") but names no SDK symbol; all come only from
// workflow-builder.md and sdk-api.md.
export default defineEvalCase({
  id: "embedded/workflow-context-automation",
  prompt: withSkill(
    "embedded-patterns",
    `Our SaaS is a customer-support tool and we already embed the Prismatic workflow
builder. On each ticket's detail page we want a "Create automation" button. When an agent
clicks it, the customer should get a NEW workflow that is already wired to the right
trigger and scoped to that ticket — not a blank canvas — and then land directly in the
embedded builder to finish it. Later, on that same ticket, we want to list the automations
the customer has already created for it so they can jump back in. How do we build this?
Give me the approach and the code — do NOT run anything against my account and don't check
my auth.`,
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
      name: "creates a workflow from a context via prismatic.createWorkflow",
      pattern: "createWorkflow",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "passes the context key / injected data (contextStableKey or contextData)",
      pattern: "context(StableKey|Data)",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "opens the created workflow directly with prismatic.showWorkflow",
      pattern: "showWorkflow\\b",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "lists the ticket's automations with prismatic.queryWorkflows",
      pattern: "queryWorkflows",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "did not run anything against the account",
      fn: (run: Run) => !calledPlatform(run),
    },
    {
      type: "rubric",
      name: "workflow-context create → open → list, nothing rebuilt or executed",
      criteria:
        "The answer builds on an org-defined workflow context: it calls prismatic.createWorkflow(contextStableKey, { name, contextData, externalId }) to create a pre-configured workflow scoped to the ticket (passing the ticket's id as externalId and ticket fields as contextData), reads the new workflow's id from the response and opens it in the embedded builder with prismatic.showWorkflow({ workflowId, selector }), and lists that ticket's existing automations with prismatic.queryWorkflows({ externalId }). It does NOT hand-roll the trigger wiring or start from a blank workflow, and it executes nothing against the account.",
    },
  ],
  meta: {
    skill: "embedded-patterns",
    tags: ["embedded", "workflow-builder", "workflow-contexts", "automation"],
  },
});
