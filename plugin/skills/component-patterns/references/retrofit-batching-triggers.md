# Retrofitting a Published Trigger for Batching (Large Data Sync)

Adding batching — a [large data sync](https://prismatic.io/docs/custom-connectors/triggers/#large-data-syncs) —
to a trigger that is **already published and in use** is a different job from authoring a new one
(see [batching-triggers.md](batching-triggers.md) for net-new). Deployed flows depend on the
trigger's current output, so the governing rule is backward compatibility, not greenfield design.

## Contents

- [The backward-compatibility contract](#the-backward-compatibility-contract)
- [Version floor](#version-floor)
- [The three fields, retrofit form](#the-three-fields-retrofit-form)
- [The resolver converts, it rarely passes through](#the-resolver-converts-it-rarely-passes-through)
- [Batch size and concurrency](#batch-size-and-concurrency)
- [Retrofitting a fetch-all trigger: cursor and watermark](#retrofitting-a-fetch-all-trigger-cursor-and-watermark)
- [Placement: in-place vs a (Batched) sibling](#placement-in-place-vs-a-batched-sibling)
- [Worked example: HubSpot-style before → after](#worked-example-hubspot-style-before--after)
- [Testing](#testing)
- [Anti-patterns](#anti-patterns)

---

## The backward-compatibility contract

**With batching disabled, the trigger must return the exact same `payload.body.data` shape and
the same records it returned before the retrofit.** Batching is opt-in per flow and inert until a
builder enables it, so every already-deployed flow must be unaffected. Three rules follow:

1. **`triggerResolverSupport` is `"valid"`, never `"required"`.** `"valid"` keeps batching an
   opt-in that leaves the unbatched payload as the default. `"required"` forces the resolver on
   every flow, which changes what deployed flows receive — the one thing a retrofit must not do.
2. **Never rename the existing trigger's export.** The export name is the trigger key; renaming it
   silently breaks every deployed flow that references it. Adding a key is safe, renaming one is
   not. This holds even under an explicit "clean up the naming" request.
3. **Do not change what `perform` puts on `body.data` in the unbatched path.** The resolver reads
   that existing payload; it does not reshape it. (Reshaping the payload itself is a breaking
   change that belongs in a new trigger, not a retrofit.)

---

## Version floor

A published component may sit below the batching floor — HubSpot's polling trigger ships on
spectral 10.17.1, which has none of the batching type surface. Bump to **10.26.1+** (where
`batchConfig` is compiler-mandatory when batching, and `context.batch` exists) before retrofitting;
the primitives exist back to 10.23.0 if a smaller bump is required. Verify by reading the installed
**type surface**, not `package.json`:

```bash
cd components/${COMPONENT_KEY} && node -e "
const path=require('path'),fs=require('fs');
const p=require.resolve('@prismatic-io/spectral/package.json');
const s=fs.readFileSync(path.join(path.dirname(p),'dist/types/TriggerDefinition.d.ts'),'utf8');
process.exit(s.includes('triggerResolverSupport')?0:1);
" && echo "capable" || echo "below floor — bump spectral first"
```

---

## The three fields, retrofit form

Add three fields to the existing trigger definition; leave `perform` producing the same payload:

```typescript
triggerResolverSupport: "valid",                          // opt-in — never "required" on a retrofit
batchConfig: { batchSize: 50, concurrentBatchLimit: 1 },  // start concurrency at 1
triggerResolver: {
  // Reads the EXISTING body.data envelope; the unbatched payload is unchanged.
  resolveItems: (_context, { payload }): RecordChange[] =>
    resolveRecordChanges(payload.body.data as ChangesObject),
},
```

The compiler enforces that a `triggerResolver` pairs with `"valid"`/`"required"` and (at 10.26.1)
that it carries a `batchConfig`. It does **not** stop you from writing `"required"` — that rule is
yours to hold.

---

## The resolver converts, it rarely passes through

A net-new trigger emits its records already in item shape, so its `resolveItems` is a passthrough.
A published trigger almost never does: it returns a fixed **envelope** deployed flows read, most
often a change feed like `{ createdRecords, updatedRecords, deletedRecords }`. `resolveItems`
flattens that envelope into one sliceable array of tagged items, without touching the envelope the
unbatched path still returns:

```typescript
// util.ts — flatten the published envelope into batchable items.
export const resolveRecordChanges = (data: ChangesObject | undefined): RecordChange[] => {
  const changes = data ?? { createdRecords: [], updatedRecords: [], deletedRecords: [] };
  return [
    ...(changes.createdRecords ?? []).map((record): RecordChange => ({ changeType: "created", record })),
    ...(changes.updatedRecords ?? []).map((record): RecordChange => ({ changeType: "updated", record })),
    ...(changes.deletedRecords ?? []).map((record): RecordChange => ({ changeType: "deleted", record })),
  ];
};
```

The item is a tagged envelope, `{ changeType, record }`. Use a **discriminated union** when a
change type carries a structurally different record (a deletion is often just an id + timestamp)
and a **plain interface** when every array holds the same shape.

**A passthrough is correct only when the existing `perform` already returns a clean, sliceable
array on `body.data`** — then `resolveItems` just unwraps it. Anything shaped as an envelope, a
wrapped response, or multiple arrays needs conversion.

The flattener **must tolerate an absent envelope (`data ?? …`) and individually absent arrays
(`?? []`)**: a builder who enables only "new records" gets a payload with no `updatedRecords` key,
and that is a supported configuration, not an error.

---

## Batch size and concurrency

Same guidance as net-new. `batchConfig.batchSize` is the default the platform seeds (a builder may
override it per instance), so a sane starting point is enough — 50 suits change feeds; 1 suits
strict per-record isolation. **Set `concurrentBatchLimit`, starting at `1`**: an omitted limit
means unlimited concurrency, and a large poll (especially a first backfill through a look-back
date) can consume the tenant's execution slots and starve other flows. Raise it deliberately to
the destination's rate limit or connection-pool size.

At 10.26.1 read `context.batch` to adapt the fetch when batching is on — a batched drain hands its
records back through a size-capped request, so cap the page size accordingly:

```typescript
const pageSize = context.batch?.enabled
  ? Math.min(requestedPageSize, MAX_BATCHED_PAGE_SIZE)
  : requestedPageSize;
```

---

## Retrofitting a fetch-all trigger: cursor and watermark

Many published triggers **exhaust the source inside one `perform`** — an internal
`while (response.paging?.next)` loop that drains every page before returning. Two retrofit depths
apply, and they differ in whether `perform`'s control flow changes:

**Additive (no pagination change).** Leave the fetch-all loop as is and only add the converting
resolver over the payload it already returns. Batching then slices that fully-materialized result
into batches. This is purely additive, keeps the unbatched behavior byte-identical, and is the
safest in-place retrofit. It does **not** lower trigger memory — `perform` still materializes the
whole result — so it fits volumes the trigger already handles.

**Paginated (control-flow change).** When the trigger must stop materializing everything, convert
the internal loop to one page per `perform` driven by `getNextPaginationState`. This requires
determining two distinct pieces of state the fetch-all loop conflated:

- **The cursor** — the intra-poll page pointer the internal loop already uses (an `after` token, a
  `paging.next` link, a page number, or a keyset like `(LastModifiedDate, Id)`). It becomes
  `payload.paginationState`; `getNextPaginationState` returns it, or `null` to stop. A non-null
  return re-invokes `perform` for the next page.
- **The watermark** — the cross-run "only records since last time" marker the trigger persists in
  `context.polling.setState` (HubSpot's `lastPolledAt`, Salesforce's `LastModifiedDate` floor).
  This already exists in the trigger; the retrofit must not disturb when it advances.

Two correctness rules make the conversion safe:

1. **Commit the watermark only when the drain finishes** (`getNextPaginationState` returns `null`).
   Rounds 2..N re-enter the same `perform` while pages are still draining; a watermark advanced
   mid-drain skips the records still in flight. Keep the incoming watermark fixed across the drain
   and write the new one only on the final page.
2. **Mirror the cursor into polling state each round**, so a drain that dies mid-way resumes from
   the stored cursor on its next invocation and re-delivers the records whose batches may not have
   run.

A paginated `perform` returns a single page per invocation, so an unbatched poll delivers only the
first page — short of the full set deployed flows expect, and therefore **not** backward compatible
in place. Route it through a [sibling trigger](#placement-in-place-vs-a-batched-sibling), or preserve
unbatched completeness by persisting the cursor in polling state so successive scheduled polls resume
the drain (the Salesforce approach: eventual completeness across scheduled runs).

**`polledNoChanges` gotcha.** Report `polledNoChanges: true` only on a self-initiated round with
no cursor and no records — never on a platform-driven paginated round. Reporting it mid-drain skips
the resolver dispatch that marks discovery complete and hangs the batch barrier at zero:

```typescript
const isPlatformDrivenRound = Boolean(payload.paginationState);
return {
  payload: { ...payload, body: { data: changesObject }, paginationState: nextCursor ?? undefined },
  polledNoChanges: changes === 0 && nextCursor === null && !isPlatformDrivenRound,
};
```

---

## Placement: in-place vs a (Batched) sibling

**In-place** — add the three fields to the existing trigger. Correct for the additive retrofit:
behavior is unchanged until a flow enables batching. Smallest diff, no new surface.

**A `(Batched)` sibling** — a new trigger alongside the untouched original; builders adopt batching
by choosing the sibling trigger. Mandatory when the retrofit changes `perform`'s control flow (the
paginated conversion above), because that is not additive to the published trigger.

| Existing | Sibling |
|---|---|
| `pollChangesTrigger` | `pollChangesBatchedTrigger` |
| `"New and Updated Records"` | `"New and Updated Records (Batched)"` |

For a sibling, share one `perform` (extract it to a const passed to both triggers, with explicit
`context` / `payload` / `params` type annotations — outside `pollingTrigger({...})` there is no
contextual type to infer from) and reuse the same `inputs` object, so the two never drift.

Placement is a per-trigger call driven by deployment risk, which is not visible in source. Present
both and let the maintainer decide; do not default it silently.

---

## Worked example: HubSpot-style before → after

**Before** — an un-retrofitted polling trigger that fetches all pages internally and returns a
change envelope:

```typescript
export const pollChangesTrigger = pollingTrigger({
  display: { label: "New and Updated Records", description: "Checks for new and updated records on a schedule." },
  inputs: pollChangesTriggerInputs,
  perform: async (context, payload, params) => {
    const client = createClient(params.connection);
    const state = context.polling.getState();
    const lastPolledAt = (state.lastPolledAt as string) || new Date().toISOString();
    // internal fetch-all: drains every page before returning
    const records = await client.search({ since: lastPolledAt, fetchAll: true });
    context.polling.setState({ lastPolledAt: new Date().toISOString() });
    const changesObject = getPollingChanges(params.showNewRecords, params.showUpdatedRecords, records, new Date(lastPolledAt));
    return { payload: { ...payload, body: { data: changesObject } }, polledNoChanges: records.length === 0 };
  },
});
```

**After (additive, in-place)** — three fields added, the same export name, the same unbatched
payload, `perform` untouched:

```typescript
export const pollChangesTrigger = pollingTrigger({
  display: { label: "New and Updated Records", description: "Checks for new and updated records on a schedule." },
  inputs: pollChangesTriggerInputs,

  triggerResolverSupport: "valid",
  batchConfig: { batchSize: 50, concurrentBatchLimit: 1 },
  triggerResolver: {
    resolveItems: (_context, { payload }): RecordChange[] =>
      resolveRecordChanges(payload.body.data as ChangesObject),
  },

  perform: /* unchanged from Before */ pollChangesPerform,
});
```

Reaching for the paginated conversion instead? Extract the `after`/`paging.next` token the internal
loop used into `payload.paginationState`, add `getNextPaginationState`, move the `setState` write
to the final page, and place it as a `(Batched)` sibling — see the sections above.

---

## Testing

Import the harness from `@prismatic-io/spectral/dist/testing`. Beyond the net-new checks
(declaration; resolver invoked through a realistic payload; pagination to exhaustion where
present), a retrofit adds one that guards the contract:

- **Unbatched payload unchanged.** Assert `perform` returns the same `body.data` shape and records
  it did before the retrofit — the resolver is additive and must not have altered the payload.

No component test proves the platform splits a result into executions or honors
`concurrentBatchLimit`; confirm end to end by deploying an instance and observing executions.

---

## Anti-patterns

Worked wrong/right pairs live in [code-anti-patterns.md](code-anti-patterns.md) → "Polling
Triggers":

- `required-resolver-on-retrofit` — `triggerResolverSupport: "required"` on a published trigger,
  forcing batching onto deployed flows.
- `renamed-trigger-export-on-retrofit` — renaming the existing export (the trigger key) while adding
  batching.
- `watermark-advanced-mid-drain` — advancing the polling watermark before the drain's final page,
  silently dropping in-flight records.
- `pollednochanges-on-paginated-round` — reporting `polledNoChanges` on a platform-driven round,
  hanging the batch barrier.

## Related documentation

- [Prismatic docs: Large data syncs (custom connectors)](https://prismatic.io/docs/custom-connectors/triggers/#large-data-syncs) — the customer-facing reference
- [batching-triggers.md](batching-triggers.md) — batching a **net-new** trigger (passthrough resolver, initial-sync paths)
- [trigger-patterns.md](trigger-patterns.md) — polling and webhook trigger structure
