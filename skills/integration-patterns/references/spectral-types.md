# Spectral SDK Type Reference

Source of truth for code generation. These types come from `@prismatic-io/spectral/dist/types/`.

**When the YAML spec and these types disagree, the types win.**

## IntegrationDefinition

```typescript
type IntegrationDefinition = {
  name: string;
  description?: string;
  iconPath?: string;
  category?: string;
  documentation?: string;
  version?: string;
  labels?: string[];
  endpointType?: EndpointType;                        // default: "flow_specific"
  triggerPreprocessFlowConfig?: PreprocessFlowConfig;  // only when endpointType != "flow_specific"
  flows: Flow[];
  configPages?: ConfigPages;
  userLevelConfigPages?: UserLevelConfigPages;         // per-user config (separate from instance config)
  scopedConfigVars?: ScopedConfigVarMap;               // org-activated connections go HERE, not in configPages
  instanceProfile?: string;                            // memory/resource allocation
  componentRegistry?: ComponentRegistry;
};
```

## Flow (FlowBase)

Every flow has these properties. In CNI, `onExecution` is the single "step" — there are no sub-steps.

```typescript
interface FlowBase {
  name: string;
  stableKey: string;                                    // REQUIRED — unchanging identity
  description?: string;
  isSynchronous?: boolean;                              // default: false. 29s timeout if true.
  isAgentFlow?: boolean;                                // AI agent flow on integrations MCP server
  endpointSecurityType?: EndpointSecurityType;          // default: "customer_optional"
  organizationApiKeys?: string[];                       // required when endpointSecurityType = "organization"
  testApiKeys?: string[];                               // test API keys (alongside organizationApiKeys)
  errorConfig?: StepErrorConfig;                        // immediate retry (seconds)
  retryConfig?: RetryConfig;                            // delayed retry (minutes) — async only
  queueConfig?: QueueConfig;                            // concurrency control
  preprocessFlowConfig?: PreprocessFlowConfig;          // only one flow per integration
  schemas?: { invoke: FlowDefinitionFlowSchema; ... };  // AI agent schemas

  // Lifecycle hooks
  onInstanceDeploy?: TriggerEventFunction;              // runs on every deploy/redeploy, 30s limit
  onInstanceDelete?: TriggerEventFunction;              // runs on deletion, 30s limit
  webhookLifecycleHandlers?: {
    create: TriggerEventFunction;                       // runs after onInstanceDeploy
    delete: TriggerEventFunction;                       // runs on deletion
  };

  // Core execution
  onExecution: FlowOnExecution;                         // REQUIRED — the integration logic
}
```

### StandardFlow (webhook + scheduled)

```typescript
interface StandardFlow extends FlowBase {
  triggerType?: "standard";                             // default
  schedule?: { value: string; timezone?: string } | { configVar: string };
  onTrigger?: TriggerReference | TriggerPerformFunction;  // optional — default passes payload through
}
```

### PollingFlow

```typescript
interface PollingFlow extends FlowBase {
  triggerType: "polling";                               // REQUIRED
  schedule:                                             // REQUIRED for polling
    | { value: string; timezone?: string }
    | { configVar: string; timezone?: string };
  onTrigger: PollingTriggerPerformFunction;             // REQUIRED — has context.polling.getState/setState
}
```

## StepErrorConfig (flow.errorConfig)

Controls what happens when `onExecution` throws. Despite the name "Step", in CNI this applies to the entire flow — a CNI flow IS one step.

```typescript
type StepErrorConfig = {
  errorHandlerType: StepErrorHandlerType;   // "fail" | "ignore" | "retry"
  maxAttempts?: number;                     // 0-5
  delaySeconds?: number;                    // 0-60
  usesExponentialBackoff?: boolean;         // default: false
  ignoreFinalError?: boolean;               // default: false
};

type StepErrorHandlerType = "fail" | "ignore" | "retry";
```

## RetryConfig (flow.retryConfig)

Re-invokes the entire flow with the original payload. Async flows only.

```typescript
type RetryConfig = {
  maxAttempts: number;                      // 0-10 — REQUIRED
  delayMinutes: number;                     // 0-60 — REQUIRED
  usesExponentialBackoff: boolean;          // REQUIRED (not optional like errorConfig)
  uniqueRequestIdField?: string;            // cancellation: newer request with same ID cancels pending
};
```

**Key difference from errorConfig:** All fields except `uniqueRequestIdField` are **required** (not optional).

## QueueConfig (flow.queueConfig)

