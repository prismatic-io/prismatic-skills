# Answer-to-Code Cookbook

<!-- Section headings are referenced by YAML spec items via cookbook_section fields. Do not rename without updating cookbook_section fields in scripts/questions/integration/*.yaml. -->

Maps integration.yaml answer IDs to exact TypeScript code. When generating code,
look up each answer and copy the corresponding snippet. Do NOT improvise types or imports.

## Critical Import Rules

```typescript
// CORRECT — always import from the package root
import { flow, util, integration, configPage, configVar, connectionConfigVar, dataSourceConfigVar, componentManifests } from "@prismatic-io/spectral";

// WRONG — never import from internal paths
// import { flow } from "@prismatic-io/spectral/dist/serverTypes";  // BREAKS TYPES
// import type { ActionContext } from "@prismatic-io/spectral/dist/serverTypes";  // UNNECESSARY
// import { util } from "@prismatic-io/spectral/dist/testing";  // INTERNAL PATH — BREAKS BUILD
```

## Default Omission Rule

When an answer matches the Prismatic default, **omit the property entirely** rather than
setting it explicitly. Prismatic applies defaults at runtime.

| Answer | Default | Action |
|--------|---------|--------|
| error_handler_type: "fail" | fail | Omit errorConfig |
| is_synchronous: "No" | false | Omit isSynchronous |
| endpoint_type: "flow_specific" | flow_specific | Omit endpointType |
| endpoint_security: "customer_optional" | customer_optional | Omit endpointSecurityType |
| execution_retry_enabled: "No" | N/A | Omit retryConfig |

## Critical Type Rules

- **Do NOT add type annotations to onTrigger or onExecution parameters** — they are inferred by `flow()`.
- **Do NOT use flow generics** like `flow<typeof configPages, typeof componentRegistry>()` — use plain `flow({})`.
- **Use `as unknown as T`** for webhook payload casting.
- **Use `as Record<string, unknown>`** for component action results.

### TAllowsBranching type issue

The `flow()` function defaults `TAllowsBranching` to `boolean` which creates a `true | false` union
in `TriggerResult`. This makes custom `onTrigger` return types nearly impossible to satisfy when you
transform the payload.

**Pragmatic fix: SKIP custom onTrigger for webhook flows.** The default trigger passes the full
payload through. Extract data in `onExecution` instead:

```typescript
// WRONG — fighting TriggerResult union types in onTrigger
onTrigger: async (context, payload, params) => {
  const body = payload.body?.data;           // TypeScript error: return type mismatch
  return { payload: { body, contentType: "application/json" } };
},

// CORRECT — skip onTrigger, extract in onExecution
// (no onTrigger property at all — default passes payload through)
onExecution: async (context, params) => {
  const payload = params.onTrigger.results;
  const body = payload.body.data as unknown as MyType;
  // ... business logic
},
```

If you MUST customize onTrigger (e.g., to return an HTTP response for sync flows),
pass the payload through unchanged and cast:

```typescript
onTrigger: async (context, payload, params) => {
  return Promise.resolve({
    payload,
    response: { statusCode: 200, contentType: "application/json", body: "" },
  });
},
```

---

## Flow Structure (complete working example)

```typescript
import { flow } from "@prismatic-io/spectral";
import slackActions from "../manifests/slack/actions";

interface MyPayload {
  name: string;
  value: number;
}

export const myFlow = flow({
  name: "My Flow",
  stableKey: "my-flow",
  description: "Does something useful",

  // --- These blocks come from integration.yaml answers ---
  // errorConfig: { ... },      // from error_handler_type + related answers
  // retryConfig: { ... },      // from execution_retry_enabled + related answers
  // queueConfig: { ... },      // from queue_type + related answers
  // isSynchronous: true,       // from is_synchronous answer

  // Do NOT define onTrigger for webhook flows — default passes payload through.
  // See "TAllowsBranching type issue" above for why.

  onExecution: async (context, params) => {
    // Access webhook payload from trigger results
    const payload = params.onTrigger.results;
    const data = payload.body.data as unknown as MyPayload;

    // Access config vars
    const connection = context.configVars["My Connection"];
    const channel = context.configVars["My Channel"];

    // Call component actions via manifest imports (NOT context.components)
    const result = await slackActions.postMessage.perform({
      connection,
      channelName: channel as unknown as string,
      message: `New: ${data.name}`,
    });

    context.logger.info("Done");
    return { data: (result as Record<string, unknown>)?.data ?? null };
  },
});

export default [myFlow];
```

---

## answer: error_handler_type → `flow.errorConfig`

### error_handler_type: "fail"

```typescript
// "fail" is the default — omit errorConfig entirely
// Do NOT write: errorConfig: { errorHandlerType: "fail" }
```

### error_handler_type: "ignore"

```typescript
errorConfig: {
  errorHandlerType: "ignore",
},
```

### error_handler_type: "retry"

Uses: `error_retry_max_attempts`, `error_retry_delay_seconds`, `error_retry_backoff`, `error_retry_ignore_final`

```typescript
errorConfig: {
  errorHandlerType: "retry",
  maxAttempts: 3,                   // from error_retry_max_attempts (1-5)
  delaySeconds: 10,                 // from error_retry_delay_seconds (5-60)
  usesExponentialBackoff: false,    // from error_retry_backoff ("Yes" → true)
  ignoreFinalError: false,          // from error_retry_ignore_final ("Yes" → true)
},
```

---

## answer: execution_retry_enabled → `flow.retryConfig`

### execution_retry_enabled: "No"

```typescript
// Omit retryConfig entirely
```

### execution_retry_enabled: "Yes"

Uses: `execution_retry_max_attempts`, `execution_retry_delay_minutes`, `execution_retry_backoff`, `execution_retry_cancellation_field`

```typescript
retryConfig: {
  maxAttempts: 5,                   // from execution_retry_max_attempts (1-10)
  delayMinutes: 3,                  // from execution_retry_delay_minutes (1-60)
  usesExponentialBackoff: true,     // from execution_retry_backoff ("Yes" → true)
  uniqueRequestIdField: "body.data.id",  // from execution_retry_cancellation_field (optional)
},
```

---

## answer: queue config → `flow.queueConfig`

Uses flat shape (matches docs and platform backend). Feature-flag gated.

### No queue config needed (default)

```typescript
// Omit queueConfig entirely — default is sequential (concurrency 1)
```

### FIFO ordering (async webhook flows only)

Uses: `queue_fifo_enabled`, `queue_dedupe_field`

```typescript
queueConfig: {
  usesFifoQueue: true,
  dedupeIdField: "body.data.webhook-id",  // from queue_dedupe_field (optional)
},
```

### Custom concurrency limit

Uses: `queue_concurrency_limit`

```typescript
queueConfig: {
  concurrencyLimit: 5,              // from queue_concurrency_limit (2-15)
},
```

### Singleton executions (scheduled/polling flows only)

Uses: `queue_singleton_executions`

```typescript
queueConfig: {
  singletonExecutions: true,        // prevents overlapping scheduled executions
},
```

---

## answer: is_synchronous → `flow.isSynchronous`

### is_synchronous: "No"

```typescript
// Async is the default — omit isSynchronous entirely
```

### is_synchronous: "Yes"

```typescript
isSynchronous: true,
```

For synchronous flows, onExecution return controls the HTTP response:
```typescript
onExecution: async (context, params) => {
  return {
    data: { message: "Processed" },
    statusCode: 200,
    contentType: "application/json",
  };
},
```

---

## answer: endpoint_type → `integration.endpointType`

### endpoint_type: "flow_specific"

```typescript
// Default — omit endpointType from integration()
```

### endpoint_type: "instance_specific" or "shared_instance"

```typescript
export default integration({
  name: "My Integration",
  endpointType: "instance_specific",  // or "shared_instance"
  // ...
});
```

---

## answer: endpoint_security → `flow.endpointSecurityType`

### endpoint_security: "customer_optional"

```typescript
// Default — omit endpointSecurityType entirely
```

### Other values

```typescript
endpointSecurityType: "customer_required",  // or "unsecured" or "organization"
```

For "organization", also add API keys:
```typescript
endpointSecurityType: "organization",
organizationApiKeys: ["my-api-key"],
```

---

## answer: trigger_type → flow structure

### trigger_type: "webhook"

```typescript
export const myFlow = flow({
  name: "My Flow",
  stableKey: "my-flow",
  description: "Receives webhooks",
  // No schedule property, no onTrigger (default passes payload through)
  onExecution: async (context, params) => {
    // Access webhook payload — extract from trigger results
    const payload = params.onTrigger.results;
    const body = payload.body.data as unknown as MyType;
    // ... business logic
    return { data: null };
  },
});
```

### trigger_type: "scheduled"

Uses: `schedule_value`, `schedule_timezone`

Hardcoded schedule:
```typescript
export const myFlow = flow({
  name: "My Flow",
  stableKey: "my-flow",
  description: "Runs on schedule",
  schedule: {
    value: "*/5 * * * *",           // from schedule_value
    timezone: "America/Chicago",     // from schedule_timezone
  },
  // No onTrigger needed for scheduled flows
  onExecution: async (context, params) => {
    // ... business logic
    return { data: null };
  },
});
```

Customer-configurable schedule (when `schedule_value` is "configVar"):
```typescript
export const myFlow = flow({
  name: "My Flow",
  stableKey: "my-flow",
  description: "Runs on customer schedule",
  schedule: {
    configVar: "Schedule",           // references a schedule configVar
  },
  onExecution: async (context, params) => {
    return { data: null };
  },
});
```

### trigger_type: "polling"

Uses: `schedule_value`, `schedule_timezone`

```typescript
export const myFlow = flow({
  name: "My Flow",
  stableKey: "my-flow",
  description: "Polls for changes",
  triggerType: "polling",
  schedule: {
    value: "*/5 * * * *",
    timezone: "America/Chicago",
  },
  onTrigger: async (context, payload, params) => {
    const lastState = context.polling.getState();
    // ... check for changes since lastState
    context.polling.setState(newState);
    return { payload: { body: changes } };
  },
  onExecution: async (context, params) => {
    const changes = params.onTrigger.results.body;
    // ... process changes
    return { data: null };
  },
});
```

---

## When to Use Each Connection Strategy

| Strategy | When to use | Who manages auth | User sees |
|----------|-------------|-----------------|-----------|
| Organization-activated | Org owns one shared account (e.g., internal Slack workspace) | Org admin, once | Nothing — connection is invisible |
| Customer-activated | Each customer brings their own account (e.g., customer's Salesforce) | Each customer, per-instance | "Connect your Salesforce" button |
| Manifest-based (config page) | You provide OAuth app credentials, customer authorizes | Org provides app creds, customer authorizes | OAuth button on config page |
| No connection | Public API, webhook-only (source sends data to you) | N/A | Nothing |

**Common patterns:**
- Source is webhook → "No connection" (CRM pushes data to your endpoint)
- Destination is your internal tool → "Organization-activated" (you own the account)
- Destination is customer's tool → "Customer-activated" or "Manifest-based"
- Building a marketplace integration → "Manifest-based" (you register the OAuth app, customer authorizes)

---

## Connection Strategy

### Build-only connections CANNOT be used with `organizationActivatedConnection`

If the component search returns a connection with "build only" or "demo" in its description,
that connection is for local testing only. It CANNOT be referenced as a `scopedConfigVar` with
`organizationActivatedConnection({ stableKey: "..." })`.

**If the user says "use existing connection" but only build-only connections exist:**
Tell the user no production org-activated connections were found, and create the connection
directly on a config page using manifest helpers instead. Example:

```typescript
// WRONG — will fail on deploy with:
//   "Required Config Var 'X' cannot reference build-only connection container 'slack-demo'"
export const scopedConfigVars = {
  "Slack Connection": organizationActivatedConnection({ stableKey: "slack-demo" }),
};

