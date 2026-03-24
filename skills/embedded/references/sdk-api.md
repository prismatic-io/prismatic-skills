# Embedded SDK API Reference

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
