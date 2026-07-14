# Code Generation Guide

Complete guide for generating TypeScript integration code using Spectral SDK.

---

## Type Safety Requirements

**CRITICAL:** All generated code MUST satisfy the types defined in `@prismatic-io/spectral`.

### Rules

1. **Generated code must compile without type errors.** If the build fails with type errors, fix the code to match Spectral's types - do not work around it.

2. **NEVER use `as any` to silence type errors for Spectral types.** This hides real problems that will cause runtime failures. If you're tempted to use `as any`, the code structure is wrong.

3. **NEVER use `@ts-ignore` or `@ts-expect-error` for Spectral types.** These comments mask type issues that indicate incorrect code.

4. **When build fails with type errors:**
   - Read the error message carefully
   - Check the Spectral SDK types at `node_modules/@prismatic-io/spectral/dist/types/` if needed
   - Fix the code to match the expected types
   - Do NOT suppress the error

5. **Type casting from generic types (TS2352):** When casting from `Record<string, unknown>` or similar generic types to specific interfaces, use the double-cast pattern:

   ```typescript
   // ❌ WRONG - Direct cast fails with TS2352
   const data = payload.body.data as Lead;

   // ✅ CORRECT - Double cast through unknown
   const data = payload.body.data as unknown as Lead;
   ```

   This is common when accessing webhook payload data, API responses, or cross-flow state.

---

## Table of Contents

