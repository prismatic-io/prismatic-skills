# Batched Flows (CNI-only)

## Overview

A **batched flow** turns one trigger fetch into many per-batch executions. Instead of returning
a raw payload, the flow's `trigger` returns `{ items, paginationState? }` — the records to
dispatch and, when paginating, the cursor for the next page. The platform chunks `items` into
batches of `batchConfig.batchSize` and dispatches each batch as its own execution.

Use it when one fetch (or one webhook) yields many records that should be processed
**independently** — independent retries, isolated failures, and parallelism instead of one giant
run.

**Key Concepts:**

- `batchConfig` + `trigger: batchFlowTrigger(...)` are a coupled pair (CNI-only)
- Trigger fires return `{ items, paginationState? }`
- `batchSize` controls per-execution granularity (1 = per-item; > 1 = grouped array)
- `paginationState` pages within one trigger fire (not a cross-run watermark)
- `onDeploy` provides a one-time backfill on initial instance deploy
- Requires spectral **10.22.0+**

---

## How Batching Works

1. The trigger's `onTrigger` fires (on the flow's `schedule`, or on a webhook) and returns
   `{ items, paginationState? }`.
2. The platform writes `items` to the wire payload (`body.data`) and chunks them into batches of
   `batchConfig.batchSize`.
3. Each batch is dispatched as its own execution. `onExecution` receives
   `params.onTrigger.results.body.data` — a single `TItem` when `batchSize` is 1, or a `TItem[]`
   when `batchSize > 1`.
4. If the fire returned a non-null `paginationState`, the platform re-invokes the trigger with it
   on `payload.paginationState` to fetch the next page. It loops until the fire returns
   `null`/omits it.
5. `concurrentBatchLimit` caps how many batches of a single fire run concurrently — **always set it** (see below).

**Constraints:**

- `batchConfig` present **requires** a batched `trigger`. The flat `onTrigger`/`onDeployTrigger`
  are **forbidden** — the fire lives inside the trigger.
- `batchSize` must be an integer ≥ 1; `concurrentBatchLimit` an integer ≥ 1 when set. Invalid
  values throw at build.
- **Always set `concurrentBatchLimit`.** It is technically optional, but omitting it means
  *unlimited* concurrency — one large fire can consume the tenant's/instance's execution slots and
  starve every other flow and instance in that tenant. Treat it as a tenant-safety guardrail and
  bound it to what the destination can absorb; leave it unbounded only with deliberate headroom.
- A batched flow still needs a fire source: a `schedule` (periodic pull, most common) or a
  webhook (split an incoming array).
- `paginationState` pages **within a single fire** — it is not a watermark that persists across
  scheduled runs. Incremental "only new since last run" filtering is the flow's own concern (a
  time-windowed query or author-managed state). **Any** batched flow can paginate — not just
  scheduled/polling ones; a webhook flow's `onDeploy` initial sync paginates too.
- **Initial / historical sync is usually not a separate feature for a scheduled/polling flow.** If
  the initial load and the ongoing poll read the **same source**, the first invocation runs the big
  sync (paginate + batch) and later runs are smaller/incremental — no `onDeploy`. It becomes a
  separate fire only when the backfill reads a **different source/query** than steady state, or for
  a **webhook** flow (no poll to backfill from). When ambiguous, ask. See `onDeploy` below.
- **Long-running polls:** a big first sync can outlast the schedule interval. Consider
  `queueConfig.singletonExecutions: true` (scheduled/polling only) so the next poll waits for the
  current run rather than overlapping it. Recommended for long syncs, not forced; mutually
  exclusive with a FIFO queue.

---

## Example 1: Paginating scheduled sync (per-item executions)

Fetch orders page by page; dispatch each order as its own execution. Note `concurrentBatchLimit` —
the first run pages through *all* existing orders (the initial sync), so bounding concurrency keeps
that large first fire from saturating the tenant.

```typescript
import { flow, batchFlowTrigger } from "@prismatic-io/spectral";
import httpClient from "../manifests/http/actions";

interface Order {
  id: string;
  total: number;
  customerId: string;
}

export const syncOrders = flow({
  name: "Sync Orders",
  stableKey: "sync-orders",
  description: "Fetches orders page by page and dispatches each as its own execution",
  schedule: { value: "*/15 * * * *" }, // the pull cadence
  // one execution per order, at most 5 of them running at once
  batchConfig: { batchSize: 1, concurrentBatchLimit: 5 },
  trigger: batchFlowTrigger<Order, { cursor: string }>({
    onTrigger: async (context, payload) => {
      const cursor = payload.paginationState?.cursor;
      const { data } = await httpClient.getOrders.perform({
        connection: context.configVars["API Connection"],
        cursor,
      });
      return {
        items: data.orders as Order[],
        // Keep paginating while the API returns a next cursor; stop otherwise.
        paginationState: data.nextCursor ? { cursor: data.nextCursor } : null,
      };
    },
  }),
  onExecution: async (context, params) => {
    const order = params.onTrigger.results.body.data as Order; // single item — batchSize 1
    context.logger.info(`Processing order ${order.id} ($${order.total})`);
    // ... one API call / one record of work
    return { data: order.id };
  },
});
```

---

## Example 2: Grouped batches + concurrency cap (bulk operations)

Process orders 50 at a time and cap parallelism so a downstream API isn't flooded.

