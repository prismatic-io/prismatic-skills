# Code Anti-Patterns

Common mistakes in generated integration code. Each pattern shows what goes wrong, why it fails, and the correct approach.

---

## Config Pages

<anti-pattern name="raw-config-objects">
<wrong>
```typescript
configPages: [
  {
    name: "Configuration",
    elements: [
      { key: "apiUrl", dataType: "string" },
      { key: "shopifyConnection", dataType: "connection" },
    ],
  },
],
```
</wrong>
<why>Plain objects are not valid ConfigPage elements. The platform rejects them at deploy time with type errors or silent misconfiguration. Wrapper functions add required metadata and type safety.</why>
<right>
```typescript
configPages: [
  {
    name: "Configuration",
    elements: [
      configVar("apiUrl", { dataType: "string", stableKey: "api-url" }),
      connectionConfigVar("shopifyConnection", "Shopify Connection", shopifyManifest.connections.shopifyOAuth),
      dataSourceConfigVar("customerId", "Customer", shopifyManifest.dataSources.selectCustomer),
    ],
  },
],
```
</right>
</anti-pattern>

<anti-pattern name="connection-constructor-on-config-page">
<wrong>
```typescript
elements: [
  connection({ key: "slack", label: "Slack" }),
]
```
</wrong>
<why>Config pages use `connectionConfigVar()` to reference a connection defined in a component manifest — not the `connection()` constructor, which defines a new connection type. Using the wrong function causes deploy failures.</why>
<right>
```typescript
elements: [
  connectionConfigVar("slackConnection", "Slack Connection", slackManifest.connections.slackOAuth),
]
```
</right>
</anti-pattern>

---

## Flow Callbacks

<anti-pattern name="instanceState-in-lifecycle">
<wrong>
```typescript
onInstanceDeploy: async (context) => {
  context.instanceState["webhookId"] = webhookId;
}
```
</wrong>
<why>`instanceState` is not available in lifecycle hooks. The platform throws a runtime error. Use `crossFlowState` instead — it's the only state store accessible during deploy/delete.</why>
<right>
```typescript
onInstanceDeploy: async (context) => {
  context.crossFlowState["webhookId"] = webhookId;
}
```
</right>
</anti-pattern>

<anti-pattern name="missing-onTrigger-passthrough">
<wrong>
```typescript
flow({
  name: "Order Sync",
  onInstanceDeploy: async (context) => { /* register webhook */ },
  onInstanceDelete: async (context) => { /* deregister webhook */ },
  onExecution: async (context, params) => {
    const payload = params.onTrigger.results;
    // ...
  },
})
```
</wrong>
<why>When a flow has lifecycle hooks (onInstanceDeploy/onInstanceDelete), the platform requires an explicit `onTrigger` callback. Without it, the webhook payload is not forwarded to `onExecution` — `params.onTrigger.results` is empty.</why>
<right>
```typescript
flow({
  name: "Order Sync",
  onTrigger: async (_context, payload) => ({ payload }),
  onInstanceDeploy: async (context) => { /* register webhook */ },
  onInstanceDelete: async (context) => { /* deregister webhook */ },
  onExecution: async (context, params) => {
    const payload = params.onTrigger.results;
    // ...
  },
})
```
</right>
</anti-pattern>

<anti-pattern name="typed-flow-generics">
<wrong>
```typescript
flow<{ trigger: TriggerPayload; execute: ExecutionResult }>({
  name: "Sync",
  onExecution: async (context: ExecutionContext, params: ExecutionParams) => { ... },
})
```
</wrong>
<why>The `flow()` function does not accept generic type parameters. Adding them causes TS2558. Adding type annotations to callback parameters causes TS2345 mismatches with Spectral's internal types.</why>
<right>
```typescript
flow({
  name: "Sync",
  onExecution: async (context, params) => { ... },
})
```
</right>
</anti-pattern>

<anti-pattern name="retryConfig-on-synchronous">
<wrong>
```typescript
flow({
  name: "Webhook Handler",
  isSynchronous: true,
  retryConfig: { maxAttempts: 3, delayMinutes: 1 },
  onExecution: async (context, params) => { ... },
})
```
</wrong>
<why>The platform rejects `retryConfig` on synchronous flows at deploy time. Synchronous flows return a response to the caller — they can't retry asynchronously. Remove `retryConfig` or set `isSynchronous: false`.</why>
<right>
```typescript
flow({
  name: "Webhook Handler",
  isSynchronous: true,
  onExecution: async (context, params) => { ... },
})
```
</right>
</anti-pattern>

