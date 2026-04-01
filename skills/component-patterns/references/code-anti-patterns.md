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

---

## Client Architecture

<anti-pattern name="class-based-client">
<wrong>
```typescript
class MyClient {
  constructor(connection) { ... }
}
```
</wrong>
<why>The components repo uses a function-based client factory, not classes. Class-based clients add unnecessary complexity and diverge from the established pattern.</why>
<right>
```typescript
export const createClient = (connection: Connection, debug = false): HttpClient =>
  createHttpClient({...})
```
</right>
</anti-pattern>

---

## Error Hooks

<anti-pattern name="missing-error-hook">
<wrong>
```typescript
export default component({ key, actions, connections })
```
</wrong>
<why>Without an error hook, HTTP errors are not normalized. Auth failures (401/403) won't surface as connection errors in the Prismatic UI.</why>
<right>
```typescript
import { component, ConnectionError } from "@prismatic-io/spectral";

export default component({
  key, actions, connections,
  hooks: {
    error: (error) => {
      if (error instanceof ConnectionError) throw error;
      throw new Error(`${error.message ?? error}`);
    },
  },
})
```
</right>
</anti-pattern>


---

## Data Source Elements

<anti-pattern name="wrong-element-format">
<wrong>
```typescript
{ label: "Bucket A", value: "bucket-a" }
```
</wrong>
<why>The `Element` type from spectral uses `key`, not `value`. Using `value` causes type errors and broken picklists in the config UI.</why>
<right>
```typescript
{ label: "Bucket A", key: "bucket-a" }
```
</right>
</anti-pattern>

---

## Input Definitions

<anti-pattern name="inline-inputs-in-actions">
<wrong>
```typescript
inputs: { name: input({ label: "Name", type: "string" }) }
```
</wrong>
<why>Inline inputs in action files prevent reuse across actions and data sources. All inputs belong in `src/inputs/` and are imported by reference.</why>
<right>
```typescript
import { name } from "../../inputs";
// then in action:
inputs: { connection, name }
```
</right>
</anti-pattern>

---

## Clean Functions

<anti-pattern name="missing-clean-functions">
<wrong>
```typescript
input({ label: "Name", type: "string", required: true })
```
</wrong>
<why>Without a `clean` function, input values arrive as `unknown` and require manual casting. Clean functions ensure type safety and consistent coercion. String inputs also require `comments`, `placeholder`, and `example`.</why>
<right>
```typescript
input({ label: "Name", type: "string", required: true, clean: util.types.toString, comments: "The item name", placeholder: "e.g. My Item" })
```
</right>
</anti-pattern>

---

## Example Payloads

<anti-pattern name="missing-example-payload">
<wrong>
```typescript
const listUsers = action({
  display: { label: "List Users", description: "..." },
  inputs: { connection },
  perform: async (context, { connection }) => { ... },
});
```
</wrong>
<why>Every action must include an `examplePayload` property so the platform can display sample output in the integration designer. Payloads are imported from `src/examplePayloads/`.</why>
<right>
```typescript
import { listUsersExamplePayload } from "../../examplePayloads";

const listUsers = action({
  display: { label: "List Users", description: "..." },
  examplePayload: listUsersExamplePayload,
  inputs: { connection },
  perform: async (context, { connection }) => { ... },
});
```
</right>
</anti-pattern>

<anti-pattern name="modifying-action-for-payload">
<wrong>
```typescript
// Removing generic to avoid type conflict with examplePayload
const { data } = await client.get("/users"); // was client.get<User>("/users")
```
</wrong>
<why>The action's perform function is the source of truth. The examplePayload must match what the action returns — including nullable fields. Never modify the action to match the payload. If a type has `field: string | null`, the payload must include `null` too.</why>
<right>
```typescript
// Keep the generic — it's the action's type contract
const { data } = await client.get<User>("/users");

// And make the examplePayload match, including nullable fields
export const getUserExamplePayload = {
  data: { id: "usr_123", name: "Jane", deletedAt: null as string | null },
};
```
</right>
</anti-pattern>
