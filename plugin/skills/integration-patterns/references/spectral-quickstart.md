# Spectral SDK Quick Reference

The Spectral SDK is Prismatic's TypeScript library for building Code Native Integrations (CNIs).

## Core Concepts

### Integration

The top-level structure containing metadata, flows, and configuration pages.

```typescript
import { integration } from "@prismatic-io/spectral";

export default integration({
  name: "My Integration",
  description: "Does something useful",
  flows: [myFlow],
  configPages: myConfigPages,
});
```

### Flow

A flow defines executable logic - the "what happens" part of your integration.

```typescript
import { flow } from "@prismatic-io/spectral";

export const myFlow = flow({
  name: "My Flow",
  stableKey: "my-flow", // Never change this!
  description: "Processes data",
  onExecution: async (context, params) => {
    // Your logic here
    return { data: result };
  },
});
```

### Configuration Pages

UI for end users to configure your integration.

```typescript
import { configPage, configVar } from "@prismatic-io/spectral";

export const configPages = {
  "Connection Setup": configPage({
    elements: {
      "API Key": configVar({
        stableKey: "api-key",
        dataType: "string",
        description: "Your API key",
      }),
    },
  }),
};
```

---

## Context Object

Available in `onExecution` and other flow hooks:

```typescript
onExecution: async (context, params) => {
  // Access user configuration
  const apiKey = context.configVars["API Key"];

  // Logging
  context.logger.info("Processing...");
  context.logger.warn("Warning message");
  context.logger.error("Error occurred");

  // Execution metadata
  const executionId = context.executionId;
  const instanceId = context.instanceId;

  return { data: result };
};
```

---

## Common Patterns

### 1. OAuth Connection Pattern

Define an OAuth connection for third-party APIs:

```typescript
import { connectionConfigVar } from "@prismatic-io/spectral";

export const configPages = {
  "Salesforce Connection": configPage({
    elements: {
      "Salesforce OAuth": connectionConfigVar({
        stableKey: "salesforce-connection",
        dataType: "connection",
        connection: {
          component: "salesforce",
          key: "oauth2",
          values: {
            clientId: "YOUR_CLIENT_ID",
            clientSecret: "YOUR_CLIENT_SECRET",
            scopes: "api refresh_token offline_access",
          },
        },
      }),
    },
  }),
};

// Access in flow
onExecution: async (context) => {
  const connection = context.configVars["Salesforce OAuth"];
  const accessToken = connection.token.access_token;

  // Use token in API calls
  const response = await fetch("https://api.salesforce.com/...", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
};
```

**Note:** Prismatic handles token refresh automatically.

### 2. Data Source Config Pattern

Create dynamic dropdowns that fetch options from APIs:

```typescript
import { dataSourceConfigVar } from "@prismatic-io/spectral";

export const configPages = {
  "Select Channel": configPage({
    elements: {
      "Slack Channel": dataSourceConfigVar({
        stableKey: "slack-channel",
        dataType: "picklist",
        dataSource: async (context) => {
          const connection = context.configVars["Slack OAuth"];

          // Fetch channels from Slack API
          const response = await fetch(
            "https://slack.com/api/conversations.list",
            {
              headers: {
                Authorization: `Bearer ${connection.token.access_token}`,
              },
            },
          );

          const data = await response.json();

          // Return array of { label, value } objects
          return data.channels.map((channel) => ({
            label: channel.name,
            value: channel.id,
          }));
        },
      }),
    },
  }),
};
```

### 3. Webhook Flow Pattern

Handle incoming webhook requests:

```typescript
import { flow } from "@prismatic-io/spectral";

export const webhookFlow = flow({
  name: "Process Webhook",
  stableKey: "webhook-flow",
  onTrigger: async (context, payload) => {
    // payload contains the incoming HTTP request
    const body = payload.body.data;
    const headers = payload.headers;

    context.logger.info("Received webhook", { body });

    // Process the data
    const result = await processWebhookData(body);

    // Return HTTP response to caller
    return {
      statusCode: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, result }),
    };
  },
});
```

### 4. Error Handling Pattern

Properly handle errors in flows:

```typescript
onExecution: async (context) => {
  try {
    const result = await callExternalAPI();

    if (!result.success) {
      // Non-fatal error - log and continue
      context.logger.warn("API returned error", { error: result.error });
      return { data: null, error: result.error };
    }

    return { data: result };
  } catch (error) {
    // Fatal error - log details
    context.logger.error("API call failed", {
      error: error.message,
      stack: error.stack,
    });

    // Throw to mark execution as failed
    throw new Error(`Failed to call API: ${error.message}`);
  }
};
```

### 5. Calling Component Actions

Use Prismatic component manifests to access pre-built actions:

```typescript
// 1. Install manifest during scaffolding or manually
// Run: npx tsx scripts/integrations/scaffold-project.ts <name> --components slack
// Or: prismatic-tools install-manifest slack

// 2. Register manifest in src/componentRegistry.ts:
import { componentManifests } from "@prismatic-io/spectral";
import slack from "./manifests/slack";

export const componentRegistry = componentManifests({ slack });

// 3. Configure connection in src/configPages.ts:
import { slackOauth2 } from "./manifests/slack/connections/oauth2";

"Slack Connection": slackOauth2("slack-connection", {
  clientId: { value: process.env.SLACK_CLIENT_ID || "" },
  clientSecret: { value: process.env.SLACK_CLIENT_SECRET || "" },
  scopes: { value: "chat:write channels:read" },
})

// 4. Import manifest actions and call .perform() in flow:
import slackActions from "../manifests/slack/actions";

onExecution: async (context) => {
  const { configVars, logger } = context;

  // Call component action via manifest import + .perform() - returns unknown, cast to expected type
  const result = await slackActions.postMessage.perform({
    connection: configVars["Slack Connection"],
    channelName: configVars["Slack Channel"],
    message: "Hello from CNI!",
  }) as { ok: boolean; ts: string };

  logger.info("Message posted", { result });
  return { data: result };
};
```

**See:** [manifest-pattern.md](manifest-pattern.md) for complete guide

---

## Type Safety

Spectral provides TypeScript types for everything:

```typescript
import {
  integration,
  flow,
  configPage,
  configVar,
  connectionConfigVar,
  dataSourceConfigVar,
  Connection,
  Element,
} from "@prismatic-io/spectral";
// Note: Do NOT import FlowContext — it is not a public export.
// The flow() function infers context types automatically.
```

For the full TypeScript API reference, see the official documentation.

---

## Official Documentation

- **Spectral SDK Overview**: <https://prismatic.io/docs/custom-connectors/>
- **GitHub Repository**: <https://github.com/prismatic-io/spectral>
- **NPM Package**: <https://www.npmjs.com/package/@prismatic-io/spectral>
- **Official Examples**: <https://github.com/prismatic-io/examples/tree/main/integrations/code-native-integrations>

---

## Installation

Spectral is automatically included when you initialize a CNI project:

```bash
prism integrations:init my-integration
cd my-integration
npm install
```

Manual installation (if needed):

```bash
npm install @prismatic-io/spectral
```

Current stable version: 10.8.0