1. [Overview](#overview)
2. [Configuration Pages (configPages.ts)](#configuration-pages)
3. [Flow Logic (flows.ts)](#flow-logic)
4. [Component Usage](#component-usage)
5. [Integration Definition (index.ts)](#integration-definition)
6. [Pre-Build Validation](#pre-build-validation)
7. [Code Quality Checklist](#code-quality-checklist)

---

## Overview

Phase 3 involves generating three main TypeScript files that define your integration:

- **`src/configPages.ts`** - User configuration UI and variables
- **`src/flows.ts`** - Integration logic and flow definitions
- **`src/index.ts`** - Integration metadata and exports

**Quick Start:** See [cni-examples/basic-api-to-slack.md](cni-examples/basic-api-to-slack.md) for a complete minimal working integration with all three files.

---

## Configuration Pages

### Purpose

The `src/configPages.ts` file defines the configuration UI that users see when setting up an instance of your integration. This is where users provide API keys, select options, configure OAuth, etc.

### ⚠️ CRITICAL: Avoid Common Config Mistakes

**EVERY config element MUST use a wrapper function** - never use plain objects!

❌ **WRONG** (plain object):

```typescript
"API Endpoint": {
  dataType: "string",
  stableKey: "apiEndpoint",
  label: "API Endpoint", // Invalid property!
  default: "https://...", // Wrong property name!
}
```

✅ **CORRECT** (wrapped in configVar):

```typescript
"API Endpoint": configVar({
  stableKey: "apiEndpoint",
  dataType: "string",
  description: "The API endpoint URL",
  defaultValue: "https://...",
})
```

**See [config-patterns-correct-vs-incorrect.md](cni-examples/config-patterns-correct-vs-incorrect.md) for complete examples of correct vs incorrect patterns.**

### Generate `src/configPages.ts`

**Elements to include based on requirements:**

- **Connection variables** (OAuth or API key)
  - Use `connectionConfigVar` for OAuth2/API connections
  - Use `configVar` for simple string/number values
- **Endpoint URLs**
  - Allow users to specify custom API endpoints if needed
  - Provide sensible defaults
- **Data source pickers** (e.g., Slack channel selector)
  - Use `dataSourceConfigVar` with `dataSourceType: "picklist"` for dropdowns populated from APIs
  - See [data-sources.md](cni-examples/data-sources.md) for complete pattern
- **JSON Forms** (complex configuration UIs)
  - Use `dataSourceConfigVar` with `dataSourceType: "jsonForm"` for multi-field forms, field mapping, or structured data collection
  - See [json-forms.md](cni-examples/json-forms.md) for practical examples
  - See [json-forms-schema-guide.md](cni-examples/json-forms-schema-guide.md) for schema reference
- **Feature flags or options**
  - Boolean toggles for optional features
  - Radio buttons or dropdowns for multi-choice options

### Configuration Types

**Basic string/number config:**

```typescript
configVar({
  stableKey: "api-endpoint",
  dataType: "string",
  description: "API endpoint URL",
});
```

**Integration-agnostic connections (recommended for platform integrations):**

There are THREE types of integration-agnostic connections:

1. **Customer-Activated** - Customer provides their own credentials (e.g., Salesforce, Slack):

```typescript
import { customerActivatedConnection } from "@prismatic-io/spectral";

customerActivatedConnection({
  stableKey: "salesforce-cac", // References existing platform connection
});
```

2. **Organization-Activated Customer** - You provide each customer's credentials (e.g., your own API):

```typescript
import { organizationActivatedConnection } from "@prismatic-io/spectral";

organizationActivatedConnection({
  stableKey: "your-api-org-customer", // Set per customer in Prismatic
});
```

3. **Organization-Activated Global** - Your org's account shared by all customers (e.g., Twilio):

```typescript
import { organizationActivatedConnection } from "@prismatic-io/spectral";

organizationActivatedConnection({
  stableKey: "twilio-org-global", // One connection for all customers
});
```

**Note:** When requirements.json contains `source_connection_existing` or `destination_connection_existing` objects with a `stableKey`, use that exact value. These keys reference connections that already exist in the user's Prismatic organization.

**Custom connection (for services without integration-agnostic connections):**

```typescript
connectionConfigVar({
  stableKey: "custom-api-connection",
  dataType: "connection",
  description: "Custom API OAuth connection",
  inputs: {
    clientId: input({ label: "Client ID", type: "string" }),
    clientSecret: input({ label: "Client Secret", type: "password" }),
  },
});
```

**Data source dropdown:**

```typescript
dataSourceConfigVar({
  stableKey: "slack-channel",
  dataSourceType: "picklist",
  description: "Select a Slack channel",
  perform: async (context) => {
    // Fetch options from API
    return { result: elements };
  },
});
```

**JSON Forms (complex configuration UIs):**

```typescript
dataSourceConfigVar({
  stableKey: "field-mapper",
  dataSourceType: "jsonForm",
  perform: async (context) => {
    // Return schema-based form
    return {
      result: {
        schema: {
          /* JSON Schema */
        },
        uiSchema: {
          /* UI layout */
        },
        data: {
          /* default values */
        },
      },
    };
  },
});
```

**JSON Forms (complex configuration UIs):**

```typescript
dataSourceConfigVar({
  stableKey: "field-mapper",
  dataSourceType: "jsonForm",
  perform: async (context) => {
    // Return schema-based form
    return {
      result: {
        schema: {
          /* JSON Schema */
        },
        uiSchema: {
          /* UI layout */
        },
        data: {
          /* default values */
        },
      },
    };
  },
});
```

### Choosing the Right Connection Type

**When to use customerActivatedConnection:**

- Third-party OAuth platforms (Salesforce, Slack, Google, GitHub, etc.)
- Customer owns their own account on the platform
- Need customer-specific credentials they provide themselves
- Platform has a Prismatic component

**When to use organizationActivatedConnection (Customer):**

- Connecting to YOUR OWN app/API
- You generate/manage customer credentials
- Want to hide connection from customer config wizard
- Example: Customer is already logged into your app

**When to use organizationActivatedConnection (Global):**

- ONE shared account for ALL customers
- Services like Twilio, SendGrid, monitoring tools
- Your organization owns the service account
- Customers never see this connection

**When to use connectionConfigVar:**

- Custom or internal API without a Prismatic component
- Need special authentication flow
- Integration-specific connection parameters
- Unique OAuth configuration requirements

**How to decide:**

1. Search for available connections: `prismatic-tools search-connections <platform>`
2. If found → Use appropriate integration-agnostic connection type
3. If not found → Use `connectionConfigVar`

**Complete guide:** See [cni-examples/integration-agnostic-connections.md](cni-examples/integration-agnostic-connections.md)

### Reference Examples

- **⭐ Correct vs Incorrect Patterns** → See [cni-examples/config-patterns-correct-vs-incorrect.md](cni-examples/config-patterns-correct-vs-incorrect.md) (MUST READ - shows exactly what to do and what NOT to do)
- **Integration-agnostic connections** → See [cni-examples/integration-agnostic-connections.md](cni-examples/integration-agnostic-connections.md) (comprehensive guide for all three types)
- **Customer-activated connections** → See [cni-examples/integration-agnostic-connections.md](cni-examples/integration-agnostic-connections.md) (focused on customer-activated)
- **OAuth configuration** → See [cni-examples/oauth-connection.md](cni-examples/oauth-connection.md) (complete configPages.ts with OAuth2)
- **Data source dropdowns** → See [cni-examples/data-sources.md](cni-examples/data-sources.md) (Slack channel picker with pagination)
- **JSON Forms (complex UIs)** → See [cni-examples/json-forms.md](cni-examples/json-forms.md) (field mapping, structured forms with validation)
- **JSON Schema reference** → See [cni-examples/json-forms-schema-guide.md](cni-examples/json-forms-schema-guide.md) (complete schema/UI options)
- **Basic config** → See [cni-examples/basic-api-to-slack.md](cni-examples/basic-api-to-slack.md) (simple string configs)
- **Config patterns** → See [spectral-quickstart.md](spectral-quickstart.md) (SDK fundamentals)

### Best Practices

- Use clear, descriptive labels for all config variables
- Provide helpful descriptions and default values
- Use `stableKey` that never changes after deployment
- Group related configuration items together
- Validate user input where possible

---

## Flow Logic

### Purpose

The `src/flows.ts` file contains the actual integration logic - what happens when the integration runs.

### Generate `src/flows.ts`

**Flow structure depends on trigger type:**

- **Scheduled flows** → `schedule` property + `onExecution` handler
  - Must include `schedule: { value: "cron expression" }` or `schedule: { configVar: "Schedule Config Var" }`
  - Runs on the defined schedule
  - All logic in `onExecution`
- **Webhook flows** → `onTrigger` + `onExecution` split
  - `onTrigger`: Parse webhook payload, return `{ payload }` with optional HTTP response
  - `onExecution`: Process the data asynchronously
  - See webhook patterns in [error-handling.md](cni-examples/error-handling.md)
- **Component trigger flows** → `onTrigger` with component reference
  - Use when the source component has a trigger that manages webhook lifecycle (e.g., HMAC verification, auto-registration)
  - The component's trigger lifecycle functions (register/deregister webhooks) run automatically on deploy/delete
  - Import the trigger from the manifest: e.g., `import { shopifyEventTopicWebhookGql } from "./manifests/shopify/triggers/eventTopicWebhookGql"`
  - Pattern: `onTrigger: shopifyEventTopicWebhookGql({ input: { configVar: "..." } })`
- **Manual flows** → Simple `onExecution` handler (no schedule, no onTrigger)

> **⚠️ IMPORTANT:** `pollingTrigger` (the Spectral helper) is NOT supported in CNI. If a component uses `pollingTrigger`, use a webhook trigger if the API supports it (preferred), or a scheduled trigger with polling logic in `onExecution`.

### Trigger Decision Tree

Use this to determine the correct trigger pattern for each flow:

1. **Webhook** (external source sends HTTP to Prismatic) → Omit `onTrigger` entirely. The platform handles HTTP receipt.
2. **Scheduled** (runs on cron) → Add `schedule: { value: "cron expression" }` or `schedule: { configVar: "Schedule Config Var" }`. No `onTrigger`.
3. **Component trigger** (e.g., Shopify managed webhooks, HMAC verification) → Add `onTrigger` with component trigger reference imported from manifest. No custom webhook parsing needed.
4. **Component trigger + schedule** (polling via component) → Add BOTH `onTrigger` with component reference AND `schedule` property.

### Flow Definition Structure

```typescript
export const myFlow = flow({
  name: "User-visible flow name",
  stableKey: "my-flow-key", // NEVER change this after deployment
  description: "What this flow does",

  // For scheduled flows - REQUIRED for polling patterns:
  // schedule: { value: "*/5 * * * *" },  // Cron expression
  // OR
  // schedule: { configVar: "My Schedule" },  // User-configurable

  // For lifecycle management (optional):
  onInstanceDeploy: async (context) => {
    // Runs when instance is deployed or re-deployed
    // See lifecycle-events.md for complete reference
    const { logger, configVars, webhookUrls } = context;
    logger.info("Instance deployed");
    // Initialize state, register webhooks, validate config...
  },

  onInstanceDelete: async (context) => {
    // Runs when instance is deleted
    // See lifecycle-events.md for complete reference
    const { logger } = context;
    logger.info("Instance deleted");
    // Clean up resources, unregister webhooks...
  },

  // For webhook flows only:
  // ⚠️ CRITICAL: onTrigger MUST return { payload } - NOT just payload
  onTrigger: async (context, payload) => {
    // Parse webhook, return payload with optional HTTP response
    // TriggerResult type requires { payload }, response is optional
    //
    // ❌ WRONG: return Promise.resolve(payload);
    // ❌ WRONG: return payload;
    // ✅ CORRECT: return Promise.resolve({ payload });
    // ✅ CORRECT: return { payload };
    return Promise.resolve({
      payload,
      response: {
        statusCode: 200,
        contentType: "text/plain",
        body: "OK",
      },
    });
  },

  // For all flows:
  onExecution: async (context, params) => {
    // Main integration logic here
    const { logger, configVars, instanceState, crossFlowState } = context;

    logger.info("Starting execution");

    // Access config variables
    const apiKey = util.types.toString(configVars["API Key"]);

    // Access persisted state (see state-persistence.md)
    const cursor = (instanceState["cursor"] as string) ?? "0";

    // Your logic here...

    // Update state for next execution
    instanceState["cursor"] = newCursor;

    return { data: result };
  },
});
```

### Context Object

The `context` parameter provides different properties depending on where you're accessing it:

**State Availability Matrix:**

| Context Property   | onInstanceDeploy | onInstanceDelete | onExecution | onTrigger |
| ------------------ | ---------------- | ---------------- | ----------- | --------- |
| `logger`           | ✅ Yes           | ✅ Yes           | ✅ Yes      | ✅ Yes    |
| `configVars`       | ✅ Yes           | ✅ Yes           | ✅ Yes      | ✅ Yes    |
| `instanceId`       | ✅ Yes           | ✅ Yes           | ✅ Yes      | ✅ Yes    |
| `webhookUrls`      | ✅ Yes           | ✅ Yes           | ❌ No       | ❌ No     |
| `crossFlowState`   | ✅ Yes           | ✅ Yes           | ✅ Yes      | ✅ Yes    |
| `integrationState` | ✅ Yes           | ✅ Yes           | ✅ Yes      | ✅ Yes    |
| `instanceState`    | ❌ **NO**        | ❌ **NO**        | ✅ Yes      | ✅ Yes    |
| `executionState`   | ❌ **NO**        | ❌ **NO**        | ✅ Yes      | ✅ Yes    |

**⚠️ CRITICAL:**

- `instanceState` (flow-specific state) is NOT available in lifecycle hooks (`onInstanceDeploy`, `onInstanceDelete`)
- Use `crossFlowState` for storing data in lifecycle hooks that flows will later access
- `webhookUrls` is ONLY available in lifecycle hooks, not in execution contexts

**Context Property Descriptions:**

- **`logger`** - Logging interface (logger.info, logger.warn, logger.error)
- **`configVars`** - User-configured values from configPages
- **`instanceId`** - Unique instance identifier
- **`webhookUrls`** - Webhook URLs for each flow (key = stableKey) - ONLY in lifecycle hooks
- **`crossFlowState`** - State shared between all flows in instance (see [state-persistence.md](cni-examples/state-persistence.md))
- **`integrationState`** - State shared across all instances (see [state-persistence.md](cni-examples/state-persistence.md))
- **`instanceState`** - Persistent flow-specific state across executions (see [state-persistence.md](cni-examples/state-persistence.md)) - ONLY in execution contexts
- **`executionState`** - Temporary state within current execution (see [state-persistence.md](cni-examples/state-persistence.md)) - ONLY in execution contexts
- **`stepId`** - Unique identifier for current step

### Reference Examples

- **Basic flow** → See [cni-examples/basic-api-to-slack.md](cni-examples/basic-api-to-slack.md) (complete flows.ts with API calls)
- **Webhook flow** → See [cni-examples/error-handling.md](cni-examples/error-handling.md) (webhook section with XML parsing)
- **Webhook payload access** → See [cni-examples/webhook-payload-access.md](cni-examples/webhook-payload-access.md) (how to access trigger results in onExecution)
- **Multi-flow** → See [cni-examples/multi-flow.md](cni-examples/multi-flow.md) (both scheduled and webhook flows)
- **Lifecycle events** → See [cni-examples/lifecycle-events.md](cni-examples/lifecycle-events.md) (complete onInstanceDeploy/onInstanceDelete reference)
- **State persistence** → See [cni-examples/state-persistence.md](cni-examples/state-persistence.md) (all state types with patterns)

### Accessing Trigger Results in onExecution

When accessing webhook payload data in `onExecution`:

```typescript
// params.onTrigger.results IS the payload directly (no wrapper)
const payload = params.onTrigger.results;

// Your parsed JSON webhook data is in body.data
const webhookData = payload.body?.data;
```

**See [cni-examples/webhook-payload-access.md](cni-examples/webhook-payload-access.md) for complete patterns and examples.**

### Webhook Payload Handling

When implementing webhook flows, the `payload.rawBody.data` may arrive in different formats depending on the content type and how the data was transmitted.

#### Handling Serialized Buffer Objects

For certain content types (like `application/x-www-form-urlencoded` from Slack slash commands), the payload may come through as a serialized Buffer object:

```typescript
{
  type: "Buffer",
  data: [116, 111, 107, 101, 110, ...] // Byte array
}
```

**Problem:** Direct property checks may fail due to how the object is serialized.

**Solution:** Use JSON serialization to reliably detect and convert:

```typescript
onTrigger: async (context, payload) => {
  const { logger } = context;
  let bodyData = payload.rawBody.data;

  // Detect and handle serialized Buffer objects
  const serialized = JSON.stringify(bodyData);
  const parsed = JSON.parse(serialized);

  if (parsed.type === "Buffer" && Array.isArray(parsed.data)) {
    // Convert byte array to string
    const formDataString = Buffer.from(parsed.data).toString("utf-8");
    logger.info("Converted serialized Buffer to string");

    // Now parse form data if needed
    const params = new URLSearchParams(formDataString);
    const response_url = params.get("response_url");
    // ... rest of processing
  }

  return {
    statusCode: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true }),
  };
};
```

**Why this approach works:**

1. JSON.stringify/parse normalizes the object representation
2. Reliably detects the `type: "Buffer"` property
3. Converts byte array back to original string
4. Allows parsing of form-encoded data

**Common use cases:**

- Slack slash commands (`application/x-www-form-urlencoded`)
- Form submissions with unusual encoding
- Binary data transmitted as JSON-serialized buffers

### Flow Best Practices

- Use descriptive flow names and descriptions
- Log important steps (but not sensitive data)
- Handle errors gracefully with try/catch
- Return meaningful data from executions
- Use TypeScript types for data structures
- Validate webhook payloads before processing
- Handle serialized Buffer objects when dealing with form data

---

## Test Data Directory ⭐ REQUIRED

### Purpose

**Create `test-data/` directory for EVERY integration** to organize trigger metadata and test payloads, enabling automatic test execution.

### When to Create

Generate this directory structure immediately after creating `src/flows.ts` in Phase 3.

### Directory Structure

```
<integration-dir>/test-data/
├── trigger-config.json              ← Metadata for all flows
└── <flow-stable-key>/               ← Per-flow subdirectories
    └── sample-payload.<ext>         ← Test payload files
```

### What to Include

**1. Trigger Metadata (`test-data/trigger-config.json`)**

For each flow in your integration, document:

- **Trigger type**: webhook, schedule, or manual
- **For webhook triggers**:
  - Expected content type (application/json, application/xml, etc.)

**2. Test Payload Files (for webhook flows)**

Create `test-data/<flow-stable-key>/sample-payload.<ext>` with realistic test data that matches what `onTrigger` expects.

**Why this matters:** The test script reads the metadata to locate the appropriate test payload file and automatically pass it to the test command.

### Example: JSON Webhook Flow

**File: `test-data/trigger-config.json`**

```json
{
  "version": "1.0",
  "flows": {
    "process-webhook": {
      "name": "Process Webhook",
      "triggerType": "webhook",
      "webhook": {
        "expectsPayload": true,
        "contentType": "application/json"
      }
    }
  }
}
```

**File: `test-data/process-webhook/sample-payload.json`**

```json
{
  "event": "test",
  "data": {
    "id": "test-123",
    "message": "Test webhook"
  }
}
```

### Example: XML Webhook Flow

**File: `test-data/trigger-config.json`**

```json
{
  "version": "1.0",
  "flows": {
    "xml-receiver": {
      "name": "XML Receiver",
      "triggerType": "webhook",
      "webhook": {
        "expectsPayload": true,
        "contentType": "application/xml"
      }
    }
  }
}
```

**File: `test-data/xml-receiver/sample-payload.xml`**

```xml
<?xml version="1.0"?>
<event>
  <type>test</type>
  <id>123</id>
</event>
```

### Example: Scheduled Flow

**File: `test-data/trigger-config.json`**

```json
{
  "version": "1.0",
  "flows": {
    "daily-sync": {
      "name": "Daily Data Sync",
      "triggerType": "schedule"
    }
  }
}
```

(No payload file needed for scheduled flows)

### Complete Specification

See [trigger-metadata-spec.md](trigger-metadata-spec.md) for full format details and examples.

### Creation Checklist

When generating test artifacts:

- [ ] Create `test-data/` directory in integration root
- [ ] Create `test-data/trigger-config.json` with entry for every flow
- [ ] Match `flow.stableKey` from `src/flows.ts` as the key in metadata
- [ ] For webhook flows, create `test-data/<flow-key>/` subdirectory
- [ ] For webhook flows, create `test-data/<flow-key>/sample-payload.<ext>` file
- [ ] Ensure sample payload structure matches what `onTrigger` parses
- [ ] Test that sample payload would actually work with your trigger code

---

## Using Component Manifests

### ⭐ ALWAYS SEARCH FOR COMPONENTS FIRST

**Default approach:** For ANY external system integration, use component manifests.

### What Are Component Manifests?

Component manifests are auto-generated TypeScript wrappers that provide type-safe access to Prismatic's pre-built components. They are installed with `prismatic-tools install-manifest <component>`.

**Why component manifests are preferred:**

1. ✅ **Type-safe** - IDE autocomplete and compile-time checks
2. ✅ **Pre-built OAuth** - No manual token handling
3. ✅ **Data sources** - Dynamic dropdowns for channel/folder selection
4. ✅ **Maintained** - Auto-updated with component changes
5. ✅ **Cleaner code** - No API client boilerplate
6. ✅ **Reliable auth** - Battle-tested authentication patterns

### Default Workflow: Manifest-First Approach

**For integrations with external systems (Salesforce, Slack, databases, AWS, etc.):**

1. ✅ **Search:** `prismatic-tools find-components <system>`
2. ✅ **Scaffold with manifests:** `scaffold-project.ts <name> --components slack,salesforce`
3. ✅ **Register:** Create `componentRegistry.ts`
4. ✅ **Configure:** Use connection helpers in `configPages.ts`
5. ✅ **Use:** Import manifest actions and call `<component>Actions.<action>.perform()`

**Only build completely custom when:**

- **No component exists** after searching (rare - Prismatic has 200+ components)
- **Component missing feature** AND custom code is simpler than adapting
- **Trivial internal API** with no authentication needs

### Installing Component Manifests

**During scaffolding (recommended):**

```bash
scripts/integrations/scaffold-project.ts my-integration --components slack,salesforce,hubspot
```

**Or manually:**

```bash
prismatic-tools install-manifest slack --project-dir <project-dir>
prismatic-tools install-manifest salesforce --project-dir <project-dir>
```

### Registering Components

Create `src/componentRegistry.ts`:

```typescript
import { componentManifests } from "@prismatic-io/spectral";
import slack from "./manifests/slack";
import salesforce from "./manifests/salesforce";

export const componentRegistry = componentManifests({ slack, salesforce });
```

Include in `src/index.ts`:

```typescript
import { componentRegistry } from "./componentRegistry";

export default integration({
  // ...
  componentRegistry,
});
```

### Using Connection Helpers

Import connection helpers from manifests in `configPages.ts`:

```typescript
import { slackOauth2 } from "./manifests/slack/connections/oauth2";
import { salesforceOauth2 } from "./manifests/salesforce/connections/oauth2";

export const configPages = {
  Connections: configPage({
    elements: {
      "Slack Connection": slackOauth2("slack-connection", {
        clientId: { value: process.env.SLACK_CLIENT_ID || "" },
        clientSecret: { value: process.env.SLACK_CLIENT_SECRET || "" },
        scopes: { value: "chat:write channels:read" },
      }),
    },
  }),
};
```

### Using Selected Connection Type from Requirements

When the user has selected a specific connection type during requirements gathering (stored in `source_connection_type` or `destination_connection_type`), use that selection to import the correct connection helper.

**Requirements.json contains:**

```json
{
  "source_component": "jira",
  "source_connection_type": {
    "key": "oauth2",
    "label": "Jira OAuth2 (OAuth2)",
    "auth_type": "OAuth2"
  }
}
```

**Generated configPages.ts should use:**

```typescript
// User selected "oauth2" for Jira
import { jiraOauth2 } from "./manifests/jira/connections/oauth2";

// If user had selected "apiKey" instead:
// import { jiraApiKey } from "./manifests/jira/connections/apiKey";

export const configPages = {
  Connections: configPage({
    elements: {
      "Jira Connection": jiraOauth2("jira-connection", {
        // OAuth2 specific inputs
        clientId: { value: process.env.JIRA_CLIENT_ID || "" },
        clientSecret: { value: process.env.JIRA_CLIENT_SECRET || "" },
        scopes: { value: "read:jira-work write:jira-work" },
      }),
    },
  }),
};
```

**Connection type mapping pattern:**

| Connection Key | Import Path Pattern |
|----------------|---------------------|
| `oauth2` | `./manifests/<component>/connections/oauth2` |
| `apiKey` | `./manifests/<component>/connections/apiKey` |
| `apiToken` | `./manifests/<component>/connections/apiToken` |
| `basic` | `./manifests/<component>/connections/basic` |
| `bearer` | `./manifests/<component>/connections/bearer` |

**Best practice:** Always check `requirements.json` for `*_connection_type` fields and use the `key` value to construct the correct import path.

### Using Data Source Helpers

For dynamic dropdowns:

```typescript
import { slackSelectChannels } from "./manifests/slack/dataSources/selectChannels";

"Slack Channel": slackSelectChannels("slack-channel", {
  connection: { configVar: "Slack Connection" },
  includePublicChannels: { value: true },
})
```

### Accessing Components in Flows

```typescript
import slackActions from "../manifests/slack/actions";

onExecution: async (context, params) => {
  // Call component action via manifest import + .perform()
  const result = await slackActions.postMessage.perform({
    connection: context.configVars["Slack Connection"],
    channelName: context.configVars["Slack Channel"],
    message: "Hello from integration!",
  }) as SlackPostMessageResponse;

  return { data: result };
};
```

### Type Handling

Component actions return `unknown`. Define and cast to expected types:

```typescript
import slackActions from "../manifests/slack/actions";

interface SlackPostMessageResponse {
  ok: boolean;
  ts: string;
  channel: string;
}

const result = await slackActions.postMessage.perform({
  // ...params
}) as SlackPostMessageResponse;
```

### Finding Component Information

Use `prismatic-tools find-components` to discover available components by keyword.
This returns component keys for use with `--components` flag.

**Complete guide:** See [manifest-pattern.md](manifest-pattern.md) for detailed patterns and examples.

### Component Manifest Resources

- **Manifest pattern guide:** [manifest-pattern.md](manifest-pattern.md)
- **Using components example:** [cni-examples/using-components.md](cni-examples/using-components.md)
- **Auth patterns:** [cni-examples/component-auth-patterns.md](cni-examples/component-auth-patterns.md)

### Best Practices

- Install manifests for ALL external system integrations
- Register all manifests in `componentRegistry.ts`
- Use connection helpers instead of custom OAuth code
- Use data source helpers for dynamic dropdowns
- Cast action results to appropriate TypeScript types
- Include `componentRegistry` in integration definition

---

## Integration Definition

### Purpose

The `src/index.ts` file ties everything together and exports your integration definition.

### Update `src/index.ts`

```typescript
import { integration } from "@prismatic-io/spectral";
import { myFlow } from "./flows";
import { configPages } from "./configPages";
import documentation from "./documentation.md";

export default integration({
  name: "My Integration Name",
  description: "Brief 1-2 sentence summary of what this integration does.",
  iconPath: "icon.png", // Optional
  version: "1.0.0",
  flows: [myFlow], // Import all flows here
  configPages: configPages,
  documentation, // Markdown content from documentation.md
});
```

### Integration Metadata

**Required fields:**

- `name` - User-visible integration name
- `description` - Brief 1-2 sentence description of what integration does (shown in listings)
- `documentation` - Imported Markdown content (see `src/documentation.md`)
- `flows` - Array of flow definitions
- `configPages` - Configuration page structure

**Optional fields:**

- `iconPath` - Path to integration icon
- `version` - Semantic version string
- `labels` - Tags for categorization

### Best Practices

- Keep `description` to 1-2 concise sentences (shown in integration listings)
- Create `src/documentation.md` with full Markdown documentation (shown in detail view)
- Import documentation: `import documentation from "./documentation.md"`
- Include all flows in flows array
- Version semantically (1.0.0, 1.1.0, 2.0.0)

---

## Pre-Build Validation

### Purpose

Catch TypeScript errors before the full webpack bundle, saving time in the development cycle.

### Build Check

Run the build to validate TypeScript and catch errors:

```bash
npm run build --prefix <project-dir>
```

**The build catches:**

- Syntax errors
- Type mismatches
- Missing imports
- Invalid property access
- Incorrect function signatures
- Undefined variables

### Workflow

1. Generate/modify code
2. Run `npm run build --prefix <project-dir>`
3. If errors found:
   - Fix immediately
   - Rebuild
   - Repeat until clean
4. If no errors:
   - Proceed to deploy

### Common TypeScript Errors

**Missing imports:**

```
Cannot find name 'axios'
```

→ Add: `import axios from "axios";`

**Type mismatches:**

```
Type 'string' is not assignable to type 'number'
```

→ Fix type or use type conversion

**Undefined properties:**

```
Property 'data' does not exist on type 'Response'
```

→ Check API response structure or add type annotation

**See also:** [troubleshooting-errors.md](troubleshooting-errors.md)

---

## Code Quality Checklist

Before proceeding to build, verify your code includes:

### Error Handling

- [ ] **Try/catch blocks** around API calls and risky operations
- [ ] **Meaningful error messages** that help users understand what went wrong
- [ ] **Graceful degradation** - partial failures don't crash entire execution
- [ ] **Error logging** with context about what was being attempted

**Example:**

```typescript
try {
  const response = await axios.get(apiUrl);
  logger.info("Successfully fetched data");
  return response.data;
} catch (error) {
  logger.error(`Failed to fetch data from ${apiUrl}: ${error.message}`);
  throw new Error(`API request failed: ${error.message}`);
}
```

### Logging

- [ ] **Log at key points** - start, major steps, completion
- [ ] **Appropriate log levels** - info for normal flow, warn for issues, error for failures
- [ ] **No sensitive data** - don't log passwords, tokens, PII
- [ ] **Helpful context** - include relevant IDs, counts, states

**Example:**

```typescript
logger.info("Starting sync of contacts");
logger.info(`Processing ${contacts.length} contacts`);
logger.warn(`Skipping invalid contact: ${contactId}`);
logger.error(`Failed to create contact: ${error.message}`);
```

### Type Safety

- [ ] **TypeScript interfaces** for data structures
- [ ] **Type annotations** for function parameters and returns
- [ ] **Type assertions** only when necessary and safe
- [ ] **Avoid 'any' type** - use specific types or 'unknown'

**Example:**

```typescript
interface Contact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

const processContact = (contact: Contact): boolean => {
  // Type-safe processing
};
```

### Configuration Access

- [ ] **Use context.configVars** to access user configuration
- [ ] **Type conversion helpers** - util.types.toString(), toNumber(), etc.
- [ ] **Handle missing config** gracefully
- [ ] **Validate config values** before use

**Example:**

```typescript
const apiKey = util.types.toString(configVars["API Key"]);
if (!apiKey) {
  throw new Error("API Key not configured");
}
```

### Return Values

- [ ] **Return meaningful data** from executions
- [ ] **Include metadata** - record counts, statuses, etc.
- [ ] **Structure consistently** - same format across flows
- [ ] **Document return structure** in comments

**Example:**

```typescript
return {
  data: {
    processed: successCount,
    failed: failureCount,
    records: processedRecords,
  },
};
```

### Additional Quality Checks

- [ ] **Comments explain WHY**, not what
- [ ] **Functions are focused** - single responsibility
- [ ] **Magic numbers avoided** - use named constants
- [ ] **Async/await used correctly** - no promise nesting
- [ ] **Resources cleaned up** - connections closed, files removed

---

## Summary

This guide covers all aspects of code generation for Prismatic integrations:

1. **Configuration Pages** - Define user-facing config UI
2. **Flow Logic** - Implement integration behavior
3. **Components** - Leverage pre-built integrations
4. **Integration Definition** - Tie everything together
5. **Validation** - Catch errors early
6. **Quality** - Ensure production-ready code

**Next step:** After generating code, proceed to Phase 4-5 (Build, Deploy & Test).

**Need help?** See [cni-examples/](cni-examples/) for complete working examples.
