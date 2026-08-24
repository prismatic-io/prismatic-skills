# Batching Component Triggers (Large Data Sync)

The Prismatic docs call this capability a **[large data sync](https://prismatic.io/docs/custom-connectors/triggers/#large-data-syncs)**:
you add **batching** to a trigger so the platform splits the records the trigger produces into
batches and runs the flow's steps once per batch, in parallel. This page covers the
component-trigger implementation of it — the sibling of a CNI batched flow (see
[integration-patterns → batch-flows.md](../../integration-patterns/references/cni-examples/batch-flows.md)),
built from a different SDK surface: `pollingTrigger()` / `trigger()` with a `triggerResolver`,
a `batchConfig`, and — for a historical backfill — `onDeployPerform` / `onDeployResolver`.

Reach for it when one poll (or one webhook, or one deploy-time backfill) yields many records
that should be processed **independently** — independent retries, isolated failures, and
bounded parallelism instead of one giant execution. Low-code and EWB builders enable it per
flow; the component only declares that it is available and how it defaults.

## Contents

- [Version floor](#version-floor)
- [How batching works](#how-batching-works)
- [The three declaration fields](#the-three-declaration-fields)
- [`triggerResolverSupport`: net-new vs retrofit](#triggerresolversupport-net-new-vs-retrofit)
- [`batchConfig`: size and concurrency](#batchconfig-size-and-concurrency)
- [Pagination: one page per perform](#pagination-one-page-per-perform)
- [Initial sync: two paths, pick by source](#initial-sync-two-paths-pick-by-source)
- [Webhook triggers + a deploy-time backfill](#webhook-triggers--a-deploy-time-backfill)
- [Reading the batch context](#reading-the-batch-context)
- [Testing](#testing)
- [Anti-patterns](#anti-patterns)

---

## Version floor

Build against **spectral 10.26.1+**. At that version the type system makes `batchConfig`
**mandatory whenever a resolver is declared** (a resolver with no batch size is a compile
error, not a silent default), `onDeployResolver` accepts its own deploy-scoped `inputs`, and
`context.batch` reports how the flow dispatches items.

The primitives themselves exist back to **10.23.0**, so a component already there can adopt
batching without a dependency bump — but without the 10.26.1 conveniences: `batchConfig` is
unenforced (omit it and the resolver is silently inert), there are no deploy-scoped inputs,
and `context.batch` is absent. Prefer 10.26.1+; drop to 10.23.0 only to avoid a bump on an
existing component.

Verify by reading the installed **type surface**, not `package.json` (which records what was
requested, not what is installed):

```bash
cd components/${COMPONENT_KEY} && node -e "
const path=require('path'),fs=require('fs');
const p=require.resolve('@prismatic-io/spectral/package.json');
const s=fs.readFileSync(path.join(path.dirname(p),'dist/types/BatchContext.d.ts'),'utf8');
process.exit(s.includes('BatchInfo')?0:1);
" && echo "10.26.1+" || echo "below 10.26.1"
```

---

## How batching works

```
perform ──▶ resolveItems ──▶ [batch of TItem] ──▶ execution
               │
               └─ getNextPaginationState ──▶ payload.paginationState ──▶ next perform
```

1. `perform` runs and returns one page of results on `payload.body.data`.
2. `triggerResolver.resolveItems` returns the array of records to split into batches.
3. The platform slices those records into batches of `batchConfig.batchSize` and runs the
   flow's steps once per batch, in parallel. `batchSize: 1` delivers a single item;
   `batchSize > 1` delivers a `TItem[]` slice.
4. `getNextPaginationState` returns a cursor for the next page, or `null` when there are no
   more pages. On a non-null cursor the platform stamps it onto `payload.paginationState` and
   re-invokes `perform` page after page (see [Pagination](#pagination-one-page-per-perform)).
5. `concurrentBatchLimit` caps how many of a single poll's batches run at once —
   [always set it](#batchconfig-size-and-concurrency).

Batching splits the **executions**, not the fetch. `perform` still materializes its own page
before `resolveItems` runs, so batching does not lower per-`perform` memory — that is what
pagination is for.

---

## The three declaration fields

A batched trigger declares three coupled fields on the `pollingTrigger()` (or `trigger()`)
definition:

```typescript
import { pollingTrigger } from "@prismatic-io/spectral";
import { connectionInput } from "../inputs";
import { resolveRecords } from "../util";
import type { Record } from "../types";

export const pollRecords = pollingTrigger({
  display: {
    label: "New and Updated Records",
    description: "Checks for new and updated records on a recurring schedule.",
  },
  inputs: { connection: connectionInput },

  triggerResolverSupport: "required",
  batchConfig: { batchSize: 1, concurrentBatchLimit: 1 },
  triggerResolver: {
    resolveItems: (_context, { payload }): Record[] => resolveRecords(payload.body.data),
  },

  perform: async (context, payload, { connection }) => {
    const state = context.polling.getState();
    const since = (state.lastPolledAt as string) || new Date().toISOString();
    const records = await fetchRecordsSince(connection, since);
    context.polling.setState({ lastPolledAt: new Date().toISOString() });
    return {
      payload: { ...payload, body: { data: records } },
      polledNoChanges: records.length === 0,
    };
  },
});
```

Keep the item type and the resolver helper out of the trigger file — item types in
`src/types.ts`, the resolver helper in `src/util.ts` — so both are unit-testable and reused
across sibling triggers.

---

## `triggerResolverSupport`: net-new vs retrofit

`triggerResolverSupport` decides whether batching is forced or optional, and it drives how
much work `resolveItems` does. Pick by whether the trigger is **net-new** or a **retrofit of a
published trigger**. This page covers net-new; for the backward-compatible retrofit of a trigger
already in use, see [retrofit-batching-triggers.md](retrofit-batching-triggers.md).

**Net-new trigger → `"required"`, and `resolveItems` is a passthrough.** Batching is always on,
so design `perform` to return the records already in their final item shape. `resolveItems`
then just unwraps them:

```typescript
// util.ts — the item shape is already what perform emits, so this is a passthrough.
export const resolveRecords = (data: unknown): Record[] => (data as Record[] | undefined) ?? [];
```

```typescript
triggerResolverSupport: "required",
batchConfig: { batchSize: 1, concurrentBatchLimit: 1 },
triggerResolver: { resolveItems: (_context, { payload }) => resolveRecords(payload.body.data) },
```

**Retrofit of a published trigger → `"valid"`, and `resolveItems` converts.** A published
trigger already returns a fixed envelope (for example `{ createdRecords, updatedRecords }`) that
deployed flows depend on. Keep `"valid"` so batching stays opt-in and the unbatched payload is
unchanged, and let `resolveItems` flatten that envelope into tagged items:

```typescript
// util.ts — a change feed with multiple arrays flattens into one tagged stream.
export const resolveRecordChanges = (data: ChangesObject | undefined): RecordChange[] => {
  const changes = data ?? {};
  return [
    ...(changes.createdRecords ?? []).map((record): RecordChange => ({ changeType: "created", record })),
    ...(changes.updatedRecords ?? []).map((record): RecordChange => ({ changeType: "updated", record })),
  ];
};
```

```typescript
triggerResolverSupport: "valid",
batchConfig: { batchSize: 50, concurrentBatchLimit: 1 },
triggerResolver: { resolveItems: (_context, { payload }) => resolveRecordChanges(payload.body.data as ChangesObject) },
```

The flattener **must** tolerate an absent envelope (`data ?? {}`) and individually absent
arrays (`?? []` per array): a builder who enables only "new records" gets a payload with no
`updatedRecords` key, and that is a valid configuration, not an error.

The compiler enforces the resolver ↔ support pairing (`triggerResolver` requires `"valid"` or
`"required"`), and at 10.26.1 it also enforces that a declared resolver carries a `batchConfig`.

---

## `batchConfig`: size and concurrency

```typescript
batchConfig: { batchSize: 1, concurrentBatchLimit: 1 }
```

**`batchSize`** trades isolation against throughput. `1` dispatches each record to its own
execution — strongest isolation, one failure retries one record — and is the right default for
per-record work (one API call or one upsert per record). A larger size (25–100) processes
records in slices, cutting execution count for bulk operations that accept an array, at the
cost of retrying a whole slice on failure. On a component trigger this value is the default the
platform seeds; a builder may override it per instance, so it only needs to be a sane starting
point.

**`concurrentBatchLimit`** caps how many of a single poll's batches run concurrently.
**Set it — `1` is the safe starting point.** Leaving it undefined means *unlimited*
concurrency: one large poll (especially a first-run backfill) can consume the tenant's
execution slots and starve every other flow and instance in that tenant, not just this one.
`1` runs batches serially and is safe on any destination; raise it deliberately to the
destination's tolerance (its rate limit or connection-pool size) once you know that number.
Treat an unbounded setting as a guardrail gap to close, not a default.

---

## Pagination: one page per perform

Batching splits executions; **pagination** splits the fetch. Without it, `perform` must
materialize every record before `resolveItems` runs, so a large poll can exhaust trigger
memory no matter how small the batches are.

Return the next cursor from `perform` on `payload.paginationState`, and surface it through
`getNextPaginationState`. A non-null return re-invokes `perform` with the cursor stamped back
onto `payload.paginationState`; the loop ends when it returns `null`. Every page's items are
batched as they arrive.

```typescript
import type { PageCursor } from "../types"; // type PageCursor = { pageStart: number; remaining: number }

triggerResolverSupport: "required",
batchConfig: { batchSize: 50, concurrentBatchLimit: 1 },
triggerResolver: {
  resolveItems: (_context, { payload }): Record[] => resolveRecords(payload.body.data),
  getNextPaginationState: (_context, { payload }): PageCursor | null =>
    (payload.paginationState as PageCursor | undefined) ?? null,
},
perform: async (context, payload, { connection }) => {
  const cursor = payload.paginationState as PageCursor | undefined;
  const { records, nextCursor } = await fetchOnePage(connection, cursor);
  return {
    payload: { ...payload, body: { data: records }, paginationState: nextCursor ?? undefined },
    polledNoChanges: records.length === 0,
  };
},
```

`paginationState` pages **within one poll** — it is not a cross-run watermark. Advancing the
incremental cursor ("only records since the last run") is separate, and it belongs in
`context.polling.setState`. Write that watermark only once the final page has drained, not on
every `perform`: rounds 2..N re-enter the same `perform` while pages are still draining, and a
watermark advanced mid-drain silently loses the records still in flight.

A `PageCursor` type alias (not an `interface`) satisfies the resolver's
`TPaginationState extends Record<string, unknown>` bound.

---

## Initial sync: two paths, pick by source

A steady-state poll only sees records that change *after* it starts — the first poll defaults
its window to "now" and returns nothing historical. Seeding the pre-existing records is a
separate decision with two implementations. **Ask which one fits; do not assume.**

**Path A — look-back first poll (same source).** Add a `lookBackDate` input. On the first poll
(no persisted cursor) start the window at `lookBackDate` and backfill every record from then,
paged and batched; persist the watermark and poll incrementally thereafter. No `onDeployPerform`.
Choose this when the backfill and the ongoing poll read the **same** source — the first poll
simply runs a bigger version of the normal query. Left empty, the first poll starts at "now"
with no backfill.

```typescript
inputs: {
  connection: connectionInput,
  lookBackDate: input({
    label: "Look-back Date",
    type: "string",
    required: false,
    // clean is REQUIRED for the `|| lookBackDate ||` chain below to type-check: a string input
    // with no `clean` resolves to `{}`, not `string`, and `util.types.toString` narrows it.
    clean: util.types.toString,
    comments:
      "The date the initial sync starts from. Leave empty to start from the first " +
      "recurrence with no backfill. When set, the first poll seeds each record from " +
      "this date once, then polls incrementally.",
  }),
},
perform: async (context, payload, { connection, lookBackDate }) => {
  const state = context.polling.getState();
  const windowStart = (state.lastPolledAt as string) || lookBackDate || new Date().toISOString();
  // ... page from windowStart, batch each page, persist the watermark on the final page
},
```

`input` and `util` are imported from `@prismatic-io/spectral`.

**Path B — deploy-time primitive (different source, or a webhook).** Define `onDeployPerform`,
the deploy-time sibling of `perform`: it fires once when an instance is deployed and returns the
backfill, which `onDeployResolver` reads the same way `triggerResolver` reads `perform`'s output.
The platform re-invokes `onDeployPerform` page after page for as long as its resolver returns a
cursor. The steady-state `perform` then only handles ongoing changes. Choose this when the backfill reads a **different** source than steady state — the
classic case is an ongoing **change/audit feed** that never reports records that already
existed, so the backfill must read the full entity table — or for a **webhook** trigger, which
has no poll to seed from at all.

```typescript
triggerResolverSupport: "required",
batchConfig: { batchSize: 50, concurrentBatchLimit: 1 },
triggerResolver: {
  resolveItems: (_context, { payload }) => resolveRecords(payload.body.data),
  getNextPaginationState: (_context, { payload }) => (payload.paginationState as PageCursor | undefined) ?? null,
},
// One-time backfill on deploy: read the full entity table (a different source than the change feed).
onDeployPerform: async (context, payload, { connection, backfillStartDate }) => {
  const cursor = payload.paginationState as PageCursor | undefined;
  const { records, nextCursor } = await listAllRecords(connection, backfillStartDate, cursor);
  return {
    payload: { ...payload, body: { data: records }, paginationState: nextCursor ?? undefined },
    polledNoChanges: records.length === 0,
  };
},
onDeployResolver: {
  resolveItems: (_context, { payload }) => resolveRecords(payload.body.data),
  // 10.26.1+: inputs presented only for the deploy-time backfill, passed to onDeployPerform only.
  inputs: {
    backfillStartDate: input({
      label: "Backfill Start Date",
      type: "string",
      required: false,
      clean: util.types.toString, // narrows the value to `string`; see the look-back note above
    }),
  },
},
```

`onDeployPerform` paginates and batches exactly like `perform`. Its 10.26.1 deploy-scoped
`inputs` (a backfill start date, a backfill page size) surface only during the on-deploy sync
and reach `onDeployPerform`'s params, keeping them off the steady-state `perform`.

---

## Webhook triggers + a deploy-time backfill

A webhook `trigger()` only ever delivers go-forward events, so a historical sync is *only*
possible through `onDeployPerform` — Path B is the sole option here, not a choice against Path A.

Pair them so both the live webhook and the backfill emit the **same, complete record shape**.
A webhook event usually carries an id and an event type, not the full record, so the trigger's
`perform` should **fetch the referenced record(s)** for the event before emitting them — and
`onDeployPerform` fetches the full entity table the same way. Downstream then receives whole
records from both the backfill and every live event, and never has to branch on where a record
came from.

```typescript
export const recordWebhook = trigger({
  display: { label: "Record Changed", description: "Receives record change events and syncs history on deploy." },
  inputs: { connection: connectionInput },

  triggerResolverSupport: "required",
  batchConfig: { batchSize: 1, concurrentBatchLimit: 1 },
  triggerResolver: { resolveItems: (_context, { payload }) => resolveRecords(payload.body.data) },

  // Live event: the webhook carries ids — fetch the full records so downstream gets whole objects.
  perform: async (context, payload, { connection }) => {
    const event = payload.body.data as { recordIds: string[] };
    const records = await fetchRecordsByIds(connection, event.recordIds);
    return { payload: { ...payload, body: { data: records } } };
  },

  // One-time backfill on deploy: pull existing records the webhook will never resend.
  onDeployPerform: async (context, payload, { connection }) => {
    const cursor = payload.paginationState as PageCursor | undefined;
    const { records, nextCursor } = await listAllRecords(connection, cursor);
    return { payload: { ...payload, body: { data: records }, paginationState: nextCursor ?? undefined } };
  },
  onDeployResolver: { resolveItems: (_context, { payload }) => resolveRecords(payload.body.data) },

  scheduleSupport: "invalid",
  synchronousResponseSupport: "valid",
});
```

Register and tear down the webhook in `onInstanceDeploy` / `onInstanceDelete` as usual (see
[trigger-patterns.md](trigger-patterns.md) → "Basic Webhook Trigger").

---

## Reading the batch context

At 10.26.1+, `context.batch` reports how the flow this execution belongs to dispatches items —
`{ enabled: false }` or `{ enabled: true, batchSize }`. Use it to size a fetch to what the flow
will consume, for example capping the page size when batching is off:

```typescript
const pageSize = context.batch?.enabled ? context.batch.batchSize * 4 : 200;
```

It is read-only and advisory; the platform batches by `batchConfig` regardless of whether the
trigger reads it.

---

## Testing

Import the harness from `@prismatic-io/spectral/dist/testing`. Three checks matter:

1. **Declaration.** `triggerResolverSupport` is the intended value, `batchConfig` matches, and
   `triggerResolver.resolveItems` is a function.
2. **Resolver, invoked through a payload.** Call `resolveItems(context, { payload })` with a
   realistic `payload.body.data` and assert the items. `payload.body.data` is typed `unknown`,
   so the cast inside `resolveItems` is unchecked at compile time — only a test that goes
   *through* the resolver catches a `perform` that later changes the body shape. Asserting
   `resolveItems instanceof Function` does **not** satisfy this.
3. **Pagination and backfill, where present.** Drive `getNextPaginationState` across pages until
   it returns `null`, and invoke `onDeployPerform` to assert it emits the backfill.

No component test can prove the platform splits a result into executions, honors
`concurrentBatchLimit`, or delivers `TItem[]` slices — that is platform behavior with no
component-side seam. Confirm it by deploying an instance and observing executions.

---

## Anti-patterns

Worked wrong/right pairs live in [code-anti-patterns.md](code-anti-patterns.md) → "Polling
Triggers":

- `internal-page-loop-instead-of-pagination-state` — draining every page inside one `perform`
  with a `while` loop instead of `getNextPaginationState`.
- `unbounded-batch-concurrency` — omitting `concurrentBatchLimit`.
- `converting-resolver-for-net-new-trigger` — a `resolveItems` that reshapes data on a `"required"`
  trigger whose `perform` you control; emit the item shape from `perform` and pass through instead.
- `batching-to-fix-trigger-memory` — declaring `batchConfig` to fix a `perform` that runs out of
  memory; batching splits executions, not the fetch. Paginate.

## Related documentation

- [Prismatic docs: Large data syncs (custom connectors)](https://prismatic.io/docs/custom-connectors/triggers/#large-data-syncs) — the customer-facing reference for this trigger surface
- [Prismatic docs: Large Data Sync (code-native pattern)](https://prismatic.io/docs/integrations/common-patterns/large-data-sync/) — the CNI/flow view of the same capability
- [trigger-patterns.md](trigger-patterns.md) — webhook and polling trigger structure, lifecycle hooks
- [answer-to-code-cookbook.md](answer-to-code-cookbook.md) — "answer: trigger batching"
- [integration-patterns → batch-flows.md](../../integration-patterns/references/cni-examples/batch-flows.md) — the CNI batched-flow sibling
