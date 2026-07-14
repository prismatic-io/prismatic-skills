# Component Manifest Pattern

Complete guide for using Prismatic component manifests in Code Native Integrations.

---

## Overview

**Component manifests** provide type-safe access to Prismatic's pre-built components (Slack, Salesforce, AWS, etc.) in your CNI code. Instead of downloading and copying component source code, manifests generate TypeScript wrappers that let you:

- Call component actions via manifest import + `.perform()`: `slackActions.postMessage.perform({...})`
- Use connection helpers for OAuth and API key authentication
- Use data source helpers for dynamic dropdowns
- Get TypeScript type hints for parameters

**Key benefits:**

- **Type safety** - IDE autocomplete and compile-time checks
- **Simpler code** - No manual client creation or API wrappers
- **Maintained** - Manifests stay in sync with component updates
- **Cleaner projects** - No copied source code to maintain

---

## Installing Manifests

### During Project Scaffolding (Recommended)

Pass components to the scaffold script:

```bash
scripts/integrations/scaffold-project.ts my-integration --components slack,salesforce
```

This creates:
- `src/manifests/slack/` - Slack component manifest
- `src/manifests/salesforce/` - Salesforce component manifest

### Manual Installation

After scaffolding, install additional manifests:

```bash
prismatic-tools install-manifest <component-key> --project-dir <project-dir>
```

**Example:**

```bash
prismatic-tools install-manifest hubspot
# Creates: src/manifests/hubspot/
```

### Finding Component Keys

Use `prismatic-tools find-components` with a keyword to find available components (e.g., "salesforce").

---

## Manifest Directory Structure

After installation, each manifest creates this structure:

```
src/manifests/<component>/
├── index.ts                    # Main manifest export
├── actions/                    # Action wrappers
│   ├── index.ts
│   ├── postMessage.ts         # Individual action
│   └── ...
├── connections/               # Connection type helpers
│   ├── index.ts
│   ├── oauth2.ts             # OAuth connection helper
│   └── ...
└── dataSources/              # Data source helpers
    ├── index.ts
    ├── selectChannels.ts     # Dropdown data source
    └── ...
```

---

## Core Pattern: componentRegistry

**Every CNI using 3rd party components needs a componentRegistry.ts file.**

### Basic Registration

```typescript
// src/componentRegistry.ts
import { componentManifests } from "@prismatic-io/spectral";
import slack from "./manifests/slack";

export const componentRegistry = componentManifests({ slack });
```

### Multiple Components

```typescript
// src/componentRegistry.ts
import { componentManifests } from "@prismatic-io/spectral";
import slack from "./manifests/slack";
import salesforce from "./manifests/salesforce";
import hubspot from "./manifests/hubspot";

export const componentRegistry = componentManifests({
  slack,
  salesforce,
  hubspot,
});
```

### Registering in index.ts

```typescript
// src/index.ts
import { integration } from "@prismatic-io/spectral";
import { componentRegistry } from "./componentRegistry";
import { configPages } from "./configPages";
import flows from "./flows";
import documentation from "./documentation.md";

export default integration({
  name: "My Integration",
  description: "Integration description",
  flows,
  configPages,
  componentRegistry,  // Required when using component manifests
  documentation,
});
```

---

## Using Connection Helpers

Manifests provide connection helper functions for OAuth and API key connections.

### OAuth Connection

```typescript
// src/configPages.ts
import { configPage } from "@prismatic-io/spectral";
import { slackOauth2 } from "./manifests/slack/connections/oauth2";

export const configPages = {
  Connections: configPage({
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
          value: "chat:write channels:read",
          permissionAndVisibilityType: "organization",
          visibleToOrgDeployer: false,
        },
      }),
    },
  }),
};
```

### API Key Connection

```typescript
import { hubspotApiKey } from "./manifests/hubspot/connections/apiKey";

"HubSpot Connection": hubspotApiKey("hubspot-connection", {
  apiKey: {
    permissionAndVisibilityType: "customer",
  },
}),
```

