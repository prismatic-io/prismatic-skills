# Example 03: Multi-Flow Integration

## Overview

This example demonstrates how to build a Prismatic CNI integration with **multiple flows**. A single integration can contain many flows, each handling different triggers, schedules, or webhooks. This is the standard pattern for real-world integrations.

**Key Concepts:**

- Defining multiple flows in one integration
- Sharing configuration across flows
- Webhook flow with onTrigger/onExecution split
- Scheduled flow pattern
- Different execution contexts
- Flow-specific logic

---

## What This Integration Does

This Slack integration has **two independent flows**:

1. **TODO Alerts Flow** (Scheduled)
   - Runs on a schedule (e.g., every hour)
   - Fetches TODO items from an API
   - Sends incomplete items to Slack

2. **Account Webhook Flow** (Webhook-triggered)
   - Receives XML webhook when new account is created
   - Parses XML in onTrigger, responds immediately
   - Processes account data in onExecution
   - Sends notification to Slack

**Use Case**: Any integration that needs to handle both periodic syncs AND real-time events.

---

## Complete Multi-Flow Example

### Step 1: Define Multiple Flows

**`src/flows/index.ts`**

```typescript
import sendMessagesFlow from "./sendSlackMessages";
import todoAlertsFlow from "./todoAlerts";

// ⭐ EXPORT FLOWS AS ARRAY ⭐
// Order doesn't matter - each flow is independent
export default [todoAlertsFlow, sendMessagesFlow];
```

**WHY SEPARATE FILES**:

- Easier to maintain as integration grows
- Clear separation of concerns
- Can test flows independently

---

### Flow 1: Scheduled TODO Alerts

**`src/flows/todoAlerts.ts`**

```typescript
import { flow } from "@prismatic-io/spectral";
import axios from "axios";
import { createSlackClient } from "../slackClient";

interface TodoItem {
  id: number;
  completed: boolean;
  task: string;
}

export const todoAlertsFlow = flow({
  name: "Send TODO messages to Slack",
  stableKey: "slack-todo-alerts-flow",
  description: "Fetch TODO items from Acme and send to Slack",

  // ⭐ SCHEDULE - RUNS EVERY HOUR ⭐
  // For scheduled flows, use schedule property instead of onTrigger
  schedule: { value: "0 * * * *" },
  // OR use a config var for user-configurable schedule:
  // schedule: { configVar: "Alert Schedule" },

  // ⭐ MAIN EXECUTION LOGIC ⭐
  onExecution: async (context) => {
    const { logger, configVars } = context;

    // ⭐ ACCESS SHARED CONFIG ⭐
    // These config vars are shared with other flows in this integration
    const apiEndpoint = configVars["Acme API Endpoint"];
    const slackConnection = configVars["Slack OAuth Connection"];
    const slackChannel = configVars["Select Slack Channel"];

    logger.info("Fetching TODO items from Acme API");

    // ⭐ FETCH DATA FROM EXTERNAL API ⭐
    const { data: todoItems } = await axios.get<TodoItem[]>(apiEndpoint);

    logger.info(`Fetched ${todoItems.length} TODO items`);

    // ⭐ CREATE SLACK CLIENT ⭐
    // Helper function abstracts OAuth token handling
    const slackClient = createSlackClient(slackConnection);

    // ⭐ PROCESS EACH ITEM ⭐
    for (const item of todoItems) {
      if (item.completed) {
        // Skip completed items
        logger.info(`Skipping completed item ${item.id}`);
      } else {
        // Send message for incomplete items
        logger.info(`Sending message for item ${item.id}`);
        try {
          await slackClient.post("chat.postMessage", {
            channel: slackChannel,
            text: `Incomplete task: ${item.task}`,
          });
        } catch (e) {
          // ⭐ NON-FATAL ERROR ⭐
          // Log error but continue processing other items
          throw new Error(`Failed to send message for item ${item.id}: ${e}`);
        }
      }
    }

    // ⭐ SCHEDULED FLOWS RETURN NULL ⭐
    // Background/scheduled flows don't need to return data
    return { data: null };
  },
});

export default todoAlertsFlow;
```

> **Note:** The original Prismatic GitHub example uses `onTrigger` which makes it a manual/webhook-invoked flow. For true scheduled execution, use the `schedule` property as shown above.

---

### Flow 2: Webhook with XML Parsing

**`src/flows/sendSlackMessages.ts`**