// CORRECT — define the connection on a config page with manifest helpers
// Always include scopes — without them, the OAuth token has no API permissions
export const configPages = {
  "Slack Connection": configPage({
    elements: {
      "Slack Connection": slackOauth2("slack-connection", {
        clientId: {
          value: "",
          permissionAndVisibilityType: "organization",
          visibleToOrgDeployer: false,
        },
        clientSecret: {
          value: "",
          permissionAndVisibilityType: "organization",
          visibleToOrgDeployer: false,
        },
        signingSecret: {
          value: "",
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
};
```

### When `organizationActivatedConnection` IS valid

Only use it when the component search returns a connection that is NOT build-only:
- Has a real org-level stableKey
- Description does NOT say "build only" or "demo"

```typescript
import { integration, organizationActivatedConnection } from "@prismatic-io/spectral";

export const scopedConfigVars = {
  "Slack Connection": organizationActivatedConnection({
    stableKey: "slack-production",  // a real org-activated connection
  }),
};

export default integration({
  // ...
  scopedConfigVars,
});
```

---

## Config Pages (from destination_component + destination_connection_type answers)

### CRITICAL: Config page ordering rule

**Connections and data sources that depend on them MUST be on SEPARATE config pages.**
The connection page must come FIRST. Prismatic evaluates config pages sequentially —
the connection must be established before a data source can use it to fetch options.

```typescript
// WRONG — connection and data source on same page → deploy fails
export const configPages = {
  "Settings": configPage({
    elements: {
      "Slack Connection": slackOauth2("slack-connection", { ... }),
      "Slack Channel": slackSelectChannels("slack-channel", {
        connection: { configVar: "Slack Connection" },  // ERROR: not yet available
      }),
    },
  }),
};

// CORRECT — connection on page 1, data source on page 2
export const configPages = {
  "Slack Connection": configPage({
    elements: {
      "Slack Connection": slackOauth2("slack-connection", { ... }),
    },
  }),
  "Channel Settings": configPage({
    elements: {
      "Slack Channel": slackSelectChannels("slack-channel", {
        connection: { configVar: "Slack Connection" },  // Available from page 1
      }),
    },
  }),
};
```

### Using manifest helpers (preferred)

Always include `scopes` — without it, the OAuth token won't have the permissions needed for
actions like postMessage or selectChannels.

```typescript
import { configPage, configVar } from "@prismatic-io/spectral";
import { slackOauth2 } from "./manifests/slack/connections/oauth2";
import { slackSelectChannels } from "./manifests/slack/dataSources/selectChannels";

export const configPages = {
  "Slack Connection": configPage({
    elements: {
      "Slack Connection": slackOauth2("slack-connection", {
        clientId: {
          value: "",
          permissionAndVisibilityType: "organization",
          visibleToOrgDeployer: false,
        },
        clientSecret: {
          value: "",
          permissionAndVisibilityType: "organization",
          visibleToOrgDeployer: false,
        },
        signingSecret: {
          value: "",
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
  "Channel Settings": configPage({
    elements: {
      "Slack Channel": slackSelectChannels("slack-channel", {
        connection: { configVar: "Slack Connection" },
      }),
    },
  }),
};
```

### Simple config vars (no component)

```typescript
import { configPage, configVar } from "@prismatic-io/spectral";

export const configPages = {
  "Settings": configPage({
    elements: {
      "API Endpoint": configVar({
        stableKey: "api-endpoint",
        dataType: "string",
        description: "The base URL for the API",
        defaultValue: "https://api.example.com",
      }),
      "Enable Notifications": configVar({
        stableKey: "enable-notifications",
        dataType: "boolean",
        description: "Send notifications on success",
        defaultValue: "true",
      }),
    },
  }),
};
```

---

## Component Registry

```typescript
import { componentManifests } from "@prismatic-io/spectral";
import slack from "./manifests/slack";

export const componentRegistry = componentManifests({
  slack,
});
```

For multiple components:
```typescript
import slack from "./manifests/slack";
import salesforce from "./manifests/salesforce";

export const componentRegistry = componentManifests({
  slack,
  salesforce,
});
```

---

## index.ts

```typescript
import { integration } from "@prismatic-io/spectral";
import flows from "./flows";
import { configPages } from "./configPages";
import { componentRegistry } from "./componentRegistry";

const documentation = "";  // or import from documentation.md

export { configPages };
export { componentRegistry };

export default integration({
  name: "My Integration",
  description: "What it does",
  iconPath: "icon.png",
  documentation,
  flows,
  configPages,
  componentRegistry,
  // endpointType: "flow_specific",  // from endpoint_type answer (omit if default)
});
```

---

## Component Action Calls (in onExecution)

### Accessing config vars
```typescript
const connection = context.configVars["Slack Connection"];
const channel = context.configVars["Slack Channel"];
const apiKey = context.configVars["API Key"];
```

### Accessing connection fields
```typescript
const signingSecret = context.configVars["Slack Connection"].fields.signingSecret;
const accessToken = context.configVars["Slack Connection"].token?.access_token;
```

### Calling component actions (manifest import + .perform() pattern)

**Import actions from the manifest, then call `.perform()`**. This is the documented pattern.

```typescript
import slackActions from "../manifests/slack/actions";
import salesforceActions from "../manifests/salesforce/actions";

// Post a Slack message
const result = await slackActions.postMessage.perform({
  connection: context.configVars["Slack Connection"],
  channelName: util.types.toString(context.configVars["Select Slack Channel"]),
  message: "Hello world",
});

// Post a Slack block kit message
const blockResult = await slackActions.postBlockMessage.perform({
  connection: context.configVars["Slack Connection"],
  channelName: util.types.toString(context.configVars["Select Slack Channel"]),
  message: "Fallback text",
  blocks: JSON.stringify({ blocks: [...] }),
});

// Get a Salesforce record
const record = await salesforceActions.getRecord.perform({
  connection: context.configVars["Salesforce Connection"],
  recordId: notification.Id,
  recordType: notification.type,
});

// Result is typed as unknown — cast it
const data = (result as Record<string, unknown>)?.data;
```

---

## Multi-Flow Code Generation

When `flow_count` > 1, use a directory structure instead of a single `flows.ts` file.

### Directory structure

```
Single-flow:                Multi-flow:
src/                        src/
  flows.ts                    flows/
  configPages.ts                index.ts        ← barrel export
  componentRegistry.ts          orderSync.ts    ← one file per flow
  index.ts                      refundSync.ts
                                fulfillmentSync.ts
                              configPages.ts
                              componentRegistry.ts
                              index.ts
```

TypeScript resolves `import flows from "./flows"` to either pattern — no changes needed in `index.ts`.

### Per-flow file pattern

Each flow file in `src/flows/` follows the same structure as a single `flows.ts` but exports a named constant:

```typescript
// src/flows/orderSync.ts
import { flow } from "@prismatic-io/spectral";

export const orderSync = flow({
  name: "Order Sync",
  stableKey: "order-sync",
  description: "Syncs orders from Shopify to NetSuite",

  // errorConfig, retryConfig, etc. from per-flow answers

  onExecution: async (context, params) => {
    const payload = params.onTrigger.results;
    const body = payload.body.data as unknown as OrderPayload;
    // ... flow-specific business logic
    return { data: null };
  },
});
```

### Barrel export (`src/flows/index.ts`)

```typescript
import { orderSync } from "./orderSync";
import { refundSync } from "./refundSync";
import { fulfillmentSync } from "./fulfillmentSync";

export default [orderSync, refundSync, fulfillmentSync];
```

### Mixed trigger types in multi-flow

When flows have different trigger types (e.g., flow A is webhook, flow B is scheduled),
each flow file uses the pattern for its own trigger type. The barrel index.ts doesn't change.

Example: Order webhook + daily scheduled sync
- `src/flows/orderWebhook.ts` — no onTrigger, no schedule
- `src/flows/dailySync.ts` — has `schedule: { value: "0 6 * * *" }`, may have onTrigger for polling
- `src/flows/index.ts` — exports both in the array

### Test data for multi-flow

```json
{
  "flows": {
    "order-sync": {
      "payload": "test-data/order-payload.json"
    },
    "refund-sync": {
      "payload": "test-data/refund-payload.json"
    }
  }
}
```

### Reading per-flow answers

Per-flow answers are stored under `answers.flows[flowId]`. When generating code for each flow,
merge integration-level answers with the flow's answers:

```
Integration answers: { systems, source_system, destination_system, ... }
Flow answers:        answers.flows["order-sync"] = { trigger_type, error_handler_type, ... }
```

The flow's `trigger_type`, `error_handler_type`, `is_synchronous`, etc. determine the flow's
code structure (schedule vs webhook, errorConfig, retryConfig, queueConfig).

---

## answer: organization_api_keys → `flow.organizationApiKeys`

When `endpoint_security` is "organization":

```typescript
export const myFlow = flow({
  name: "My Flow",
  stableKey: "my-flow",
  endpointSecurityType: "organization",
  organizationApiKeys: ["my-first-key", "p@s$W0Rd"],  // from organization_api_keys (comma-split)
  onExecution: async (context, params) => {
    return { data: null };
  },
});
```

**Platform REJECTS flows with organization security and empty API keys at publish.**

---

## answer: preprocess_flow_routing → routing configuration

### header_field or body_field (triggerPreprocessFlowConfig on integration)

Uses: `routing_flow_name_field`, `routing_external_customer_id_field`

```typescript
// instance_specific
export default integration({
  name: "My Integration",
  endpointType: "instance_specific",
  triggerPreprocessFlowConfig: {
    flowNameField: "headers.x-acme-flow",   // from routing_flow_name_field
  },
  flows,
  configPages,
  componentRegistry,
});

// shared_instance — must include externalCustomerIdField
export default integration({
  name: "My Integration",
  endpointType: "shared_instance",
  triggerPreprocessFlowConfig: {
    flowNameField: "headers.x-acme-flow",
    externalCustomerIdField: "body.data.acmeAccountId",  // from routing_external_customer_id_field
  },
  flows,
  configPages,
  componentRegistry,
});
```

### preprocess_flow (preprocessFlowConfig on a flow)

One flow acts as the router. It returns field values that map to sibling flow names.

```typescript
export const preprocessFlow = flow({
  name: "Route Requests",
  stableKey: "route-requests",
  preprocessFlowConfig: {
    flowNameField: "myFlowName",                  // field in return data
    externalCustomerIdField: "myCustomerId",      // for shared_instance
  },
  onExecution: async (context, params) => {
    const { event, acctId } = params.onTrigger.results.body.data as unknown as Payload;
    return {
      data: {
        myFlowName: flowMapper[event],            // maps to sibling flow name
        myCustomerId: customerIdFromApi,           // maps to Prismatic customer ID
      },
    };
  },
});
```

---

## answer: needs_deploy_hooks → lifecycle hooks

### Pass-through onTrigger (required for ALL flows with lifecycle hooks)

Spectral's build validation requires `onTrigger` whenever a flow has lifecycle hooks
(`onInstanceDeploy`, `onInstanceDelete`, or `webhookLifecycleHandlers`). Without it,
the build fails with "Invalid trigger configuration detected." Use this simple pass-through:

```typescript
onTrigger: async (_context, payload) => ({ payload }),
```

For webhook flows without lifecycle hooks, skip `onTrigger` — the default trigger handles it.

### onInstanceDeploy / onInstanceDelete (general lifecycle)

Use for resource setup, state initialization, or non-webhook deploy tasks.

```typescript
export const myFlow = flow({
  name: "My Flow",
  stableKey: "my-flow",
  onTrigger: async (_context, payload) => ({ payload }), // required with lifecycle hooks
  onInstanceDeploy: async (context, params) => {
    context.logger.info(`Deploying instance ${context.instance.id}`);
    // Create resources, initialize state, etc.
    // context.webhookUrls[context.flow.name] gives this flow's webhook URL
    // Use crossFlowState — instanceState is NOT available here
  },
  onInstanceDelete: async (context, params) => {
    context.logger.info(`Deleting instance ${context.instance.id}`);
    // Clean up resources — log errors instead of throwing (allow deletion to proceed)
  },
  onExecution: async (context, params) => {
    const payload = params.onTrigger.results;
    return { data: null };
  },
});
```

### webhookLifecycleHandlers (auto-register/deregister webhooks)

Use when the source system supports programmatic webhook management. Preferred over
`onInstanceDeploy` for webhook registration because:
- `.create` runs AFTER `onInstanceDeploy` (guaranteed webhookUrls access)
- `.delete` runs on deletion AND when exiting listening mode (cleanup during testing too)

```typescript
export const myFlow = flow({
  name: "Webhook Flow",
  stableKey: "webhook-flow",
  onTrigger: async (_context, payload) => ({ payload }), // required with lifecycle hooks
  webhookLifecycleHandlers: {
    create: async (context) => {
      const webhookUrl = context.webhookUrls[context.flow.name];
      const result = await externalApi.registerWebhook(webhookUrl, ["orders/create"]);
      context.crossFlowState["webhookId"] = result.id;
    },
    delete: async (context) => {
      const webhookId = context.crossFlowState["webhookId"] as string;
      if (webhookId) {
        await externalApi.deleteWebhook(webhookId).catch((e) => {
          context.logger.warn(`Webhook cleanup failed: ${e.message}`);
        });
      }
    },
  },
  onExecution: async (context, params) => {
    const payload = params.onTrigger.results;
    const body = payload.body.data as unknown as WebhookPayload;
    return { data: null };
  },
});
```

If the source system's component has a trigger with built-in lifecycle functions
(e.g., Shopify's `eventTopicWebhookGql`), use that as `onTrigger` instead — it
auto-registers/deregisters webhooks without any manual lifecycle code.

---

## answer: needs_state_management → state usage

### instanceState (per-flow, per-instance)

```typescript
onExecution: async (context, params) => {
  const lastRun = context.instanceState["lastRun"] as string | undefined;
  context.logger.info(lastRun ? `Last run: ${lastRun}` : "First run");

  // ... business logic

  context.instanceState["lastRun"] = new Date().toISOString();
  return { data: null };
},
```

### crossFlowState (shared across flows in instance)

```typescript
onExecution: async (context, params) => {
  const webhookId = context.crossFlowState[`${context.flow.id}-webhook-id`];
  // ... use shared state
  return { data: null };
},
```

### integrationState (shared across ALL instances)

```typescript
onExecution: async (context, params) => {
  const counter = (context.integrationState["processedCount"] as number) ?? 0;
  context.integrationState["processedCount"] = counter + 1;
  return { data: null };
},
```

**Constraints:** 64 MB combined size. State written in entirety (race risk). Failed executions don't save state.

---

## Connection Strategy Code Paths

### Organization-activated connection → scopedConfigVars

```typescript
import { integration, organizationActivatedConnection } from "@prismatic-io/spectral";

export const scopedConfigVars = {
  "Slack Connection": organizationActivatedConnection({
    stableKey: "slack-production",
  }),
};

export default integration({
  // ...
  scopedConfigVars,
});
```

### Customer-activated connection → configPages

```typescript
import { configPage, customerActivatedConnection } from "@prismatic-io/spectral";

export const configPages = {
  Connections: configPage({
    elements: {
      "Salesforce Connection": customerActivatedConnection({
        stableKey: "acme-sfdc-connection",
      }),
    },
  }),
};
```

### Manifest-based connection → configPages with helpers

```typescript
import { configPage } from "@prismatic-io/spectral";
import { slackOauth2 } from "./manifests/slack/connections/oauth2";

export const configPages = {
  "Slack Connection": configPage({
    elements: {
      "Slack Connection": slackOauth2("slack-connection", {
        clientId: {
          value: "YOUR_CLIENT_ID",
          permissionAndVisibilityType: "organization",
          visibleToOrgDeployer: false,
        },
        clientSecret: {
          value: "YOUR_CLIENT_SECRET",
          permissionAndVisibilityType: "organization",
          visibleToOrgDeployer: false,
        },
      }),
    },
  }),
};
```

### Config var permissionAndVisibilityType

```typescript
"My Config Var": configVar({
  stableKey: "my-config-var",
  dataType: "string",
  permissionAndVisibilityType: "organization",  // "customer" | "embedded" | "organization"
  visibleToOrgDeployer: false,                   // hide from org users in UI
}),
```

---

## Test Data

### test-data/trigger-config.json (for webhook flows)
```json
{
  "flows": {
    "deal-closed-notification": {
      "payload": "test-data/sample-payload.json"
    }
  }
}
```

### test-data/sample-payload.json
```json
{
  "dealName": "Acme Corp Enterprise License",
  "amount": 50000,
  "salesRep": "Jane Smith"
}
```
