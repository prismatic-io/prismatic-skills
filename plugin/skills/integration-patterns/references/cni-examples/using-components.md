# Example: Using Component Manifests in CNI

## Overview

This example demonstrates how to use **Prismatic component manifests** in your Code Native Integration (CNI). Manifests provide type-safe access to pre-built components for services like Slack, Salesforce, AWS, etc.

**Key Concepts:**

- Installing component manifests with `prismatic-tools install-manifest`
- Registering components in `componentRegistry.ts`
- Using connection helpers from manifests
- Using data source helpers from manifests
- Accessing component actions via manifest imports and `.perform()`

---

## When to Use Component Manifests

**Use component manifests when:**

- Integrating with popular SaaS platforms (Slack, Salesforce, HubSpot, etc.)
- You need OAuth or API key authentication
- You want dynamic dropdowns (channel selectors, folder pickers, etc.)
- A Prismatic component exists for the service

**Build custom when:**

- No component exists for the service
- Simple HTTP calls with minimal authentication
- Highly specialized API patterns

---

## Complete Working Example

### Project Structure

```
slack-salesforce-sync/
├── src/
│   ├── index.ts                # Integration definition
│   ├── componentRegistry.ts    # Manifest registration
│   ├── configPages.ts          # OAuth & dropdowns
│   ├── flows.ts                # Integration logic
│   ├── documentation.md        # User docs
│   └── manifests/
│       ├── slack/              # Slack manifest
│       └── salesforce/         # Salesforce manifest
├── test-data/
│   └── trigger-config.json
└── package.json
```

---

## Step 1: Scaffold Project with Manifests

```bash
# Scaffold and install both manifests
scripts/integrations/scaffold-project.ts slack-salesforce-sync --components slack,salesforce
```

This creates the project structure and installs manifests at `src/manifests/`.

---

## Step 2: Register Components

### `src/componentRegistry.ts`

```typescript
import { componentManifests } from "@prismatic-io/spectral";
import slack from "./manifests/slack";
import salesforce from "./manifests/salesforce";

export const componentRegistry = componentManifests({
  slack,
  salesforce,
});
```

**Key Points:**

- Import each manifest from `./manifests/<component>`
- Pass all components to `componentManifests()`
- Export as `componentRegistry`

---

## Step 3: Configure Connections and Dropdowns

### `src/configPages.ts`

```typescript
import { configPage, configVar } from "@prismatic-io/spectral";
import { slackOauth2 } from "./manifests/slack/connections/oauth2";
import { slackSelectChannels } from "./manifests/slack/dataSources/selectChannels";
import { salesforceOauth2 } from "./manifests/salesforce/connections/oauth2";

export const configPages = {
  // Salesforce OAuth connection
  "Salesforce Connection": configPage({
    tagline: "Connect to Salesforce",
    elements: {
      "Salesforce Connection": salesforceOauth2("salesforce-connection", {
        clientId: {
          value: process.env.SALESFORCE_CLIENT_ID || "",
          permissionAndVisibilityType: "organization",
          visibleToOrgDeployer: false,
        },
        clientSecret: {
          value: process.env.SALESFORCE_CLIENT_SECRET || "",
          permissionAndVisibilityType: "organization",
          visibleToOrgDeployer: false,
        },
      }),
    },
  }),

  // Slack OAuth connection
  "Slack Connection": configPage({
    tagline: "Connect to Slack",
    elements: {
      "Slack Connection": slackOauth2("slack-connection", {
        clientId: {
          value: process.env.SLACK_CLIENT_ID || "",
          permissionAndVisibilityType: "organization",
          visibleToOrgDeployer: false,
        },
        clientSecret: {
          value: process.env.SLACK_CLIENT_SECRET || "",
          permissionAndVisibilityType: "organization",
          visibleToOrgDeployer: false,
        },
        scopes: {
          value: "chat:write chat:write.public channels:read",
          permissionAndVisibilityType: "organization",
          visibleToOrgDeployer: false,
        },
      }),
    },
  }),

  // Slack channel dropdown (uses data source helper)
  "Slack Settings": configPage({
    tagline: "Select Slack channel for notifications",
    elements: {
      "Slack Channel": slackSelectChannels("slack-channel", {
        connection: { configVar: "Slack Connection" },
        includePublicChannels: { value: true },
        includePrivateChannels: { value: false },
      }),
    },
  }),

  // Custom configuration
  "Sync Settings": configPage({
    tagline: "Configure sync behavior",
    elements: {
      "Salesforce Query": configVar({
        stableKey: "salesforce-query",
        dataType: "string",
        description: "SOQL query to fetch records",
        defaultValue: "SELECT Id, Name, Email FROM Contact LIMIT 100",
      }),
    },
  }),
};
```