```typescript
/**
 * This flow receives an XML payload and sends a message to a Slack channel.
 * The trigger parses XML and returns an immediate response.
 * The execution function processes the parsed data.
 *
 * Example XML payload:
 *
 *  <notification>
 *    <type>new_account</type>
 *    <challenge>067DEAB4-B89C-4211-9767-84C96A39CF8C</challenge>
 *    <account>
 *      <first>Nelson</first>
 *      <last>Bighetti</last>
 *      <company>
 *        <name>Hooli</name>
 *        <city>Palo Alto</city>
 *        <state>CA</state>
 *      </company>
 *    </account>
 *  </notification>
 */

import { HttpResponse, flow, util } from "@prismatic-io/spectral";
import { XMLParser } from "fast-xml-parser";
import { createSlackClient } from "../slackClient";
import axios from "axios";

interface AccountNotification {
  notification: {
    type: string;
    challenge: string;
    account: {
      first: string;
      last: string;
      company: {
        name: string;
        city: string;
        state: string;
      };
    };
  };
}

const sendMessagesFlow = flow({
  name: "Send Slack Message on Account Received",
  stableKey: "send-slack-messages",
  description: "Send a message to a Slack channel when an account is received",

  // ⭐ ON TRIGGER - IMMEDIATE RESPONSE ⭐
  // This runs BEFORE onExecution and returns an HTTP response immediately
  onTrigger: async (context, payload) => {
    // ⭐ PARSE XML FROM WEBHOOK ⭐
    const parser = new XMLParser();

    // util.types.toString converts raw bytes to string
    const parsedBody = parser.parse(util.types.toString(payload.rawBody.data));

    // ⭐ BUILD HTTP RESPONSE ⭐
    // This response is sent IMMEDIATELY to the webhook caller
    const response: HttpResponse = {
      statusCode: 200,
      contentType: "text/plain",

      // Echo back the challenge key (common webhook verification pattern)
      body: parsedBody.notification.challenge,
    };

    // ⭐ RETURN BOTH RESPONSE AND MODIFIED PAYLOAD ⭐
    // response: Sent to caller immediately
    // payload: Passed to onExecution for further processing
    return Promise.resolve({
      payload: { ...payload, body: { data: parsedBody } },
      response,
    });
  },

  // ⭐ ON EXECUTION - BACKGROUND PROCESSING ⭐
  // This runs AFTER the HTTP response is sent
  onExecution: async (context, params) => {
    const { configVars, logger } = context;

    // Create Slack client from OAuth connection
    const slackClient = createSlackClient(configVars["Slack OAuth Connection"]);

    // ⭐ ACCESS PARSED PAYLOAD ⭐
    // params.onTrigger.results IS the payload directly
    // Your JSON data is in body.data
    const data = params.onTrigger.results.body.data as AccountNotification;

    logger.info(
      `Processing account: ${data.notification.account.first} ${data.notification.account.last}`,
    );

    // ⭐ CONSTRUCT MESSAGE ⭐
    const message =
      `New account received:\n` +
      `Name: ${data.notification.account.first} ${data.notification.account.last}\n` +
      `Company: ${data.notification.account.company.name}\n` +
      `Location: ${data.notification.account.company.city}, ${data.notification.account.company.state}\n`;

    // ⭐ SEND TO SLACK ⭐
    await slackClient.post("chat.postMessage", {
      channel: configVars["Select Slack Channel"],
      text: message,
    });

    logger.info("Successfully sent Slack notification");

    return { data: null };
  },

  // ⭐ ON INSTANCE DEPLOY ⭐
  // Called when integration instance is deployed (optional lifecycle hook)
  onInstanceDeploy: async (context) => {
    const { configVars, logger } = context;

    logger.info("Instance deployed - registering webhook");

    // ⭐ NOTIFY EXTERNAL SYSTEM OF WEBHOOK URL ⭐
    // Some services need to know where to send webhooks
    await axios.post(configVars["Webhook Config Endpoint"], {
      vars: context.configVars,
      webhooks: context.webhookUrls, // URLs for each flow
      method: "deploy",
    });
  },

  // ⭐ ON INSTANCE DELETE ⭐
  // Called when integration instance is deleted (cleanup)
  onInstanceDelete: async (context) => {
    const { configVars, logger } = context;

    logger.info("Instance deleted - unregistering webhook");

    // ⭐ NOTIFY EXTERNAL SYSTEM TO STOP SENDING WEBHOOKS ⭐
    await axios.post(configVars["Webhook Config Endpoint"], {
      vars: context.configVars,
      webhooks: context.webhookUrls,
      method: "delete",
    });
  },
});

export default sendMessagesFlow;
```

---

### Key Patterns Explained

#### 1. onTrigger vs onExecution

