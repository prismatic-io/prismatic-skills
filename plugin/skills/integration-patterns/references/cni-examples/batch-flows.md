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
- `paginationState` replaces manual `instanceState` cursor tracking
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
5. `concurrentBatchLimit` (optional) caps how many batches of a single fire run concurrently.

**Constraints:**

- `batchConfig` present **requires** a batched `trigger`. The flat `onTrigger`/`onDeployTrigger`
  are **forbidden** — the fire lives inside the trigger.
- `batchSize` must be an integer ≥ 1; `concurrentBatchLimit` an integer ≥ 1 when set. Invalid
  values throw at build.
- A batched flow still needs a fire source: a `schedule` (periodic pull, most common) or a
  webhook (split an incoming array).

---

## Example 1: Paginating scheduled sync (per-item executions)

Fetch orders page by page; dispatch each order as its own execution.

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
  batchConfig: { batchSize: 1 }, // one execution per order — strongest isolation
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

## Example 3: Initial-deploy backfill (`onDeploy`)

`onDeploy` runs once when the instance is first deployed — page through existing history so the
destination starts synced, then `onTrigger` handles only new records going forward.

```typescript
export const syncWithBackfill = flow({
  name: "Sync With Backfill",
  stableKey: "sync-with-backfill",
  schedule: { value: "*/15 * * * *" },
  batchConfig: { batchSize: 25 },
  trigger: batchFlowTrigger<Order, { cursor: string }>({
    // Ongoing: only records since the last run
    onTrigger: async (context, payload) => {
      const { data } = await httpClient.getOrders.perform({
        connection: context.configVars["API Connection"],
        cursor: payload.paginationState?.cursor,
        since: "now",
      });
      return { items: data.orders as Order[], paginationState: data.nextCursor ? { cursor: data.nextCursor } : null };
    },
    // One-time on deploy: page through everything that already exists
    onDeploy: async (context, payload) => {
      const { data } = await httpClient.getOrders.perform({
        connection: context.configVars["API Connection"],
        cursor: payload.paginationState?.cursor,
        since: "beginning",
      });
      return { items: data.orders as Order[], paginationState: data.nextCursor ? { cursor: data.nextCursor } : null };
    },
  }),
  onExecution: async (context, params) => {
    const orders = params.onTrigger.results.body.data as Order[];
    return { data: { count: orders.length } };
  },
});
```

---

## Example 4: Webhook array-splitting

A webhook delivers an array in one push; split it into per-batch executions. No pagination — a
webhook is a single push, so return just `items`.

```typescript
export const splitWebhookBatch = flow({
  name: "Split Webhook Batch",
  stableKey: "split-webhook-batch",
  description: "Splits an array webhook payload into per-record executions",
  batchConfig: { batchSize: 1 },
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

```typescript
// ❌ batchConfig without a batched trigger — type error and build failure
flow({ batchConfig: { batchSize: 10 }, onExecution: async () => ({ data: null }) });

// ❌ flat onTrigger on a batched flow — forbidden; the fire lives inside `trigger`
flow({
  batchConfig: { batchSize: 10 },
  trigger: batchFlowTrigger({ onTrigger: async () => ({ items: [] }) }),
  onTrigger: async (context, payload) => ({ payload }), // ❌ remove this
  onExecution: async () => ({ data: null }),
});

// ❌ batchSize 0 — must be an integer >= 1; throws at build
batchConfig: { batchSize: 0 }

// ❌ hand-rolling batching inside onExecution when the platform can do it
//    Prefer batchConfig + batchFlowTrigger over manually chunking + looping in onExecution.
```

## Choosing `batchSize`

| Goal | batchSize | onExecution receives |
|------|-----------|----------------------|
| Strongest isolation, one unit of work per record | `1` | a single `TItem` |
| Fewer executions, bulk operations that accept arrays | `> 1` (e.g. 25–100) | `TItem[]` (up to batchSize) |

A failure retries only the affected batch — so smaller batches localize failures at the cost of
more executions. Use `concurrentBatchLimit` to respect downstream rate limits.

## See also

- `references/answer-to-code-cookbook.md` → "answer: batch_config → `flow.batchConfig` / `batchFlowTrigger`"
- `references/spectral-types.md` → "BatchFlow"
- `references/code-generation-guide.md` → "Trigger Decision Tree"
