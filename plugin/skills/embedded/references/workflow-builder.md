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