The SDK defines four variants (discriminated union + legacy flat). The **flat shape is recommended**
because it matches the official docs and platform backend:

```typescript
// RECOMMENDED — flat shape (matches docs and platform backend)
type StandardQueueConfig = {
  usesFifoQueue?: boolean;                  // FIFO ordering — async non-scheduled flows only
  dedupeIdField?: string;                   // trigger payload field for deduplication
  singletonExecutions?: boolean;            // only for scheduled/polling flows — prevents overlapping
  concurrencyLimit?: number;                // 2-15 (requires configurable-flow-concurrency feature flag)
};

// SDK also accepts discriminated union variants (newer, not yet in docs):
type ParallelQueueConfig = { type: "parallel" };
type ThrottledQueueConfig = { type: "throttled"; concurrencyLimit?: number; dedupeIdField?: string };
type SequentialQueueConfig = { type: "sequential"; dedupeIdField?: string };

type QueueConfig = ParallelQueueConfig | ThrottledQueueConfig | SequentialQueueConfig | StandardQueueConfig;
```

**Platform constraints** (enforced at deploy, not by SDK types):
- `usesFifoQueue: true` is only valid for async, non-scheduled webhook flows
- `singletonExecutions: true` is only valid for scheduled/polling flows
- `concurrencyLimit > 1` requires the `configurable-flow-concurrency` feature flag on the org
- FIFO queue requires the `enable-fifo-queue` feature flag
- If feature flags are off, queueConfig is silently ignored during import

## EndpointType & Security

```typescript
type EndpointType = "flow_specific" | "instance_specific" | "shared_instance";

type EndpointSecurityType = "unsecured" | "customer_optional" | "customer_required" | "organization";
```

## PreprocessFlowConfig

Used for routing when `endpointType` is not `"flow_specific"`.

```typescript
type PreprocessFlowConfig = {
  flowNameField: string;                    // field in payload that identifies target flow
  externalCustomerIdField?: string;         // required for shared_instance
  externalCustomerUserIdField?: string;     // optional: identifies specific user
};
```

## ConfigVar Types

```typescript
type ConfigVarDataType =
  | "string" | "date" | "timestamp" | "picklist" | "code"
  | "boolean" | "number" | "schedule"
  | "objectSelection" | "objectFieldMap" | "jsonForm"
  | "htmlElement";

type CollectionType = "valuelist" | "keyvaluelist";

type PermissionAndVisibilityType = "customer" | "embedded" | "organization";
```

### Config variable categories

| Category | Created with | Notes |
|----------|-------------|-------|
| Standard | `configVar()` | string, boolean, number, schedule, picklist, code, date, timestamp, htmlElement |
| Connection (inline) | `connectionConfigVar()` | OAuth, API key, basic auth — defined on configPage |
| Connection (reference) | manifest helpers (e.g., `slackOauth2()`) | Uses component registry connection, on configPage |
| Data source (inline) | `dataSourceConfigVar()` | Custom perform function |
| Data source (reference) | manifest helpers (e.g., `slackSelectChannels()`) | Uses component registry data source |
| Org-activated connection | `organizationActivatedConnection()` | Goes in `scopedConfigVars`, NOT configPages |
| Customer-activated connection | `customerActivatedConnection()` | Goes in `configPages` as an element |

### Data source reset (for jsonForm data sources)

```typescript
type DataSourceReset = {
  mode: "prompt" | "always";
  dependencies?: string[];                  // config var names that trigger reset
};
```

## State Management

Available via `context` in onExecution:

| State | Scope | Persists? | Available in lifecycle hooks? |
|-------|-------|-----------|-------------------------------|
| `context.executionState` | Single execution | No | No |
| `context.instanceState` | One flow, one instance | Yes | **No** — use crossFlowState |
| `context.crossFlowState` | All flows, one instance | Yes | Yes |
| `context.integrationState` | All instances | Yes | Yes |

**Constraints:**
- Combined size limit: 64 MB
- State is written in its entirety, not key-by-key (race condition risk)
- Failed executions do NOT save state
- `instanceState` is NOT available in `onInstanceDeploy`/`onInstanceDelete`

## Synchronous Flow Response

When `isSynchronous: true`, `onExecution` return value shapes the HTTP response:

```typescript
return {
  data: { message: "Processed" },
  statusCode: 200,
  contentType: "application/json",
  headers: { "X-Custom-Header": "foo" },
};
```

- 29-second timeout (AWS API Gateway)
- 500MB max response
- Responses >5MB return HTTP 303 redirect to S3 URL