---

## Imports and Types

<anti-pattern name="internal-spectral-imports">
<wrong>
```typescript
import { flow } from "@prismatic-io/spectral/dist/types/IntegrationDefinition";
import { Connection } from "@prismatic-io/spectral/dist/types/Inputs";
```
</wrong>
<why>Internal paths are not part of the public API. They break on SDK version updates. Everything needed is exported from the root package.</why>
<right>
```typescript
import { flow, integration, configVar, connectionConfigVar } from "@prismatic-io/spectral";
```
</right>
</anti-pattern>

<anti-pattern name="direct-cast-from-generic">
<wrong>
```typescript
const order = payload.body.data as ShopifyOrder;
```
</wrong>
<why>TypeScript rejects direct casts from `Record<string, unknown>` (TS2352). Webhook payloads and component results are generic types that need a two-step cast.</why>
<right>
```typescript
const order = payload.body.data as unknown as ShopifyOrder;
```
</right>
</anti-pattern>

<anti-pattern name="as-any-for-spectral-types">
<wrong>
```typescript
const result = await slackManifest.actions.postMessage.perform(params as any);
```
</wrong>
<why>`as any` silences real type errors that indicate incorrect usage. The resulting code compiles but fails at runtime. If a type doesn't match, the code structure is wrong — fix the structure, not the types.</why>
<right>
```typescript
const result = await slackManifest.actions.postMessage.perform(params);
// If this fails, check that params matches the action's expected input shape
```
</right>
</anti-pattern>

---

## Component Usage

<anti-pattern name="context-components-api">
<wrong>
```typescript
const result = await context.components.slack.postMessage({ channel, text });
```
</wrong>
<why>The `context.components.<key>.<action>()` API does not exist in CNIs. Components are accessed through imported manifests. This pattern silently returns undefined.</why>
<right>
```typescript
import slackManifest from "./manifests/slack";
const result = await slackManifest.actions.postMessage.perform({
  connection: context.configVars["slackConnection"],
  channel,
  text,
});
```
</right>
</anti-pattern>

<anti-pattern name="manual-manifest-creation">
<wrong>
```typescript
// src/manifests/slack.ts (hand-written)
export default {
  actions: { postMessage: { perform: async (params) => { ... } } },
  connections: { slackOAuth: { key: "slack-oauth2" } },
};
```
</wrong>
<why>Manifests are auto-generated by `prismatic-tools install-manifest <key>` and contain the full typed interface for a component's actions, connections, and data sources. Hand-written manifests miss fields, have wrong types, and break when the component updates.</why>
<right>
```bash
prismatic-tools install-manifest slack
# Generates src/manifests/slack.json with full type definitions
```
```typescript
import slackManifest from "./manifests/slack";
```
</right>
</anti-pattern>

---

## Trigger Configuration

<anti-pattern name="webhook-lifecycle-handlers">
<wrong>
```typescript
flow({
  name: "Webhook Flow",
  webhookLifecycleHandlers: {
    create: async (context, webhookUrls) => { ... },
    delete: async (context) => { ... },
  },
})
```
</wrong>
<why>`webhookLifecycleHandlers` has been reported to cause "Invalid trigger configuration" on some platform versions. Use `onInstanceDeploy`/`onInstanceDelete` — they're the stable, documented lifecycle callbacks.</why>
<right>
```typescript
flow({
  name: "Webhook Flow",
  onTrigger: async (_context, payload) => ({ payload }),
  onInstanceDeploy: async (context) => {
    const webhookUrl = context.webhookUrls["Webhook Flow"];
    // register webhook with external API
  },
  onInstanceDelete: async (context) => {
    // deregister webhook
  },
})
```
</right>
</anti-pattern>

<anti-pattern name="organization-security-no-keys">
<wrong>
```typescript
flow({
  name: "Secure Webhook",
  endpointSecurityType: "organization",
  onExecution: async (context, params) => { ... },
})
```
</wrong>
<why>The platform rejects flows with `endpointSecurityType: "organization"` that don't provide `organizationApiKeys`. The security type declares that incoming requests must present an API key — but if no keys are defined, no request can ever pass validation.</why>
<right>
```typescript
flow({
  name: "Secure Webhook",
  endpointSecurityType: "organization",
  organizationApiKeys: [configVar("apiKey", { dataType: "string", stableKey: "org-api-key" })],
  onExecution: async (context, params) => { ... },
})
```
</right>
</anti-pattern>
