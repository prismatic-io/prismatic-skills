# Embedding the Workflow Builder

## Overview

The embedded workflow builder lets your customers create and manage their own custom integrations directly inside your application. Unlike the integration marketplace (which deploys integrations you've built), the workflow builder lets customers build their own workflows from scratch using available components.

### Key differences from the low-code integration designer

| Aspect | Embedded Workflow Builder | Low-Code Designer |
|--------|--------------------------|-------------------|
| Flows per workflow | One flow per workflow | Multiple flows per integration |
| Configuration | Inline (connections/steps configured directly in the builder) | Separate config wizard |
| Connections | Scoped to the customer, reusable across their workflows | Per-instance config vars |
| Deployment | Single "Enable" button | Deploy via the platform |

## Show the Workflow List

```typescript
import prismatic from "@prismatic-io/embedded";

prismatic.showWorkflows({
  selector: "#workflow-builder-div",
  usePopover: false,
});
```

The workflow list shows all workflows the customer has created. From here they can create new workflows or open existing ones.

### Including standard integrations alongside workflows

By default the workflow list shows only customer-created workflows. To also include standard marketplace integrations:

```typescript
prismatic.showWorkflows({
  selector: "#workflow-builder-div",
  screenConfiguration: {
    workflows: {
      includeIntegrations: true,
    },
  },
});
```

## Open a Specific Workflow

```typescript
prismatic.showWorkflow({
  workflowId: "SW50ZWdyYXRpb246...", // Prismatic workflow ID
  selector: "#builder-div",
  usePopover: false,
});
```

## Workflow Contexts (Automation Entry Points)

A **workflow context** is defined once at the organization level (Organization Settings → Workflow Contexts) and referenced from your app by a stable key. It pins a trigger with pre-filled inputs and a curated action palette, so customers start from a guided workflow instead of a blank canvas. Use contexts to offer in-app "create automation" entry points — for example, a **Create automation** button on a ticket detail page that spins up a workflow already wired to your "Ticket updated" trigger and scoped to that ticket.

### Create a workflow from a context

`prismatic.createWorkflow(contextStableKey, args)` creates the workflow and returns a GraphQL response. Read the new workflow's ID and open it in the builder with `showWorkflow`:

```tsx
import prismatic from "@prismatic-io/embedded";

async function createTicketAutomation(ticket: { id: string; projectId: string }) {
  const response = await prismatic.createWorkflow("ticket-automation", {
    name: `Automation for ticket ${ticket.id}`,
    contextData: { projectId: ticket.projectId, priority: "high" },
    externalId: ticket.id,
  });

  const workflowId = response.data.importWorkflow.workflow.id;
  prismatic.showWorkflow({ workflowId, selector: "#embedded-workflow-div" });
}
```

`contextData` is typed per context: extend the `WorkflowContexts` interface via module augmentation, or generate the declarations with `npx @prismatic-io/embedded generate-types`.

### List workflows for a record

`prismatic.queryWorkflows(props?)` returns the customer's workflows, optionally filtered by `contextStableKey` or the `externalId` you passed to `createWorkflow`. Use it to show the automations already attached to a record:

```typescript
const response = await prismatic.queryWorkflows({
  contextStableKey: "ticket-automation",
  externalId: ticket.id,
});
const workflows = response.data.workflows.nodes;
```

Other optional filters: `searchTerm`, `descriptionSearch`, `categorySearch`, `labelSearch`, `sortBy`, `first`, `cursor`.

## Workflow Events

```typescript
import { PrismaticMessageEvent } from "@prismatic-io/embedded";

window.addEventListener("message", (event) => {
  switch (event.data.event) {
    case PrismaticMessageEvent.WORKFLOW_ENABLED:
      console.log("Customer enabled a workflow");
      break;
    case PrismaticMessageEvent.WORKFLOW_DISABLED:
      console.log("Customer disabled a workflow");
      break;
  }
});
```

## Prerequisites for Using the Embedded Workflow Builder

1. Your Prismatic plan must include the embedded workflow builder feature
2. You need to configure which components are available to customers (done in org settings)
3. Customers interact with the builder as authenticated users (same JWT auth as marketplace)

## Testing During Development

The fastest way to preview the embedded workflow builder without setting up your app is the **Embedded Preview** in Prismatic:

1. Go to organization settings
2. Click the **Embedded** tab
3. Click **Embedded Preview** → **Launch**

This lets you see exactly what your customers will see before wiring up the integration.

## Screen Configuration Options

```typescript
prismatic.showWorkflows({
  selector: "#workflows-div",
  screenConfiguration: {
    workflows: {
      includeIntegrations: true, // show marketplace integrations alongside customer workflows
    },
    designer: {
      hideInstances: false,
      hideMarketplace: false,
      hideRemoveIntegration: false,
    },
  },
});
```