---

## Using Data Source Helpers

Data source helpers create dynamic dropdowns populated from the connected service.

### Basic Data Source

```typescript
// src/configPages.ts
import { configPage } from "@prismatic-io/spectral";
import { slackSelectChannels } from "./manifests/slack/dataSources/selectChannels";

export const configPages = {
  "Slack Configuration": configPage({
    tagline: "Configure Slack settings",
    elements: {
      "Slack Channel": slackSelectChannels("slack-channel", {
        connection: { configVar: "Slack Connection" },
        includePublicChannels: { value: true },
        includePrivateChannels: { value: false },
      }),
    },
  }),
};
```

### Data Source with Dependencies

Data sources can reference other config vars:

```typescript
"Select Folder": googleDriveSelectFolders("select-folder", {
  connection: { configVar: "Google Drive Connection" },
  parentFolderId: { configVar: "Parent Folder" },  // Depends on another config var
}),
```

---

## Accessing Components in Flows

Once registered, access component actions via manifest imports and the `.perform()` method.

### Basic Action Call

```typescript
// src/flows.ts
import { flow } from "@prismatic-io/spectral";
import slackActions from "../manifests/slack/actions";

export const sendMessageFlow = flow({
  name: "Send Slack Message",
  stableKey: "send-message",

  onExecution: async (context, params) => {
    const { configVars } = context;

    // Call component action
    await slackActions.postMessage.perform({
      connection: configVars["Slack Connection"],
      channelName: configVars["Slack Channel"],
      message: "Hello from integration!",
    });

    return { data: { success: true } };
  },
});
```

### Multiple Component Actions

```typescript
import salesforceActions from "../manifests/salesforce/actions";
import slackActions from "../manifests/slack/actions";

onExecution: async (context, params) => {
  const { configVars, logger } = context;

  // Fetch from Salesforce
  const contacts = await salesforceActions.queryRecords.perform({
    connection: configVars["Salesforce Connection"],
    query: "SELECT Id, Name, Email FROM Contact LIMIT 10",
  }) as Record<string, unknown>;

  // Send to Slack
  for (const contact of (contacts as any).data.records) {
    await slackActions.postMessage.perform({
      connection: configVars["Slack Connection"],
      channelName: configVars["Slack Channel"],
      message: `Contact: ${contact.Name} (${contact.Email})`,
    });
  }

  return { data: { processed: (contacts as any).data.records.length } };
};
```

---

## Type Handling

**Important:** Component action calls return `unknown`. You must cast results to appropriate types.

### Defining Response Types

Look at the manifest action files (`src/manifests/<component>/actions/<action>.ts`) for type hints about return values.

```typescript
// Define types based on expected response structure
interface SlackPostMessageResponse {
  ok: boolean;
  ts: string;
  channel: string;
  message: {
    text: string;
    user: string;
    ts: string;
  };
}

interface SalesforceQueryResponse {
  totalSize: number;
  done: boolean;
  records: Array<{
    Id: string;
    Name: string;
    Email?: string;
  }>;
}
```

### Response Wrapper: `{ data: ... }`

**Critical:** Component action results are wrapped in a `{ data: ... }` object. The actual API response is inside `result.data`, not on `result` itself.

Each manifest action file includes an `examplePayload` that shows this structure:

```typescript
// From src/manifests/slack/actions/postBlockMessage.ts
examplePayload: {
  data: {           // <-- results are always nested under .data
    ok: true,
    ts: "1646951430.367539",
    channel: "C011B7U3R9U",
    message: { ... },
  },
},
```

### Casting Results

Always cast to `Record<string, unknown>` and then extract the typed `.data` property:

```typescript
import slackActions from "../manifests/slack/actions";

onExecution: async (context, params) => {
  // Cast the result, accounting for the { data } wrapper
  const result = (await slackActions.postMessage.perform({
    connection: context.configVars["Slack Connection"],
    channelName: "general",
    message: "Hello!",
  })) as Record<string, unknown>;

  // Access the actual response via .data
  const data = result.data as SlackPostMessageResponse;
  context.logger.info(`Message sent with timestamp: ${data.ts}`);

  return { data };
};
```

**Common mistake** - casting directly without the wrapper:

```typescript
// WRONG - result.ts will be undefined
const result = (await slackActions.postMessage.perform({
  ...params,
})) as SlackPostMessageResponse;
console.log(result.ts); // undefined!

// CORRECT - cast to Record<string, unknown> and access via .data
const result = (await slackActions.postMessage.perform({
  ...params,
})) as Record<string, unknown>;
const data = result.data as SlackPostMessageResponse;
console.log(data.ts); // "1646951430.367539"
```

### Reading Manifest Types

The manifest action files in `src/manifests/<component>/actions/` contain:

1. **Input parameter types** - What the action expects
2. **`examplePayload`** - Shows the exact `{ data: ... }` response shape
3. **Type exports** - Some manifests export input/output types

**Always check `examplePayload`** in the manifest action file to understand the response structure:

```typescript
// Check src/manifests/slack/actions/postMessage.ts for:
// - Required parameters (connection, channelName, message)
// - Optional parameters (username, iconUrl, threadTs)
// - examplePayload.data for the response shape
```

---

## Complete Example

### Project Structure

```
my-integration/
├── src/
│   ├── componentRegistry.ts    # Register manifests
│   ├── configPages.ts          # Use connection/datasource helpers
│   ├── flows.ts                # Access via manifest imports + .perform()
│   ├── index.ts                # Include componentRegistry
│   ├── documentation.md
│   └── manifests/
│       ├── slack/              # Installed manifest
│       └── salesforce/         # Installed manifest
├── test-data/
│   └── trigger-config.json
└── package.json
```

### componentRegistry.ts

```typescript
import { componentManifests } from "@prismatic-io/spectral";
import slack from "./manifests/slack";
import salesforce from "./manifests/salesforce";

export const componentRegistry = componentManifests({ slack, salesforce });
```

### configPages.ts

```typescript
import { configPage, configVar } from "@prismatic-io/spectral";
import { slackOauth2 } from "./manifests/slack/connections/oauth2";
import { slackSelectChannels } from "./manifests/slack/dataSources/selectChannels";
import { salesforceOauth2 } from "./manifests/salesforce/connections/oauth2";

export const configPages = {
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
          value: "chat:write channels:read",
        },
      }),
    },
  }),

  "Slack Settings": configPage({
    tagline: "Configure Slack channel",
    elements: {
      "Slack Channel": slackSelectChannels("slack-channel", {
        connection: { configVar: "Slack Connection" },
        includePublicChannels: { value: true },
      }),
    },
  }),

  "Sync Settings": configPage({
    tagline: "Configure sync behavior",
    elements: {
      "Salesforce Query": configVar({
        stableKey: "salesforce-query",
        dataType: "string",
        description: "SOQL query to fetch records",
        defaultValue: "SELECT Id, Name FROM Contact LIMIT 100",
      }),
    },
  }),
};
```

### flows.ts

```typescript
import { flow, util } from "@prismatic-io/spectral";
import salesforceActions from "../manifests/salesforce/actions";
import slackActions from "../manifests/slack/actions";

interface SalesforceRecord {
  Id: string;
  Name: string;
}

interface SalesforceQueryResult {
  totalSize: number;
  done: boolean;
  records: SalesforceRecord[];
}

export const syncFlow = flow({
  name: "Sync Salesforce to Slack",
  stableKey: "sync-salesforce-slack",
  description: "Sync Salesforce records to Slack channel",

  onExecution: async (context, params) => {
    const { configVars, logger } = context;

    // Get Salesforce records - cast result to expected type
    const query = util.types.toString(configVars["Salesforce Query"]);
    const queryResult = await salesforceActions.soqlQuery.perform({
      connection: configVars["Salesforce Connection"],
      query,
    }) as Record<string, unknown>;

    const result = queryResult.data as SalesforceQueryResult;
    logger.info(`Found ${result.totalSize} records`);

    // Post summary to Slack
    const summary = result.records.slice(0, 10)
      .map(r => `- ${r.Name}`)
      .join("\n");

    await slackActions.postMessage.perform({
      connection: configVars["Slack Connection"],
      channelName: configVars["Slack Channel"],
      message: `Salesforce Sync Complete:\n${summary}`,
    });

    return {
      data: {
        synced: result.totalSize,
        records: result.records,
      },
    };
  },
});

export default [syncFlow];
```

