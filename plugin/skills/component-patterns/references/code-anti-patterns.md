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

<anti-pattern name="component-polling-with-plain-trigger">
<wrong>
```typescript
const pollForChanges = trigger({
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
<why>A component polling trigger must use the `pollingTrigger()` factory, not `trigger()`. Only `pollingTrigger()` provides `context.polling.getState()/setState()` for the cursor a poll needs to track across runs, and it sets `scheduleSupport` implicitly. A plain `trigger()` has no polling state, so `lastTimestamp` above has nowhere to come from. See [trigger-patterns.md](trigger-patterns.md) → "Polling Triggers". (This is for reusable components consumed by low-code/EWB — a CNI polls differently; see "Where does polling live?" in that file.)</why>
<right>
```typescript
const pollForChanges = pollingTrigger({
  display: { label: "Poll for Changes", description: "Check for new items periodically" },
  inputs: { connection: connectionInput },
  perform: async (context, payload, { connection }) => {
    const client = createClient(connection, context.debug.enabled);
    const state = context.polling.getState();
    const since = (state.lastChecked as string) || new Date(0).toISOString();
    const items = await client.items.listSince(since);
    context.polling.setState({ lastChecked: new Date().toISOString() });
    return { payload: { ...payload, body: { data: items } }, polledNoChanges: items.length === 0 };
  },
});
```
</right>
</anti-pattern>

<anti-pattern name="internal-page-loop-instead-of-pagination-state">
<wrong>
```typescript
// Drains every page inside one perform before anything can batch.
perform: async (context, payload, { connection }) => {
  const all: Record[] = [];
  let cursor: string | undefined;
  do {
    const { records, nextCursor } = await fetchOnePage(connection, cursor);
    all.push(...records);
    cursor = nextCursor;
  } while (cursor);
  return { payload: { ...payload, body: { data: all } } };
},
```
</wrong>
<why>A batched trigger paginates through `getNextPaginationState`, not a `while` loop. Draining every page inside one `perform` materializes the whole result set in trigger memory before `resolveItems` runs, so batching gives no memory relief and a large poll can exhaust the trigger. Returning one page and the next cursor lets the platform re-invoke `perform` per page and batch each page as it arrives. See [batching-triggers.md](batching-triggers.md) → "Pagination".</why>
<right>
```typescript
triggerResolver: {
  resolveItems: (_context, { payload }) => (payload.body.data as Record[]) ?? [],
  getNextPaginationState: (_context, { payload }) => (payload.paginationState as PageCursor | undefined) ?? null,
},
perform: async (context, payload, { connection }) => {
  const cursor = payload.paginationState as PageCursor | undefined;
  const { records, nextCursor } = await fetchOnePage(connection, cursor);
  return { payload: { ...payload, body: { data: records }, paginationState: nextCursor ?? undefined } };
},
```
</right>
</anti-pattern>

<anti-pattern name="unbounded-batch-concurrency">
<wrong>
```typescript
// No concurrentBatchLimit — a large poll dispatches unlimited concurrent executions.
batchConfig: { batchSize: 1 },
```
</wrong>
<why>Omitting `concurrentBatchLimit` means *unlimited* concurrency. One large poll — especially a first-run backfill — can consume the tenant's execution slots and starve every other flow and instance in that tenant, not just this one. Set it; `1` (serial) is safe on any destination, and it is raised deliberately to the destination's rate limit or connection-pool size.</why>
<right>
```typescript
batchConfig: { batchSize: 1, concurrentBatchLimit: 1 },
```
</right>
</anti-pattern>

<anti-pattern name="converting-resolver-for-net-new-trigger">
<wrong>
```typescript
// A net-new "required" trigger whose perform returns { createdRecords, updatedRecords },
// forcing resolveItems to reshape data the author controls the shape of.
triggerResolverSupport: "required",
perform: async (context, payload) => ({ payload: { ...payload, body: { data: { createdRecords, updatedRecords } } } }),
triggerResolver: { resolveItems: (_c, { payload }) => flattenEnvelope(payload.body.data) },
```
</wrong>
<why>Converting `resolveItems` is for a *retrofit* — a published trigger whose envelope deployed flows depend on. On a net-new `"required"` trigger you control `perform`, so emit the item shape directly and let `resolveItems` pass through. Reshaping data you just built adds a layer that can silently diverge from `perform`.</why>
<right>
```typescript
triggerResolverSupport: "required",
perform: async (context, payload) => ({ payload: { ...payload, body: { data: records } } }), // already item-shaped
triggerResolver: { resolveItems: (_c, { payload }) => (payload.body.data as Record[]) ?? [] },
```
</right>
</anti-pattern>

<anti-pattern name="batching-to-fix-trigger-memory">
<wrong>
```typescript
// "perform runs out of memory on large accounts, so add batching."
batchConfig: { batchSize: 50, concurrentBatchLimit: 5 },
```
</wrong>
<why>Batching splits the *executions*, not the fetch. `perform` still materializes its full result before `resolveItems` runs, so `batchConfig` changes nothing about trigger memory. A `perform` that runs out of memory needs pagination (`getNextPaginationState`, one page per invocation), not batching.</why>
<right>
```typescript
triggerResolver: {
  resolveItems: (_c, { payload }) => (payload.body.data as Record[]) ?? [],
  getNextPaginationState: (_c, { payload }) => (payload.paginationState as PageCursor | undefined) ?? null,
},
// perform fetches ONE page and returns the next cursor — see internal-page-loop-instead-of-pagination-state
```
</right>
</anti-pattern>

<anti-pattern name="required-resolver-on-retrofit">
<wrong>
```typescript
// Retrofitting a PUBLISHED trigger — this forces batching onto every deployed flow.
triggerResolverSupport: "required",
batchConfig: { batchSize: 50, concurrentBatchLimit: 1 },
triggerResolver: { resolveItems: (_c, { payload }) => resolveRecordChanges(payload.body.data as ChangesObject) },
```
</wrong>
<why>`"required"` forces the resolver on every flow, changing what already-deployed flows receive — exactly what a retrofit must not do. On a published trigger, batching is opt-in: use `"valid"` so the unbatched payload stays the default and batching is inert until a flow enables it. `"required"` is for net-new triggers only. See [retrofit-batching-triggers.md](retrofit-batching-triggers.md).</why>
<right>
```typescript
triggerResolverSupport: "valid",
batchConfig: { batchSize: 50, concurrentBatchLimit: 1 },
triggerResolver: { resolveItems: (_c, { payload }) => resolveRecordChanges(payload.body.data as ChangesObject) },
```
</right>
</anti-pattern>

<anti-pattern name="renamed-trigger-export-on-retrofit">
<wrong>
```typescript
// Renaming the existing export while adding a batched variant.
export const pollChangesUnbatchedTrigger = pollingTrigger({ /* the original */ });
export const pollChangesTrigger = pollingTrigger({ /* the new batched one */ });
```
</wrong>
<why>The export name is the trigger key. Renaming it silently breaks every deployed flow that references it — no build error, no runtime warning. Keep the original export name exactly; a batched sibling takes a genuinely new key (`pollChangesBatchedTrigger`). Adding a key is safe; renaming one is not.</why>
<right>
```typescript
export const pollChangesTrigger = pollingTrigger({ /* original, now with the three batching fields added in place */ });
// or, for the paginated conversion, a sibling with a NEW key:
export const pollChangesBatchedTrigger = pollingTrigger({ /* ... */ });
```
</right>
</anti-pattern>

<anti-pattern name="watermark-advanced-mid-drain">
<wrong>
```typescript
// Advancing the cross-run watermark on every page while a paginated drain is still in flight.
context.polling.setState({ lastPolledAt: new Date().toISOString() });
return { payload: { ...payload, body: { data }, paginationState: nextCursor ?? undefined } };
```
</wrong>
<why>Rounds 2..N re-enter the same `perform` while pages are still draining. A watermark advanced mid-drain moves the "since" forward past records still in flight on later pages, silently dropping them. Commit the watermark only when the drain finishes (`getNextPaginationState` returns `null`), and keep the incoming watermark fixed across the drain.</why>
<right>
```typescript
if (nextCursor === null) {
  context.polling.setState({ lastPolledAt: windowEnd }); // only on the final page
}
return { payload: { ...payload, body: { data }, paginationState: nextCursor ?? undefined } };
```
</right>
</anti-pattern>

<anti-pattern name="pollednochanges-on-paginated-round">
<wrong>
```typescript
// Reporting polledNoChanges on a platform-driven (paginated) round.
return { payload: { ...payload, body: { data }, paginationState: nextCursor ?? undefined }, polledNoChanges: data.length === 0 };
```
</wrong>
<why>On a platform-driven round (one re-invoked via `payload.paginationState`), reporting `polledNoChanges` skips the resolver dispatch that marks discovery complete, hanging the batch barrier at zero. Report it only on a self-initiated round with no cursor and no records.</why>
<right>
```typescript
const isPlatformDrivenRound = Boolean(payload.paginationState);
return {
  payload: { ...payload, body: { data }, paginationState: nextCursor ?? undefined },
  polledNoChanges: data.length === 0 && nextCursor === null && !isPlatformDrivenRound,
};
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