### Key Patterns

**Connection helpers from manifests:**

```typescript
import { slackOauth2 } from "./manifests/slack/connections/oauth2";

"Slack Connection": slackOauth2("stable-key", {
  clientId: { value: "..." },
  clientSecret: { value: "..." },
  scopes: { value: "chat:write channels:read" },
})
```

**Data source helpers from manifests:**

```typescript
import { slackSelectChannels } from "./manifests/slack/dataSources/selectChannels";

"Slack Channel": slackSelectChannels("stable-key", {
  connection: { configVar: "Slack Connection" },  // Reference connection
  includePublicChannels: { value: true },
})
```

---

## Step 4: Implement Flow Logic

### `src/flows.ts`

```typescript
import { flow, util } from "@prismatic-io/spectral";
import salesforceActions from "../manifests/salesforce/actions";
import slackActions from "../manifests/slack/actions";

// Define types for API responses
interface SalesforceRecord {
  Id: string;
  Name: string;
  Email?: string;
}

interface SalesforceQueryResult {
  totalSize: number;
  done: boolean;
  records: SalesforceRecord[];
}

interface SlackPostResult {
  ok: boolean;
  ts: string;
  channel: string;
}

export const syncContactsFlow = flow({
  name: "Sync Contacts to Slack",
  stableKey: "sync-contacts",
  description: "Fetch Salesforce contacts and post summary to Slack",

  onExecution: async (context, params) => {
    const { configVars, logger } = context;

    // Get config values
    const query = util.types.toString(configVars["Salesforce Query"]);
    const channel = util.types.toString(configVars["Slack Channel"]);

    logger.info(`Executing SOQL query: ${query}`);

    // Call Salesforce component action
    const sfResult = await salesforceActions.soqlQuery.perform({
      connection: configVars["Salesforce Connection"],
      query,
    }) as SalesforceQueryResult;

    logger.info(`Found ${sfResult.totalSize} contacts`);

    // Format message
    const contactList = sfResult.records
      .slice(0, 10)
      .map((c) => `• ${c.Name}${c.Email ? ` (${c.Email})` : ""}`)
      .join("\n");

    const message = `*Salesforce Sync Complete*\n\nFound ${sfResult.totalSize} contacts:\n${contactList}`;

    // Call Slack component action
    const slackResult = await slackActions.postMessage.perform({
      connection: configVars["Slack Connection"],
      channelName: channel,
      message,
    }) as SlackPostResult;

    logger.info(`Posted to Slack channel ${slackResult.channel}`);

    return {
      data: {
        contactsFound: sfResult.totalSize,
        slackMessageTs: slackResult.ts,
      },
    };
  },
});

export default [syncContactsFlow];
```

### Key Patterns

**Accessing component actions via manifest imports:**

```typescript
// Import actions from the manifest, then call <actions>.<actionKey>.perform({params})
import salesforceActions from "../manifests/salesforce/actions";

const result = await salesforceActions.soqlQuery.perform({
  connection: configVars["Salesforce Connection"],
  query: "SELECT Id FROM Account",
});
```

**Type casting results:**

Component actions return `unknown`. Cast to appropriate types:

```typescript
import salesforceActions from "../manifests/salesforce/actions";

interface SalesforceQueryResult {
  totalSize: number;
  records: any[];
}

const result = await salesforceActions.soqlQuery.perform({...}) as SalesforceQueryResult;
```

