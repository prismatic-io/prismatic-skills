# Embedding the Marketplace

## Basic Setup

After initializing and authenticating, show the marketplace:

```typescript
import prismatic from "@prismatic-io/embedded";

// Inline iframe (embedded inside a div)
prismatic.showMarketplace({
  selector: "#integrations-marketplace",
  usePopover: false,
});

// Popover/modal
prismatic.showMarketplace({ usePopover: true });
```

The container element should have an explicit height (e.g., `height: 80vh`) — the iframe fills its container.

## Filtering Integrations

### Simple filters

Filter by category and/or label:

```typescript
prismatic.showMarketplace({
  selector: "#marketplace-div",
  filters: {
    marketplace: {
      category: "ERP",
      label: "enterprise",
    },
  },
});
```

### Advanced filters

Use `filterQuery` with `BooleanOperator` and `TermOperator` for complex logic:

```typescript
import prismatic, { BooleanOperator, TermOperator } from "@prismatic-io/embedded";

prismatic.showMarketplace({
  filters: {
    marketplace: {
      filterQuery: [
        BooleanOperator.or,
        [
          BooleanOperator.and,
          [TermOperator.equal, "category", "ERP"],
          [TermOperator.in, "labels", "enterprise"],
        ],
        [TermOperator.equal, "name", "Dropbox"],
        [TermOperator.equal, "name", "Slack"],
      ],
    },
  },
});
```

Available `TermOperator` values: `equal`, `notEqual`, `in`, `notIn`, `startsWith`, `doesNotStartWith`, `endsWith`, `doesNotEndWith`

`in` / `notIn` are for `labels` (array field). All others work on `name` and `category` (string fields).

### Include active (non-marketplace) integrations

```typescript
prismatic.showMarketplace({
  filters: {
    marketplace: {
      includeActiveIntegrations: true,
    },
  },
});
```

## Opening a Specific Integration

```typescript
prismatic.configureInstance({
  integrationName: "Salesforce",
  usePopover: true,
  skipRedirectOnRemove: false, // default: false — redirects to marketplace after removal
});
```

If the customer already has an instance, this opens the existing config. If not, it starts the config wizard.

## Reconfiguring an Existing Instance Inline

To reconfigure a deployed instance inside your own dialog or drawer — dropping the customer straight into the config wizard without the intermediate instance screen and its "Reconfigure" button — call `prismatic.editInstanceConfiguration` with the instance ID and a container `selector`. It renders inline (no popover), fires `onSuccess` / `onCancel` / `onDelete` callbacks, and returns a cleanup function that detaches its listeners.

```typescript
const cleanup = prismatic.editInstanceConfiguration({
  instanceId: "SW5zdGFuY2U6...",
  selector: "#config-panel",
  onSuccess: () => closeDialog(),
});
```

## Marketplace Events

Listen to events from the embedded marketplace:

```typescript
import { PrismaticMessageEvent } from "@prismatic-io/embedded";

window.addEventListener("message", (event) => {
  const { event: eventName, data } = event.data;

  switch (eventName) {
    case PrismaticMessageEvent.INSTANCE_CREATED:
      console.log(`New instance created for ${data.integrationName}`);
      break;

    case PrismaticMessageEvent.INSTANCE_DEPLOYED:
      console.log(`${data.integrationName} is now active`);
      break;

    case PrismaticMessageEvent.INSTANCE_DELETED:
      console.log(`${data.integrationName} was deactivated`);
      break;

    case PrismaticMessageEvent.INSTANCE_CONFIGURATION_OPENED:
      console.log(`${data.customerName} opened config for ${data.integrationName}`);
      break;

    case PrismaticMessageEvent.POPOVER_CLOSED:
      console.log("Marketplace popover was closed");
      break;
  }
});
```

### Event data shape

```typescript
{
  event: string,           // PrismaticMessageEvent value
  data: {
    customerId: string,
    customerName: string,
    instanceId: string,
    instanceName: string,
    integrationName: string,
    integrationVersionNumber: number,
    readOnly: boolean,
  }
}
```

`INSTANCE_CONFIGURATION_LOADED` also includes `configVars` (current config var state) — use this to programmatically pre-fill values.

## Programmatically Setting Config Variables

Pre-fill or auto-fill config wizard values when the config screen opens. Use the `INSTANCE_CONFIGURATION_LOADED` event (not `OPENED`) because the config form is guaranteed to be ready.

```typescript
import prismatic, { getMessageIframe, PrismaticMessageEvent } from "@prismatic-io/embedded";

window.addEventListener("message", (message) => {
  const { event, data } = message.data;

  if (event === PrismaticMessageEvent.INSTANCE_CONFIGURATION_LOADED && !data.readOnly) {
    const iframe = getMessageIframe(message);
    const { integrationName, configVars } = data;

    // Pre-fill for all integrations:
    if (configVars["Acme Connection"]?.inputs.username === "" &&
        configVars["Acme Connection"]?.status === "PENDING") {
      prismatic.setConfigVars({
        iframe,
        configVars: {
          "Acme Connection": {
            inputs: {
              username: { value: currentUser.email },
              password: { value: currentUser.apiKey },
            },
          },
        },
      });
    }

    // Integration-specific pre-fill:
    if (integrationName === "Salesforce") {
      prismatic.setConfigVars({
        iframe,
        configVars: {
          "Salesforce Subdomain": { value: currentUser.salesforceSubdomain },
          "Tag List": { value: ["tag1", "tag2"] },
          "Field Mapping": {
            value: [
              { key: "First Name", value: "firstName" },
              { key: "Last Name",  value: "lastName" },
            ],
          },
        },
      });
    }
  }
});
```

## User-Level Configuration (ULC)

For ULC integrations where each user has their own config (separate from the instance-level config):

```typescript
// ULC JWT claim — set in your backend:
// "role": "admin"  (can deploy ULC instances)
// "role": "user"   (supplies user-level config only)

// ULC events:
window.addEventListener("message", (event) => {
  switch (event.data.event) {
    case PrismaticMessageEvent.USER_CONFIGURATION_LOADED:
      // Pre-fill user-level config vars
      const iframe = getMessageIframe(event);
      prismatic.setConfigVars({
        iframe,
        configVars: { "My User Key": { value: currentUser.personalApiKey } },
      });
      break;

    case PrismaticMessageEvent.USER_CONFIGURATION_DEPLOYED:
      console.log("User config saved");
      break;
  }
});
```

ULC event data includes additional fields: `userConfigId`, `userEmail`, `userId`, `userLevelConfigVariables`, `userName`.

## Screen Configuration Options

```typescript
prismatic.showMarketplace({
  selector: "#marketplace-div",
  screenConfiguration: {
    marketplace: {
      configuration: "allow-details",   // allow-details | always-show-details | disallow-details
      hideSearch: false,
      hideActiveIntegrationsFilter: false,
    },
    instance: {
      hideBackToMarketplace: false,
      hideTabs: ["Test", "Executions"],  // hide tabs on the instance detail page
      hidePauseButton: false,
      hideDeactivation: false,
    },
    configurationWizard: {
      mode: "streamlined",              // streamlined | traditional
      connectionConfiguration: "reusable", // inline | reusable
      hideSidebar: false,
      isInModal: true,                  // set true to make the config wizard fill 100% of available space
      logsDisabled: "never",            // always | never | optional
      stepResultsDisabled: "never",
    },
  },
});
```
