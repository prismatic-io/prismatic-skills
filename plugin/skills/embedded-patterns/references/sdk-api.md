# Embedded SDK API Reference

## Contents

- [Installation](#installation)
- [prismatic.init](#prismaticinit) — Initialize the SDK
- [prismatic.authenticate](#prismaticauthenticate) — Authenticate with JWT
- [prismatic.showMarketplace](#prismaticshowmarketplace) — Marketplace screen
- [prismatic.configureInstance](#prismaticconfigureinstance) — Config wizard
- [prismatic.editInstanceConfiguration](#prismaticeditinstanceconfiguration) — Reconfigure an existing instance inline
- [prismatic.showWorkflows / showWorkflow](#prismaticshowworkflows) — Workflow builder
- [prismatic.createWorkflow / queryWorkflows](#prismaticcreateworkflow) — Workflow contexts (automation entry points)
- [prismatic.showDashboard](#prismaticshowdashboard) — Customer dashboard
- [prismatic.showConnections](#prismaticshowconnections) — Connection management
- [prismatic.showLogs](#prismaticshowlogs) — Logs screen
- [prismatic.showComponents / showComponent](#prismaticshowcomponents) — Component browser
- [prismatic.setConfigVars](#prismaticsetconfigvars) — Programmatic config
- [prismatic.graphqlRequest](#prismaticgraphqlrequest) — Authenticated GraphQL
- [prismatic.closePopover](#prismaticclosepopover) — Close popover
- [Type Reference](#type-reference) — ScreenConfiguration, Filters, PrismaticMessageEvent, Fonts, Translations
- [Utility Functions](#utility-functions) — getMessageIframe, closePopover

## Installation

```bash
npm install @prismatic-io/embedded
```

```typescript
import prismatic from "@prismatic-io/embedded";
// Named exports:
import { getMessageIframe, closePopover, PrismaticMessageEvent, BooleanOperator, TermOperator } from "@prismatic-io/embedded";
```

## prismatic.init(options?)

Initialize the SDK. Call this once at app startup before any other method.

```typescript
// Minimal
prismatic.init();

// With options
prismatic.init({
  prismaticUrl: "https://integrations.my-company.com", // custom domain or EU region
  theme: "LIGHT",
  fontConfiguration: {
    google: { families: ["Inter"] },
  },
  screenConfiguration: { /* see ScreenConfiguration below */ },
  translation: { /* see Translation below */ },
  filters: { /* see Filters below */ },
});
```

**EU region:** `prismaticUrl: "https://app.eu-west-1.prismatic.io"`

## prismatic.authenticate({ token })

Authenticate with a signed JWT. Must be called after `init()` and before showing any screen.

```typescript
await prismatic.authenticate({ token: "eyJhbGci..." });
```

Throws if the JWT is invalid, incorrectly signed, or expired. Re-call with a new token to refresh — all active iframes update automatically.

## prismatic.showMarketplace(options?)

Show the integration marketplace. See `references/marketplace.md` for full details.

```typescript
// Inline iframe
prismatic.showMarketplace({
  selector: "#marketplace-div",
  usePopover: false,
  theme: "LIGHT",
});

// Popover
prismatic.showMarketplace({ usePopover: true });
```

## prismatic.configureInstance(props)

Open a configuration wizard for an integration.

```typescript
// By integration name
prismatic.configureInstance({
  integrationName: "Salesforce",
  usePopover: true,
  skipRedirectOnRemove: false, // if true, don't redirect to marketplace after removal
});

// By instance ID (for re-configuring an existing instance)
prismatic.configureInstance({
  instanceId: "SW5zdGFuY2U6...",
  usePopover: true,
});
```

## prismatic.editInstanceConfiguration(props)

Render the config wizard for an **existing** instance directly into a DOM element — no popover, no intermediate instance screen with a "Reconfigure" button. Use this to let a customer adjust a deployed instance inline inside your own dialog or drawer. Unlike `configureInstance`, it opens the wizard immediately, takes lifecycle callbacks, and returns a cleanup function that removes its listeners.

```typescript
const cleanup = prismatic.editInstanceConfiguration({
  instanceId: "SW5zdGFuY2U6...",
  selector: "#config-panel",
  theme: "LIGHT",
  screenConfiguration: {
    configurationWizard: { triggerDetailsConfiguration: "hidden" },
  },
  onSuccess: () => closeDialog(),
  onCancel: () => closeDialog(),
  onDelete: () => closeDialog(),
});

cleanup?.();
```

## prismatic.showWorkflows(options?)

Show the workflow builder list screen.

```typescript
prismatic.showWorkflows({
  selector: "#workflows-div",
  usePopover: false,
});
```

## prismatic.showWorkflow({ workflowId, ...options })

Open a specific workflow in the workflow builder.

```typescript
prismatic.showWorkflow({
  workflowId: "SW50ZWdyYXRpb246...",
  selector: "#builder-div",
  usePopover: false,
});
```

## prismatic.createWorkflow(contextStableKey, args)

Create a workflow for the authenticated customer user from an org-defined **workflow context** — a pre-configured trigger, curated action palette, and data your app injects. This powers an in-app "create automation" entry point (for example, a button on a ticket or deal page) that starts the customer from a guided workflow instead of a blank canvas. Returns a GraphQL response; read the new workflow's ID and open it with `showWorkflow`.

```typescript
const response = await prismatic.createWorkflow("ticket-automation", {
  name: "Notify on high-priority tickets",
  contextData: { projectId: "proj_abc123", priority: "high" },
  externalId: "ticket_1234",
});

const workflowId = response.data.importWorkflow.workflow.id;
prismatic.showWorkflow({ workflowId, selector: "#builder-div" });
```

`contextStableKey` is the stable key of a context configured under **Organization Settings → Workflow Contexts**. Extend the `WorkflowContexts` interface (or run `npx @prismatic-io/embedded generate-types`) to type each context's `contextData`.

## prismatic.queryWorkflows(props?)

List the authenticated customer user's workflows, optionally filtered by the context they were created from or the `externalId` you supplied at creation. Use it to show the automations tied to a specific record — "the workflows attached to this ticket."

```typescript
const response = await prismatic.queryWorkflows({
  contextStableKey: "ticket-automation",
  externalId: "ticket_1234",
});
const workflows = response.data.workflows.nodes;
```

Optional props: `searchTerm`, `descriptionSearch`, `categorySearch`, `labelSearch`, `contextStableKey`, `externalId`, `sortBy`, `first`, `cursor`.

## prismatic.showDashboard(options?)

Embed the customer dashboard.

```typescript
prismatic.showDashboard({
  selector: "#dashboard-div",
  screenConfiguration: {
    dashboard: {
      hideTabs: ["Attachments", "Components"],
    },
  },
});
```

## prismatic.showConnections(options?)

Embed the connections management screen.

```typescript
prismatic.showConnections({ selector: "#connections-div", usePopover: false });
```

## prismatic.showLogs(options?)

Embed the logs screen.

```typescript
prismatic.showLogs({ selector: "#logs-div", usePopover: false });
```

## prismatic.showComponents(options?)

Embed the component browser.

```typescript
prismatic.showComponents({
  selector: "#components-div",
  filters: { components: { category: "Data Platforms" } },
});
```

## prismatic.showComponent({ componentId, ...options })

Show a specific component's details.

```typescript
prismatic.showComponent({
  componentId: "Q29tcG9uZW50Oi...",
  usePopover: true,
});
```

## prismatic.setConfigVars({ iframe, configVars })

Programmatically set config variable values inside an open config wizard. Use this in response to the `INSTANCE_CONFIGURATION_LOADED` event.

```typescript
import { getMessageIframe } from "@prismatic-io/embedded";

window.addEventListener("message", (message) => {
  if (message.data.event === "INSTANCE_CONFIGURATION_LOADED") {
    const iframe = getMessageIframe(message);
    prismatic.setConfigVars({
      iframe,
      configVars: {
        "API Key": { value: "my-api-key" },
        "String Valuelist": { value: ["Value 1", "Value 2"] },
        "String Keyvaluelist": {
          value: [
            { key: "Key A", value: "Value A" },
          ],
        },
        "My Connection": {
          inputs: {
            username: { value: "user@example.com" },
            password: { value: "secret" },
          },
        },
      },
    });
  }
});
```

## prismatic.graphqlRequest({ query, variables? })

Execute an authenticated GraphQL query against the Prismatic API.

```typescript
const result = await prismatic.graphqlRequest({
  query: `query { marketplaceIntegrations { nodes { id name } } }`,
});
```

## prismatic.closePopover()

Programmatically close an open popover.

## Type Reference

### Options (all screen methods)

```typescript
// Inline embedding
interface SelectorOptions {
  selector: string;         // CSS selector for the container element
  usePopover?: false;
  theme?: "LIGHT" | "DARK";
  autoFocusIframe?: boolean;
  filters?: Filters;
  screenConfiguration?: ScreenConfiguration;
  translation?: Translation;
}

// Popover
interface PopoverOptions {
  usePopover: true;
  theme?: "LIGHT" | "DARK";
  autoFocusIframe?: boolean;
  filters?: Filters;
  screenConfiguration?: ScreenConfiguration;
  translation?: Translation;
}
```

### ScreenConfiguration

```typescript
interface ScreenConfiguration {
  initializing?: {
    background: string; // CSS color value
    color: string;      // CSS color value for loading icon/text
  };
  marketplace?: {
    configuration?: "allow-details" | "always-show-details" | "disallow-details";
    hideSearch?: boolean;
    hideActiveIntegrationsFilter?: boolean;
  };
  configureInstance?: {
    configuration?: "allow-details" | "always-show-details" | "disallow-details";
  };
  instance?: {
    hideBackToMarketplace?: boolean;
    hideTabs?: Array<"Test" | "Executions" | "Logs">;
    hidePauseButton?: boolean;
    hideDeactivation?: boolean;
  };
  configurationWizard?: {
    mode?: "streamlined" | "traditional";
    connectionConfiguration?: "inline" | "reusable"; // default: "reusable"
    hideSidebar?: boolean;
    isInModal?: boolean;
    triggerDetailsConfiguration?: "default" | "default-open" | "hidden";
    logsDisabled?: "always" | "never" | "optional";       // default: "never"
    stepResultsDisabled?: "always" | "never" | "optional"; // default: "never"
  };
  dashboard?: {
    hideTabs?: Array<
      | "Attachments" | "Components" | "Credentials"
      | "Executions" | "Instances" | "Integrations"
      | "Logs" | "Marketplace"
    >;
  };
  designer?: {
    hideInstances?: boolean;
    hideMarketplace?: boolean;
    hideRemoveIntegration?: boolean;
  };
  workflows?: {
    includeIntegrations?: boolean;
  };
}
```

### Filters

```typescript
interface Filters {
  marketplace?: {
    category?: string;
    label?: string;
    filterQuery?: ConditionalExpression; // see advanced filtering below
    includeActiveIntegrations?: boolean;
    strictMatchFilterQuery?: boolean;
  };
  components?: {
    category?: string;
    label?: string;
    filterQuery?: ConditionalExpression;
  };
  integrations?: {
    category?: string;
    label?: string;
  };
}
```

### Advanced Filtering

```typescript
import { BooleanOperator, TermOperator } from "@prismatic-io/embedded";

// TermOperator values:
// equal, notEqual, in, notIn, startsWith, doesNotStartWith, endsWith, doesNotEndWith

// BooleanOperator values: and, or

prismatic.showMarketplace({
  filters: {
    marketplace: {
      filterQuery: [
        BooleanOperator.or,
        [TermOperator.equal, "category", "ERP"],
        [TermOperator.equal, "name", "Dropbox"],
        [
          BooleanOperator.and,
          [TermOperator.in, "labels", "featured"],
          [TermOperator.startsWith, "name", "Sales"],
        ],
      ],
    },
  },
});
```

### PrismaticMessageEvent Enum

```typescript
enum PrismaticMessageEvent {
  // Instance/marketplace events
  INSTANCE_CREATED = "INSTANCE_CREATED",
  INSTANCE_CONFIGURATION_OPENED = "INSTANCE_CONFIGURATION_OPENED",
  INSTANCE_CONFIGURATION_LOADED = "INSTANCE_CONFIGURATION_LOADED",    // best time to setConfigVars
  INSTANCE_CONFIGURATION_PAGE_LOADED = "INSTANCE_CONFIGURATION_PAGE_LOADED",
  INSTANCE_CONFIGURATION_CLOSED = "INSTANCE_CONFIGURATION_CLOSED",
  INSTANCE_DEPLOYED = "INSTANCE_DEPLOYED",
  INSTANCE_DELETED = "INSTANCE_DELETED",
  POPOVER_CLOSED = "POPOVER_CLOSED",
  MARKETPLACE_CLOSED = "MARKETPLACE_CLOSED",

  // User-level configuration events (ULC)
  USER_CONFIGURATION_OPENED = "USER_CONFIGURATION_OPENED",
  USER_CONFIGURATION_LOADED = "USER_CONFIGURATION_LOADED",             // best time to setConfigVars
  USER_CONFIGURATION_PAGE_LOADED = "USER_CONFIGURATION_PAGE_LOADED",
  USER_CONFIGURATION_CLOSED = "USER_CONFIGURATION_CLOSED",
  USER_CONFIGURATION_DEPLOYED = "USER_CONFIGURATION_DEPLOYED",
  USER_CONFIGURATION_DELETED = "USER_CONFIGURATION_DELETED",

  // Workflow builder events
  WORKFLOW_ENABLED = "WORKFLOW_ENABLED",
  WORKFLOW_DISABLED = "WORKFLOW_DISABLED",
}
```

### Event Data Shape

All events (except `INSTANCE_CONFIGURATION_LOADED`) return:

```typescript
{
  event: string; // PrismaticMessageEvent value
  data: {
    customerId: string;
    customerName: string;
    instanceId: string;
    instanceName: string;
    integrationName: string;
    integrationVersionNumber: number;
    readOnly: boolean;
  }
}
```

`INSTANCE_CONFIGURATION_LOADED` additionally includes `configVars` (current config var values).

ULC events additionally include: `userConfigId`, `userEmail`, `userId`, `userLevelConfigVariables`, `userName`.

### Font Configuration

```typescript
interface FontConfiguration {
  google: { families: string[] }; // Google Fonts family names
}
```

### Translation

```typescript
interface Translation {
  debugMode?: boolean; // show phrase keys in the UI for identifying translation keys
  phrases?: {
    [phraseKey: string]: string | { _: string }; // { _: "..." } for complex phrases with variables
    dynamicPhrase?: Record<string, string>; // translate org-specific content
  };
}
```

## Utility Functions

```typescript
// Get the iframe element that sent a postMessage event
import { getMessageIframe } from "@prismatic-io/embedded";
const iframe = getMessageIframe(messageEvent);

// Programmatically close a popover
import { closePopover } from "@prismatic-io/embedded";
closePopover();
```