```typescript
// onTrigger runs FIRST
onTrigger: async (context, payload) => {
  // Parse webhook data
  // Validate request
  // Return HTTP response IMMEDIATELY
  return { payload: modifiedPayload, response: httpResponse };
},

// onExecution runs AFTER (in background)
onExecution: async (context, params) => {
  // Process data from params.onTrigger.results
  // Make API calls
  // Update databases
  // No time limit (onTrigger has 30s timeout)
}
```

**WHY SPLIT**:

- **onTrigger**: Fast response to webhook caller (< 30 seconds)
- **onExecution**: Long-running processing (no timeout)

**WHEN TO USE**:

- Use both for webhooks that need immediate ack + processing
- Use `schedule` property + only `onExecution` for scheduled flows (no `onTrigger`)
- Use both for synchronous APIs (isSynchronous: true)

#### 2. Accessing Parsed Payload in onExecution

```typescript
// In onTrigger:
return Promise.resolve({
  payload: { ...payload, body: { data: parsedBody } },
  response,
});

// In onExecution:
// params.onTrigger.results IS the payload directly (no wrapper)
// Your parsed data is in body.data
const data = params.onTrigger.results.body.data;
```

**PATTERN**: onTrigger modifies payload, onExecution reads it via `params.onTrigger.results.body.data`.

#### 3. HTTP Response Format

```typescript
const response: HttpResponse = {
  statusCode: 200, // HTTP status code
  contentType: "text/plain", // MIME type
  body: "Success", // Response body (string or object)

  // Optional:
  headers: {
    // Custom headers
    "X-Custom": "value",
  },
};
```

**COMMON PATTERNS** (note: `contentType` is required, `body` must be a string):

- `{ statusCode: 200, contentType: "text/plain", body: "OK" }` - Simple success
- `{ statusCode: 200, contentType: "text/plain", body: challengeKey }` - Echo challenge (webhook verification)
- `{ statusCode: 400, contentType: "application/json", body: JSON.stringify({ error: "..." }) }` - Reject invalid webhook

#### 4. Lifecycle Hooks

```typescript
// Called when instance is deployed
onInstanceDeploy: async (context) => {
  // Register webhooks with external service
  // Initialize resources
  // Set up database connections
},

// Called when instance is deleted
onInstanceDelete: async (context) => {
  // Unregister webhooks
  // Clean up resources
  // Close connections
}
```

**USE CASES**:

- **onInstanceDeploy**: Tell external system where to send webhooks
- **onInstanceDelete**: Clean up to prevent orphaned webhooks/resources

**ACCESS WEBHOOK URLS**: `context.webhookUrls` contains URLs for each flow.

---

## Step 2: Shared Configuration

**`src/configPages.ts`**

```typescript
import { configPage, configVar } from "@prismatic-io/spectral";
import { slackConnectionConfigVar } from "./connections";
import { slackSelectChannelDataSource } from "./dataSources";

export const configPages = {
  // ⭐ PAGE 1: AUTHENTICATION ⭐
  // Shared by all flows
  Connections: configPage({
    tagline: "Authenticate with Slack",
    elements: {
      "Slack OAuth Connection": slackConnectionConfigVar,
    },
  }),

  // ⭐ PAGE 2: SLACK CONFIGURATION ⭐
  // Shared by all flows
  "Slack Config": configPage({
    tagline: "Select a Slack channel from a dropdown menu",
    elements: {
      "Select Slack Channel": slackSelectChannelDataSource,
    },
  }),

  // ⭐ PAGE 3: OTHER CONFIGURATION ⭐
  // Flow-specific settings
  "Other Config": configPage({
    elements: {
      // Used by TODO Alerts flow only
      "Acme API Endpoint": configVar({
        stableKey: "acme-api-endpoint",
        dataType: "string",
        description: "The endpoint to fetch TODO items from Acme",
        defaultValue:
          "https://my-json-server.typicode.com/prismatic-io/placeholder-data/todo",
      }),

      // Used by Account Webhook flow only
      "Webhook Config Endpoint": configVar({
        stableKey: "webhook-config-endpoint",
        dataType: "string",
        description:
          "The endpoint to call when deploying or deleting an instance",
      }),
    },
  }),
};
```

---

### Key Patterns Explained

#### 1. Shared vs Flow-Specific Config

```typescript
// SHARED CONFIG - used by multiple flows
"Slack OAuth Connection": slackConnectionConfigVar,
"Select Slack Channel": slackSelectChannelDataSource,

// FLOW-SPECIFIC CONFIG - used by one flow only
"Acme API Endpoint": configVar({ ... }),      // Only todoAlerts flow uses this
"Webhook Config Endpoint": configVar({ ... }), // Only sendMessages flow uses this
```