**Passing connections:**

```typescript
// Connection from configVar
connection: configVars["Salesforce Connection"]
```

---

## Step 5: Integration Definition

### `src/index.ts`

```typescript
import { integration } from "@prismatic-io/spectral";
import { componentRegistry } from "./componentRegistry";
import { configPages } from "./configPages";
import flows from "./flows";
import documentation from "./documentation.md";

export default integration({
  name: "Salesforce Slack Sync",
  description: "Sync Salesforce contacts to Slack channels",
  iconPath: "icon.png",
  version: "1.0.0",
  flows,
  configPages,
  componentRegistry, // Required when using manifests
  documentation,
});
```

**Important:** Include `componentRegistry` in the integration definition.

---

## Common Patterns

### Multiple Component Actions

```typescript
import hubspotActions from "../manifests/hubspot/actions";
import salesforceActions from "../manifests/salesforce/actions";
import slackActions from "../manifests/slack/actions";

onExecution: async (context, params) => {
  // Fetch from HubSpot
  const deals = await hubspotActions.getDeals.perform({
    connection: context.configVars["HubSpot Connection"],
  });

  // Create in Salesforce
  for (const deal of deals.data) {
    await salesforceActions.createRecord.perform({
      connection: context.configVars["Salesforce Connection"],
      objectType: "Opportunity",
      record: {
        Name: deal.dealname,
        Amount: deal.amount,
      },
    });
  }

  // Notify via Slack
  await slackActions.postMessage.perform({
    connection: context.configVars["Slack Connection"],
    channelName: "sales",
    message: `Synced ${deals.data.length} deals from HubSpot`,
  });

  return { data: { synced: deals.data.length } };
};
```

### Error Handling

```typescript
import slackActions from "../manifests/slack/actions";

try {
  await slackActions.postMessage.perform({
    connection: context.configVars["Slack Connection"],
    channelName: "general",
    message: "Hello!",
  });
} catch (error) {
  context.logger.error(`Slack error: ${error.message}`);
  throw new Error(`Failed to post to Slack: ${error.message}`);
}
```

### Conditional Component Usage

```typescript
import slackActions from "../manifests/slack/actions";
import sendgridActions from "../manifests/sendgrid/actions";

const notificationType = util.types.toString(context.configVars["Notification Type"]);

if (notificationType === "slack") {
  await slackActions.postMessage.perform({
    connection: context.configVars["Slack Connection"],
    channelName: context.configVars["Slack Channel"],
    message: "Notification!",
  });
} else if (notificationType === "email") {
  await sendgridActions.sendEmail.perform({
    connection: context.configVars["SendGrid Connection"],
    to: context.configVars["Email Address"],
    subject: "Notification",
    body: "Notification!",
  });
}
```

---

## Finding Available Components

Search for components before scaffolding:

```bash
prismatic-tools find-components salesforce
prismatic-tools find-components slack
prismatic-tools find-components hubspot
```

This returns component keys (with connection details) to use with `--components` flag.

---

## Summary

### Required Steps

1. Scaffold with manifests: `scaffold-project.ts <name> --components <comp1,comp2>`
2. Register in `componentRegistry.ts`
3. Use connection helpers in `configPages.ts`
4. Use data source helpers for dropdowns
5. Import manifest actions and call `<component>Actions.<action>.perform()`
6. Include `componentRegistry` in `index.ts`

### Key Benefits

- Type-safe access to component actions
- Pre-built OAuth flows
- Dynamic dropdowns from APIs
- No manual API client creation
- Automatic token refresh

---

## Related Documentation

- [Manifest Pattern Guide](../manifest-pattern.md) - Complete manifest reference
- [OAuth Connection](oauth-connection.md) - OAuth configuration details
- [Data Sources](data-sources.md) - Dynamic dropdown patterns
- [Config Patterns](config-patterns-correct-vs-incorrect.md) - Configuration best practices
