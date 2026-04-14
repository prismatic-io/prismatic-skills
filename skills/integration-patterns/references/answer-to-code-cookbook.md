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
| Customer-activated | Each customer brings their own account (e.g., customer's Salesforce) | Each customer, per-instance | "Authorize" button in config wizard |
| Org-activated | Org owns the account (e.g., internal Slack workspace, shared API key) | Org admin | Nothing — connection is invisible to customers |
| No connection | Public API, webhook-only (source sends data to you) | N/A | Nothing |

**Common patterns:**
- Source is webhook → "No connection" (CRM pushes data to your endpoint)
- Destination is your internal tool → "Org-activated" (you own the account)
- Destination is customer's tool → "Customer-activated"

**Code pattern is automatic — the agent does not ask about this.**
During code gen, the pattern depends on context:
- Component manifest exists + customer_activated → `customerActivatedConnection()` if SCV exists, or manifest helper (e.g., `slackOauth2()`) if creating inline
- Component manifest exists + org_activated → `organizationActivatedConnection()` in scopedConfigVars
- No component manifest → `connectionConfigVar()` with inline inputs on configPages

---

## Connection Strategy Code Paths

The `code-plan` output includes a `<connection-patterns>` block that tells you exactly which
code pattern to use for each connector. Follow it — do not guess.

### Pattern 1: `customerActivatedConnection()` — SCV exists

Use when strategy is `customer_activated` AND a reusable SCV was found or created.
The SCV is a prerequisite — `customerActivatedConnection()` is purely a reference by stableKey.

```typescript
// configPages.ts
import { configPage, customerActivatedConnection } from "@prismatic-io/spectral";

export const configPages = {
  Connections: configPage({
    elements: {
      "Salesforce Connection": customerActivatedConnection({
        stableKey: "acme-sfdc-connection",  // must match an existing SCV in the org
      }),
    },
  }),
};
```

### Pattern 2: Manifest helper — No SCV, component manifest exists

Use when strategy is `customer_activated` AND no SCV exists AND a component manifest is available.
The manifest generates a helper function (e.g., `slackOauth2()`) that creates an integration-specific
connection via `connectionConfigVar()` under the hood.

```typescript
// configPages.ts
import { configPage } from "@prismatic-io/spectral";
import { slackOauth2 } from "./manifests/slack/connections/oauth2";

export const configPages = {
  Connections: configPage({
    elements: {
      "Slack Connection": slackOauth2("my-slack-connection", {
        clientId: {
          value: "",  // org provides via Prismatic admin post-deploy
          permissionAndVisibilityType: "organization",
          visibleToOrgDeployer: false,
        },
        clientSecret: {
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

The first argument is the stableKey. Each input can set `permissionAndVisibilityType`:
- `"organization"` — org provides, hidden from customer
- `"customer"` — customer provides during instance setup
- `"embedded"` — set programmatically, hidden from everyone

For OAuth: org provides clientId/clientSecret (organization), customer completes the OAuth flow.

### Pattern 3: `connectionConfigVar()` — No SCV, no component manifest

Use when strategy is `customer_activated` AND no SCV exists AND no component manifest
(direct HTTP integration). Define the connection inputs inline.

```typescript
// configPages.ts
import { configPage, connectionConfigVar, OAuth2Type } from "@prismatic-io/spectral";

export const configPages = {
  Connections: configPage({
    elements: {
      "API Connection": connectionConfigVar({
        stableKey: "api-connection",
        dataType: "connection",
        oauth2Type: OAuth2Type.AuthorizationCode,
        inputs: {
          authorizeUrl: { label: "Authorize URL", default: "https://api.example.com/oauth/authorize", type: "string", shown: false },
          tokenUrl: { label: "Token URL", default: "https://api.example.com/oauth/token", type: "string", shown: false },
          clientId: { label: "Client ID", type: "string", shown: false, default: process.env.CLIENT_ID },
          clientSecret: { label: "Client Secret", type: "password", shown: false, default: process.env.CLIENT_SECRET },
          scopes: { label: "Scopes", type: "string", shown: false, default: "read write" },
        },
      }),
    },
  }),
};
```

### Pattern 4: `organizationActivatedConnection()` — Org-managed

Use when strategy is `org_activated` AND a real (non-build-only) SCV exists.
Goes in `scopedConfigVars` on the integration definition — NOT on configPages.
The customer never sees this connection.

```typescript
// index.ts
import { integration, organizationActivatedConnection } from "@prismatic-io/spectral";

export const scopedConfigVars = {
  "Internal API Key": organizationActivatedConnection({
    stableKey: "internal-api-key",  // must match a real org-activated SCV
  }),
};

export default integration({
  name: "My Integration",
  // ...
  scopedConfigVars,
});
```

Access in onExecution — scopedConfigVars are merged into `context.configVars` at runtime
but not in the ConfigVars type. Use a typed cast:
```typescript
const conn = context.configVars["Internal API Key"] as unknown as {
  fields: Record<string, string>;
  token?: { access_token: string };
};
```

### Build-only connections

Build-only connections (`managedBy: "SYSTEM"`) are platform-provided OAuth apps for development.
They CANNOT be referenced by `organizationActivatedConnection()` or `customerActivatedConnection()`.
Deploy will fail with: "Required Config Var 'X' cannot reference build-only connection container"

If only build-only connections exist and the user chose org_activated, the agent should have
warned during requirements and suggested customer_activated instead.

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

### Accessing config vars (configPages connections)
```typescript
// Connections defined in configPages are fully typed
const connection = context.configVars["Slack Connection"];
const channel = context.configVars["Slack Channel"];
const apiKey = context.configVars["API Key"];
```

### Accessing org-activated connections (scopedConfigVars)
```typescript
// Org-activated connections are in scopedConfigVars on the integration definition.
// They're available at runtime via context.configVars but NOT in the ConfigVars type
// (which only covers configPages). Use a typed cast:
const slackConnection = context.configVars["Slack Connection"] as unknown as {
  fields: Record<string, string>;
  token?: { access_token: string };
};
// Then access fields normally:
const token = slackConnection.token?.access_token;
```

### Accessing connection fields
```typescript
// For configPages connections (customer-activated):
const signingSecret = context.configVars["Slack Connection"].fields.signingSecret;
const accessToken = context.configVars["Slack Connection"].token?.access_token;

// For org-activated connections (scopedConfigVars) — use the cast pattern above.
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

## Config Page Constraints

### All connections must be on the first config page

Prismatic requires all connection config vars (customer-activated connections using manifest helpers
like `sftpBasic()`, `slackOauth2()`) to appear on the FIRST config page. If connections are split
across multiple pages, deployment fails with:
"Required Config Var 'X' must appear on the first Configuration Page"

```typescript
// WRONG — connections split across pages → deploy fails
export const configPages = {
  "SFTP": configPage({
    elements: { "SFTP": sftpBasic("sftp-conn", { ... }) },
  }),
  "MySQL": configPage({
    elements: { "MySQL": mysqlMySql("mysql-conn", { ... }) },  // ERROR: not on first page
  }),
};

// CORRECT — all connections on page 1
export const configPages = {
  Connections: configPage({
    tagline: "Connect your SFTP server and MySQL database",
    elements: {
      "SFTP Connection": sftpBasic("sftp-conn", { ... }),
      "MySQL Connection": mysqlMySql("mysql-conn", { ... }),
    },
  }),
  "File Settings": configPage({
    elements: { ... },  // non-connection config vars on later pages
  }),
};
```

This is separate from the data source ordering rule (data sources must be on a LATER page than
the connection they depend on). Combined: connections on page 1, data sources on page 2+.

---

## Type Casting in perform Functions

### Config var values are `unknown` — cast before using

In `dataSourceConfigVar` perform functions and flow `onExecution`, config var values
from `context.configVars` are typed as `unknown`. Cast them before passing to component actions:

```typescript
import type { Connection } from "@prismatic-io/spectral";

// In a dataSourceConfigVar perform function:
perform: async (context) => {
  const conn = context.configVars["SFTP Connection"] as unknown as Connection;
  // Now safe to pass to component actions
  const result = await sftpActions.listDirectory.perform({
    connection: conn,
    path: "/",
  });
  // ...
},

// In onExecution:
onExecution: async (context, params) => {
  const sftpConn = context.configVars["SFTP Connection"] as unknown as Connection;
  const csvDir = context.configVars["CSV Directory"] as unknown as string;
  // ...
},
```

The double cast `as unknown as Connection` is required because TypeScript won't directly
cast `unknown` to `Connection` — it needs the intermediate `unknown` step.

---

## Polling Flow Requirements

### triggerType: "polling" is REQUIRED

Polling flows MUST set `triggerType: "polling"` on the flow definition. Without it, the flow
is treated as a standard scheduled flow and `context.polling` is not available.

```typescript
// WRONG — missing triggerType, no context.polling available
export const myFlow = flow({
  name: "Poll for Changes",
  schedule: { value: "*/5 * * * *" },
  onTrigger: async (context, payload) => {
    // context.polling is undefined here!
    const state = context.polling.getState();  // ERROR
  },
  onExecution: async (context, params) => { ... },
});

// CORRECT — triggerType: "polling" enables context.polling
export const myFlow = flow({
  name: "Poll for Changes",
  triggerType: "polling",  // REQUIRED
  schedule: { value: "*/5 * * * *" },
  onTrigger: async (context, payload) => {
    const lastRun = await context.polling.getState();
    // ... fetch changes since lastRun ...
    await context.polling.setState(newCursor);
    return { payload: { body: { data: newRecords } } };
  },
  onExecution: async (context, params) => { ... },
});
```

### context.polling is runtime-only

`context.polling` is available at runtime but NOT reflected in Spectral's TypeScript types
for the `onTrigger` function. The type signature shows a generic context without `.polling`.
Use `(context as any).polling` or define a local interface if you need type safety.

### Polling trigger return value

When no new data exists, return `{ payload, polledNoChanges: true }` to skip onExecution:

```typescript
onTrigger: async (context, payload) => {
  const lastTimestamp = await context.polling.getState();
  const records = await fetchRecordsSince(lastTimestamp);
  if (records.length === 0) {
    return { payload, polledNoChanges: true };  // skips onExecution
  }
  await context.polling.setState(records[records.length - 1].updatedAt);
  return { payload: { body: { data: records } } };
},
```

---

## Accessing Trigger Results in onExecution (Polling Flows)

In polling flows, the onTrigger constructs the payload. Access it in onExecution via
`params.onTrigger.results`:

```typescript
onExecution: async (context, params) => {
  // For polling flows, YOU built this payload in onTrigger
  const triggerData = params.onTrigger.results.body.data as unknown as Record<string, unknown>;

  // For webhook flows, the external system sent this payload
  const webhookData = params.onTrigger.results.body.data as unknown as MyPayloadType;

  // Both use the same path — the difference is who constructed the data
},
```

The double cast `as unknown as MyType` is needed because `params.onTrigger.results` is
loosely typed. See the "Cast patterns" section in the code generation checklist.

---

## Custom Inline Data Sources (Picklist Dropdowns)

When a component doesn't provide a data source for something you need (e.g., SFTP directory listing),
create a custom inline data source using `dataSourceConfigVar` with a `perform` function.

### Pattern: Custom picklist backed by a connection

```typescript
import { configPage, configVar, dataSourceConfigVar, type Element } from "@prismatic-io/spectral";
import { sftpBasic } from "./manifests/sftp/connections/basic";

export const configPages = {
  // Page 1: Connection (must come FIRST)
  "SFTP Connection": configPage({
    elements: {
      "SFTP Connection": sftpBasic("sftp-connection", {
        host: { value: "" },
        username: { value: "" },
        password: { value: "" },
        port: { value: "22" },
      }),
    },
  }),
  // Page 2: Data source that uses the connection (must be AFTER connection page)
  "File Settings": configPage({
    elements: {
      "CSV Directory": dataSourceConfigVar({
        stableKey: "csv-directory-picker",
        dataSourceType: "picklist",
        perform: async (context) => {
          // Access the connection from a previous config page
          const sftpConnection = context.configVars["SFTP Connection"];
          // Use component actions to list directories
          const sftpActions = await import("./manifests/sftp/actions");
          const result = await sftpActions.default.listDirectory.perform({
            connection: sftpConnection,
            path: "/",
            includeDirectories: true,
          });
          // Transform to picklist format
          const dirs = (result.data as string[])
            .filter(name => !name.includes("."))  // simple dir filter
            .map<Element>(dir => ({ key: dir, label: dir }));
          return { result: dirs };
        },
      }),
    },
  }),
};
```

Key rules:
- Connection page MUST come before data source page (Prismatic evaluates sequentially)
- `perform` receives `context.configVars` with all previously-configured values
- Return `{ result: Element[] }` where each Element has `key` and `label`
- Import component actions dynamically if needed for API calls

## Using npm Packages in CNI Flows

CNI flows can use any npm package. Install with `npm install --prefix <project-dir> <package>`.
Common packages for data processing:

- **papaparse** — CSV parsing with streaming support
- **ssh2-sftp-client** — Direct SFTP access with streaming (when component actions load full files into memory)
- **axios** — already included via Spectral SDK

### Pattern: Streaming large files with papaparse

When processing large CSV files, avoid loading the entire file into memory. Use `ssh2-sftp-client`
for streaming reads and `papaparse` for streaming CSV parsing:

```typescript
import { flow } from "@prismatic-io/spectral";
import SftpClient from "ssh2-sftp-client";
import Papa from "papaparse";
import { Readable } from "node:stream";

export const processLargeCSV = flow({
  name: "Process Large CSV",
  stableKey: "process-large-csv",
  description: "Streams CSV from SFTP and processes records in batches",

  onExecution: async (context, params) => {
    const conn = context.configVars["SFTP Connection"];

    // Create direct SFTP client from connection credentials
    const sftp = new SftpClient();
    await sftp.connect({
      host: conn.fields.host as string,
      port: Number(conn.fields.port ?? 22),
      username: conn.fields.username as string,
      password: conn.fields.password as string,
    });

    try {
      const filePath = context.configVars["CSV Directory"] as string;
      // Get a readable stream — file is NOT loaded into memory
      const stream = sftp.createReadStream(filePath) as unknown as Readable;

      const batch: Record<string, string>[] = [];
      const BATCH_SIZE = 100;
      let totalRecords = 0;

      await new Promise<void>((resolve, reject) => {
        Papa.parse(stream, {
          header: true,
          skipEmptyLines: true,
          step: async (result) => {
            batch.push(result.data as Record<string, string>);
            if (batch.length >= BATCH_SIZE) {
              // Flush batch to MySQL
              await insertBatch(context, batch.splice(0));
              totalRecords += BATCH_SIZE;
            }
          },
          complete: async () => {
            if (batch.length > 0) {
              await insertBatch(context, batch);
              totalRecords += batch.length;
            }
            resolve();
          },
          error: (err: Error) => reject(err),
        });
      });

      // Delete processed file
      await sftp.delete(filePath);

      return { data: { totalRecords } };
    } finally {
      await sftp.end();
    }
  },
});
```

Key points:
- Use `ssh2-sftp-client` for streaming (the SFTP component's readFile loads everything into memory)
- `Papa.parse(stream, { step })` processes one row at a time — constant memory regardless of file size
- Batch inserts every N records to balance throughput and memory
- Always `sftp.end()` in a finally block
- The component's connection credentials are in `conn.fields.*`

### MySQL bulk insert with doubly-wrapped array

The MySQL component's query action supports bulk insert with a special parameter format:

```typescript
import mysqlActions from "./manifests/mysql/actions";

async function insertBatch(
  context: { configVars: Record<string, unknown> },
  records: Record<string, string>[]
) {
  const mysqlConn = context.configVars["MySQL Connection"];
  const placeholders = records.map(() => "(?, ?, ?)").join(", ");
  const query = `INSERT INTO people (name, address, phone) VALUES ${placeholders}`;
  const params = records.flatMap(r => [
    `${r.firstName} ${r.lastName}`.trim(),
    r.address,
    r.phone,
  ]);

  await mysqlActions.query.perform({
    mySQLConnection: mysqlConn,
    queryField: query,
    referenceParams: JSON.stringify(params),
  });
}
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