**BEST PRACTICE**:

- Put shared config in first page(s)
- Group flow-specific config together
- Use clear descriptions to indicate which flow uses it

#### 2. Organizing Config Pages

**STRATEGY 1: By Function**

```typescript
Connections: { /* All auth */ }
"API Endpoints": { /* All endpoints */ }
"Slack Settings": { /* All Slack config */ }
```

**STRATEGY 2: By Flow**

```typescript
"TODO Alerts Config": { /* Everything for flow 1 */ }
"Webhook Config": { /* Everything for flow 2 */ }
"Shared Config": { /* Used by all */ }
```

**RECOMMENDATION**: Use Strategy 1 (by function) for better UX - users understand "Connections" better than "Flow 1 Settings".

---

## Helper Functions

**`src/slackClient.ts`**

```typescript
import { Connection } from "@prismatic-io/spectral";
import { createClient } from "@prismatic-io/spectral/dist/clients/http";

/**
 * Creates an HTTP client for Slack API with OAuth token
 *
 * WHY THIS HELPER:
 * - Reused by both flows
 * - Encapsulates token handling
 * - Single place to update Slack API logic
 */
export const createSlackClient = (connection: Connection) => {
  return createClient({
    baseUrl: "https://slack.com/api",
    headers: {
      // ⭐ USE OAUTH TOKEN FROM CONNECTION ⭐
      Authorization: `Bearer ${connection.token?.access_token}`,
    },
  });
};
```

**PATTERN**: Extract common logic into helpers that both flows can use.

---

## Testing Multiple Flows

### 1. Test Scheduled Flow (TODO Alerts)

```bash
# Manually trigger the flow
prism executions:test \
  --integration="Example Slack Integration with CNI" \
  --flow="Send TODO messages to Slack"
```

**WHAT HAPPENS**:

1. Prismatic calls onTrigger (passes through)
2. Prismatic calls onExecution immediately
3. Flow fetches TODOs and sends to Slack
4. View logs in output

### 2. Test Webhook Flow (Account Messages)

**Get webhook URL**:

```bash
# Deploy integration first
prism integrations:import

# Get webhook URL from instance
prism instances:list
# Copy webhook URL for "Send Slack Message on Account Received" flow
```

**Send test webhook**:

```bash
curl -X POST https://hooks.prismatic.io/trigger/YOUR_WEBHOOK_URL \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?>
<notification>
  <type>new_account</type>
  <challenge>test-challenge-123</challenge>
  <account>
    <first>Nelson</first>
    <last>Bighetti</last>
    <company>
      <name>Hooli</name>
      <city>Palo Alto</city>
      <state>CA</state>
    </company>
  </account>
</notification>'
```

**EXPECTED RESPONSE**:

```
test-challenge-123
```

**CHECK LOGS**:

```bash
prism executions:list --instance=YOUR_INSTANCE_ID --flow="Send Slack Message on Account Received"
```

### 3. View Logs for Specific Flow

```bash
# List all executions
prism executions:list

# Filter by flow
prism executions:list --flow="Send TODO messages to Slack"

# View specific execution
prism executions:get EXECUTION_ID
```

---

## Common Multi-Flow Patterns

### Pattern 1: Bidirectional Sync

```typescript
// Flow 1: Salesforce → HubSpot
export const salesforceToHubSpot = flow({
  name: "Sync Salesforce to HubSpot",
  stableKey: "sf-to-hs",
  onExecution: async (context) => {
    // Fetch changes from Salesforce
    // Update HubSpot
  },
});

// Flow 2: HubSpot → Salesforce
export const hubSpotToSalesforce = flow({
  name: "Sync HubSpot to Salesforce",
  stableKey: "hs-to-sf",
  onExecution: async (context) => {
    // Fetch changes from HubSpot
    // Update Salesforce
  },
});

export default [salesforceToHubSpot, hubSpotToSalesforce];
```

**USE CASE**: Keep two systems in sync, handling changes from either direction.

### Pattern 2: Event Processing + Maintenance

```typescript
// Flow 1: Real-time webhook handler
export const processEvents = flow({
  name: "Process Incoming Events",
  stableKey: "process-events",
  onTrigger: async (context, payload) => {
    // Acknowledge webhook immediately
  },
  onExecution: async (context, params) => {
    // Process event (slow)
  },
});

// Flow 2: Scheduled cleanup
export const cleanupOldData = flow({
  name: "Clean Up Old Data",
  stableKey: "cleanup",
  onExecution: async (context) => {
    // Run daily to clean up processed events
  },
});

export default [processEvents, cleanupOldData];
```