```typescript
export const bulkSyncOrders = flow({
  name: "Bulk Sync Orders",
  stableKey: "bulk-sync-orders",
  description: "Fetches orders and bulk-inserts them 50 at a time",
  schedule: { value: "0 * * * *" },
  batchConfig: { batchSize: 50, concurrentBatchLimit: 5 },
  trigger: batchFlowTrigger<Order, { page: number }>({
    onTrigger: async (context, payload) => {
      const page = payload.paginationState?.page ?? 1;
      const { data } = await httpClient.getOrders.perform({
        connection: context.configVars["API Connection"],
        page,
      });
      return {
        items: data.orders as Order[],
        paginationState: data.hasMore ? { page: page + 1 } : null,
      };
    },
  }),
  onExecution: async (context, params) => {
    const orders = params.onTrigger.results.body.data as Order[]; // up to 50 — batchSize > 1
    await httpClient.bulkInsert.perform({
      connection: context.configVars["Destination Connection"],
      records: orders,
    });
    return { data: { count: orders.length } };
  },
});
```

---

## Example 3: `onDeploy` — when the backfill reads a different source

Most scheduled/polling flows do **not** need `onDeploy`. When the initial load and the ongoing poll
read the **same** source, the first poll (empty cursor) already does the big sync — see Example 1.

Reach for `onDeploy` when the initial sync genuinely differs from steady state. The classic case:
the ongoing poll reads a **change/audit feed** to learn *what* changed, while the initial sync must
read the **full entity table** directly (there's no change event for records that already existed).
Two different queries → two fires. (If it's ambiguous which source the initial load should use, ask
the user before adding `onDeploy`.)

```typescript
export const syncUsers = flow({
  name: "Sync Users",
  stableKey: "sync-users",
  schedule: { value: "*/5 * * * *" },
  batchConfig: { batchSize: 25, concurrentBatchLimit: 5 },
  trigger: batchFlowTrigger<User, { cursor: string }>({
    // Steady state: read the CHANGE feed, resolve each changed user
    onTrigger: async (context, payload) => {
      const { data } = await httpClient.getUserChanges.perform({
        connection: context.configVars["API Connection"],
        cursor: payload.paginationState?.cursor,
      });
      return { items: data.users as User[], paginationState: data.nextCursor ? { cursor: data.nextCursor } : null };
    },
    // One-time on deploy: read the full USERS table (a different source than the change feed)
    onDeploy: async (context, payload) => {
      const { data } = await httpClient.listAllUsers.perform({
        connection: context.configVars["API Connection"],
        cursor: payload.paginationState?.cursor,
      });
      return { items: data.users as User[], paginationState: data.nextCursor ? { cursor: data.nextCursor } : null };
    },
  }),
  onExecution: async (context, params) => {
    const users = params.onTrigger.results.body.data as User[];
    return { data: { count: users.length } };
  },
});
```

For a **webhook** flow the same `onDeploy` fire is how you do an initial sync at all — the webhook
only delivers go-forward events, so historical records must be pulled once on deploy.

---

## Example 4: Webhook array-splitting

A webhook delivers an array in one push; split it into per-batch executions. The push itself is a
single payload, so `onTrigger` returns just `items` (no pagination). If this flow also needs an
initial historical sync, that goes in an `onDeploy` fire — which *does* paginate (see Example 3),
since the webhook only delivers go-forward events.

```typescript
export const splitWebhookBatch = flow({
  name: "Split Webhook Batch",
  stableKey: "split-webhook-batch",
  description: "Splits an array webhook payload into per-record executions",
  // one execution per record in the pushed array, at most 5 at once
  batchConfig: { batchSize: 1, concurrentBatchLimit: 5 },
  trigger: batchFlowTrigger<Order>({
    onTrigger: async (context, payload) => {
      const body = payload.body.data as unknown as { orders: Order[] };
      return { items: body.orders };
    },
  }),
  onExecution: async (context, params) => {
    const order = params.onTrigger.results.body.data as Order;
    return { data: order.id };
  },
});
```

---

## Anti-patterns

The batched-flow wrong/right pairs live in [code-anti-patterns.md](../code-anti-patterns.md) →
"Trigger Configuration": `batchconfig-without-batched-trigger`, `flat-ontrigger-on-batched-flow`,
`unbounded-batch-concurrency`, and `hand-rolled-chunking-in-onexecution`.

## Choosing `batchSize`

| Goal | batchSize | onExecution receives |
|------|-----------|----------------------|
| Strongest isolation, one unit of work per record | `1` | a single `TItem` |
| Fewer executions, bulk operations that accept arrays | `> 1` (e.g. 25–100) | `TItem[]` (up to batchSize) |

A failure retries only the affected batch — so smaller batches localize failures at the cost of
more executions. Use `concurrentBatchLimit` to respect downstream rate limits.

## Related Documentation

- [Answer-to-Code Cookbook](../answer-to-code-cookbook.md) - "answer: batch_config → `flow.batchConfig` / `batchFlowTrigger`"
- [Spectral Types](../spectral-types.md) - `BatchFlow`, `BatchConfig`, `BatchTrigger` shapes
- [Code Generation Guide](../code-generation-guide.md) - Trigger Decision Tree
- [Flows](https://prismatic.io/docs/integrations/code-native/flows.md) - Platform documentation