### index.ts

```typescript
import { integration } from "@prismatic-io/spectral";
import { componentRegistry } from "./componentRegistry";
import { configPages } from "./configPages";
import flows from "./flows";
import documentation from "./documentation.md";

export default integration({
  name: "Salesforce Slack Sync",
  description: "Sync Salesforce records to Slack channels",
  flows,
  configPages,
  componentRegistry,
  documentation,
});
```

---

## Best Practices

### 1. Always Define Types for Results

```typescript
import apiActions from "../manifests/api/actions";

// Define interfaces for expected response structures
interface ApiResponse {
  success: boolean;
  data: SomeData[];
}

// Cast results to Record<string, unknown> and then extract typed data
const result = await apiActions.getData.perform({...}) as Record<string, unknown>;
const data = result.data as ApiResponse;
```

### 2. Use Meaningful Variable Names

```typescript
// Good - clear what the config var contains
const slackConnection = configVars["Slack Connection"];
const targetChannel = configVars["Slack Channel"];

// Less clear
const conn = configVars["conn"];
```

### 3. Handle Errors

```typescript
import slackActions from "../manifests/slack/actions";

try {
  await slackActions.postMessage.perform({
    connection: configVars["Slack Connection"],
    channelName: configVars["Slack Channel"],
    message: "Hello!",
  });
} catch (error) {
  logger.error(`Failed to post to Slack: ${error.message}`);
  throw new Error(`Slack operation failed: ${error.message}`);
}
```

### 4. Log Component Operations

```typescript
logger.info("Posting message to Slack");
await slackActions.postMessage.perform({...});
logger.info("Message posted successfully");
```

---

## Troubleshooting

### Manifest Not Found

**Error:** `Cannot find module './manifests/slack'`

**Fix:** Install the manifest:
```bash
prismatic-tools install-manifest slack
```

### Component Not Registered

**Error:** `Property 'slack' does not exist on type...`

**Fix:** Register the component in componentRegistry.ts:
```typescript
import { componentManifests } from "@prismatic-io/spectral";
import slack from "./manifests/slack";

export const componentRegistry = componentManifests({ slack });
```

And include it in index.ts:
```typescript
export default integration({
  ...
  componentRegistry,
});
```

### Unknown Type Results

**Issue:** TypeScript complains about `unknown` type

**Fix:** Cast to `Record<string, unknown>` and then extract typed data:
```typescript
import apiActions from "../manifests/api/actions";

interface ExpectedResponse {
  data: any[];
}

const result = await apiActions.action.perform({...}) as Record<string, unknown>;
const data = result.data as ExpectedResponse;
```

### Connection Helpers Not Found

**Error:** `Cannot find module './manifests/slack/connections/oauth2'`

**Fix:** Check the manifest structure - connection names vary by component. Look at:
```
src/manifests/<component>/connections/index.ts
```

---

## Related Documentation

- [Code Generation Guide](code-generation-guide.md) - Complete code generation patterns
- [Config Patterns](cni-examples/config-patterns-correct-vs-incorrect.md) - Config wrapper functions
- [OAuth Connection](cni-examples/oauth-connection.md) - OAuth setup details
- [Data Sources](cni-examples/data-sources.md) - Dynamic dropdown patterns