**USE CASE**: Handle real-time events + periodic maintenance in one integration.

### Pattern 3: Orchestration Pipeline

```typescript
// Flow 1: Webhook receiver
export const receiveOrder = flow({
  name: "Receive Order",
  stableKey: "receive-order",
  onTrigger: async (context, payload) => {
    // Parse and validate order
  },
  onExecution: async (context, params) => {
    // Store order in database
  },
});

// Flow 2: Process orders
export const processOrders = flow({
  name: "Process Orders",
  stableKey: "process-orders",
  onExecution: async (context) => {
    // Runs every 5 minutes
    // Process pending orders
  },
});

// Flow 3: Send notifications
export const sendNotifications = flow({
  name: "Send Order Notifications",
  stableKey: "notify",
  onExecution: async (context) => {
    // Runs every 10 minutes
    // Send status updates to customers
  },
});

export default [receiveOrder, processOrders, sendNotifications];
```

**USE CASE**: Break complex workflow into stages that can be monitored and scaled independently.

---

## Sharing Data Between Flows

### Challenge: Flows Run Independently

```typescript
// Flow 1 runs...
let orderCount = 0; // ❌ This won't persist

// Flow 2 runs later...
console.log(orderCount); // Still 0 - different execution
```

**PROBLEM**: Each flow execution is isolated. In-memory state doesn't persist.

### Solution 1: Use External Storage

```typescript
import { DynamoDB } from "aws-sdk";

// Flow 1: Save state
onExecution: async (context) => {
  const state = { lastSyncTime: new Date().toISOString() };
  await dynamodb.put({
    TableName: "integration-state",
    Item: { instanceId: context.instanceId, state },
  });
};

// Flow 2: Load state
onExecution: async (context) => {
  const result = await dynamodb.get({
    TableName: "integration-state",
    Key: { instanceId: context.instanceId },
  });
  const lastSyncTime = result.Item.state.lastSyncTime;
};
```

**OPTIONS FOR STORAGE**:

- DynamoDB (AWS)
- Redis (ephemeral)
- PostgreSQL (relational)
- S3 (file storage)

### Solution 2: Pass Data via API

```typescript
// Flow 1: Save data via API
onExecution: async (context) => {
  await axios.post("https://your-api.com/state", {
    instanceId: context.instanceId,
    data: { orderCount: 42 },
  });
};

// Flow 2: Fetch data via API
onExecution: async (context) => {
  const { data } = await axios.get(
    `https://your-api.com/state/${context.instanceId}`,
  );
  const orderCount = data.orderCount;
};
```

### Solution 3: Use Execution Context (Limited)

```typescript
// Only works within SAME execution
onTrigger: async (context, payload) => {
  return {
    payload: {
      ...payload,
      body: { data: { customData: "stored here" } },
    },
  };
};

onExecution: async (context, params) => {
  // Can access data from onTrigger
  const data = params.onTrigger.results.body.data.customData;
};
```

**LIMITATION**: Only works between onTrigger and onExecution of the same execution. Doesn't persist across flow runs.

---

## Summary: Multi-Flow Pattern

### Core Structure:

1. ✅ **Separate flow files** - One file per flow
2. ✅ **Export as array** - All flows in index.ts
3. ✅ **Shared config** - Common settings in configPages
4. ✅ **Helper functions** - Reusable logic across flows
5. ✅ **Independent execution** - Each flow runs separately

### Key Rules:

- ✅ **Use onTrigger for immediate responses** (webhooks)
- ✅ **Use onExecution for processing** (all flows)
- ✅ **Share config across flows** via configPages
- ✅ **Extract common logic** into helper functions
- ✅ **Use external storage** to share state between flows

### When to Use Multiple Flows:

Use multiple flows for:

- Bidirectional syncs (A→B and B→A)
- Event processing + maintenance
- Different triggers (webhook + schedule)
- Orchestration pipelines
- Independent features in one integration

**DON'T use multiple flows for**:

- Simple linear workflows (use one flow with steps)
- Tightly coupled operations (keep in one flow)

---

## Next Steps

- **Example 04**: Add dynamic data sources (dropdowns from API)
- **Example 05**: Error handling best practices
- **Example 07**: Advanced webhook parsing techniques

---

## Additional Resources

- **Spectral Flows Docs**: https://prismatic.io/docs/spectral/flows/
- **Webhook Triggers**: https://prismatic.io/docs/spectral/triggers/
- **Lifecycle Hooks**: https://prismatic.io/docs/spectral/lifecycle-hooks/
- **GitHub Example**: https://github.com/prismatic-io/examples/tree/main/integrations/code-native-integrations/slack-cni-integration
