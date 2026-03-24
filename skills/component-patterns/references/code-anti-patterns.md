# Code Anti-Patterns

Common mistakes in generated component code. Each pattern shows what goes wrong, why it fails, and the correct approach.

---

## HTTP Client

<anti-pattern name="raw-fetch-axios">
<wrong>
```typescript
perform: async (context, params) => {
  const response = await fetch("https://api.example.com/items");
  return { data: await response.json() };
},
```
</wrong>
<why>Raw fetch/axios bypasses the Spectral HTTP client, losing debug mode, consistent error handling, and base URL management. Use the createClient helper from client.ts.</why>
<right>
```typescript
perform: async (context, params) => {
  const client = new MyClient({ connection: params.connection });
  const items = await client.items.list();
  return { data: items };
},
```
</right>
</anti-pattern>

---

## Return Values

<anti-pattern name="missing-data-wrapper">
<wrong>
```typescript
perform: async (context, params) => {
  const items = await client.items.list();
  return items;
},
```
</wrong>
<why>Actions must return `{ data: ... }`. Returning raw results causes runtime errors — the platform expects an object with a `data` property.</why>
<right>
```typescript
perform: async (context, params) => {
  const items = await client.items.list();
  return { data: items };
},
```
</right>
</anti-pattern>

---

## Webhook Triggers

<anti-pattern name="missing-lifecycle-hooks">
<wrong>
```typescript
const webhookTrigger = trigger({
  display: { label: "Webhook", description: "Receive events" },
  inputs: { connection: connectionInput },
  perform: async (context, payload) => {
    return { payload };
  },
});
```
</wrong>
<why>Without onInstanceDeploy/onInstanceDelete, the webhook is never registered or cleaned up with the external API. The trigger receives nothing.</why>
<right>
```typescript
const webhookTrigger = trigger({
  display: { label: "Webhook", description: "Receive events" },
  inputs: { connection: connectionInput },
  onInstanceDeploy: async (context, inputs) => {
    const client = new MyClient({ connection: inputs.connection });
    const result = await client.webhooks.register({ url: context.webhookUrls[context.flow.name] });
    return { instanceState: { webhookId: result.id } };
  },
  onInstanceDelete: async (context, inputs) => {
    const webhookId = context.instanceState?.webhookId;
    if (webhookId) {
      const client = new MyClient({ connection: inputs.connection });
      await client.webhooks.delete(webhookId as string);
    }
  },
  perform: async (context, payload) => {
    return { payload };
  },
  scheduleSupport: "invalid",
  synchronousResponseSupport: "valid",
});
```
</right>
</anti-pattern>

---

## Connection Field Access

<anti-pattern name="uncast-connection-fields">
<wrong>
```typescript
const apiKey = connection.fields.apiKey;
const baseUrl = connection.fields.endpoint;
```
</wrong>
<why>Connection fields are typed as `unknown`. Using them without casting causes TypeScript errors and silent runtime bugs.</why>
<right>
```typescript
const apiKey = connection.fields.apiKey as string;
const baseUrl = (connection.fields.endpoint as string) || "https://api.example.com";
```
</right>
</anti-pattern>

---

## Imports

<anti-pattern name="internal-spectral-imports">
<wrong>
```typescript
import { action } from "@prismatic-io/spectral/dist/serverTypes";
import type { ActionContext } from "@prismatic-io/spectral/dist/types";
```
</wrong>
<why>Internal paths are not part of the public API. They break on SDK version updates. Everything needed is exported from the root package (except createClient).</why>
<right>
```typescript
import { action, input, util } from "@prismatic-io/spectral";
import { createClient } from "@prismatic-io/spectral/dist/clients/http"; // exception
```
</right>
</anti-pattern>

---

## Cleanup

<anti-pattern name="missing-cleanup">
<wrong>
```typescript
onInstanceDeploy: async (context, inputs) => {
  const result = await client.webhooks.register({ url: webhookUrl });
  return { instanceState: { webhookId: result.id } };
},
// no onInstanceDelete
```
</wrong>
<why>Without onInstanceDelete, orphaned webhooks accumulate in the external service. Always pair registration with deregistration.</why>
<right>
```typescript
onInstanceDeploy: async (context, inputs) => {
  const result = await client.webhooks.register({ url: webhookUrl });
  return { instanceState: { webhookId: result.id } };
},
onInstanceDelete: async (context, inputs) => {
  const webhookId = context.instanceState?.webhookId;
  if (webhookId) {
    await client.webhooks.delete(webhookId as string);
  }
},
```
</right>
</anti-pattern>

---

## Base URLs

<anti-pattern name="hardcoded-base-url">
<wrong>
```typescript
const listItems = action({
  perform: async (context, params) => {
    const response = await fetch("https://api.example.com/v2/items");
    return { data: await response.json() };
  },
});
```
</wrong>
<why>Hardcoded URLs prevent customers from using sandbox/staging environments and break when the API version changes. Use the connection's endpoint field or the client helper.</why>
<right>
```typescript
const listItems = action({
  perform: async (context, params) => {
    const client = new MyClient({ connection: params.connection });
    const items = await client.items.list();
    return { data: items };
  },
});
```
</right>
</anti-pattern>

---

## Polling Triggers

<anti-pattern name="component-polling-trigger">
<wrong>
```typescript
const pollingTrigger = trigger({
  display: { label: "Poll for Changes", description: "Check for new items periodically" },
  inputs: { connection: connectionInput },
  perform: async (context, payload) => {
    const items = await client.items.listSince(lastTimestamp);
    return { payload: { body: { data: items } } };
  },
  scheduleSupport: "required",
});
```
</wrong>
<why>Polling is an integration-level concern, not a component trigger. Components provide the actions (e.g., "List Items Since Timestamp") that the integration's polling flow calls. The integration handles schedule, state, and cursor tracking via `context.polling`.</why>
<right>
```typescript
// Component provides the action
const listItemsSince = action({
  display: { label: "List Items Since", description: "List items created after a timestamp" },
  inputs: {
    connection: connectionInput,
    since: input({ label: "Since", type: "string", required: true, clean: util.types.toString }),
  },
  perform: async (context, params) => {
    const client = new MyClient({ connection: params.connection });
    const items = await client.items.listSince(params.since);
    return { data: items };
  },
});
```
</right>
</anti-pattern>
