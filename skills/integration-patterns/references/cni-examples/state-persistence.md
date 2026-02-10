# State Persistence in Prismatic Integrations

## Overview

Prismatic provides four levels of persisted state to maintain data across execution cycles. Understanding when and how to use each type is critical for building reliable, stateful integrations.

**State Types:**

1. **Execution State** (`executionState`) - Temporary scratch space within single execution
2. **Flow State** (`instanceState`) - Persisted per-flow across executions
3. **Cross-Flow State** (`crossFlowState`) - Shared across all flows in instance
4. **Integration State** (`integrationState`) - Shared across all instances

---

## Validate State Types Against Spectral SDK

Before writing state-related code, **read the actual type definitions** from the Spectral SDK:

```
<integration-dir>/node_modules/@prismatic-io/spectral/dist/types/ActionPerformFunction.d.ts
```

This file defines the `ActionContext` type which includes all state objects. Key things to verify:

- State objects are `Record<string, unknown>` - plain objects, NOT objects with methods
- Which state types are available in which contexts (e.g., `instanceState` is NOT available in `onInstanceDeploy`)
- Return type structure for including state updates in results

**Never assume** state access patterns - always verify against the SDK types.

---

## State Types (from Spectral SDK)

All state objects are typed as `Record<string, unknown>`. This means:

- They are plain JavaScript objects
- They do NOT have `.get()` or `.set()` methods
- Access values with bracket notation: `state["key"]`
- Values are `unknown` and require type assertions when reading

---

## Table of Contents

1. [State Types Comparison](#state-types-comparison)
2. [State Access Patterns](#state-access-patterns)
3. [Execution State](#execution-state)
4. [Flow State (instanceState)](#flow-state-instancestate)
5. [Cross-Flow State](#cross-flow-state)
6. [Integration State](#integration-state)
7. [Critical Limitations](#critical-limitations)
8. [Best Practices](#best-practices)
9. [Common Patterns](#common-patterns)
10. [When to Use External Storage](#when-to-use-external-storage)

---

## State Types Comparison

| State Type            | Scope                 | Persistence               | Size Limit     | Use Case                                                    |
| --------------------- | --------------------- | ------------------------- | -------------- | ----------------------------------------------------------- |
| **Execution State**   | Single execution      | Until execution completes | 64 MB combined | Temporary accumulators, loop counters, intermediate results |
| **Flow State**        | Single flow           | Across all executions     | 64 MB combined | Flow-specific cursors, last sync time, flow counters        |
| **Cross-Flow State**  | All flows in instance | Across all executions     | 64 MB combined | Shared data, webhook URLs, account metadata                 |
| **Integration State** | All instances         | Across all executions     | 64 MB combined | Global routing tables, shared configuration                 |

**⚠️ CRITICAL:** Combined size across ALL three persistence types (flow + cross-flow + integration) cannot exceed 64 MB per instance.

---

## State Access Patterns

### Reading State

State objects are `Record<string, unknown>`, so values must be type-asserted when reading:

```typescript
// Reading with type assertion
const cursor = instanceState["cursor"] as string | undefined;
const count = instanceState["count"] as number | undefined;
const items = instanceState["items"] as string[] | undefined;
const config = instanceState["config"] as { apiUrl: string } | undefined;

// With default values (recommended)
const cursor = (instanceState["cursor"] as string) ?? "0";
const count = (instanceState["count"] as number) ?? 0;
const items = (instanceState["items"] as string[]) ?? [];
```

### Writing State

Assign values directly to state object properties:

```typescript
// Writing values
instanceState["cursor"] = "abc123";
instanceState["count"] = 42;
instanceState["items"] = ["a", "b", "c"];
instanceState["config"] = { apiUrl: "https://api.example.com" };

// Deleting values (set to undefined or delete)
instanceState["oldKey"] = undefined;
delete instanceState["oldKey"];
```

### Alternative: Return State in Result

You can also return state updates in the action/trigger return value:

```typescript
return {
  data: result,
  instanceState: {
    cursor: newCursor,
    lastSyncTime: now,
  },
  crossFlowState: {
    webhookId: registeredWebhookId,
  },
};
```

---

## Execution State

### Purpose

Temporary scratch space for accumulating data, building lists, or tracking progress within a single execution. Automatically cleared when execution completes.

### Lifecycle

1. **Initialization**: Empty object `{}` at execution start
2. **Runtime**: Modify freely within execution
3. **Completion**: Lost forever after execution completes

### Access Pattern

```typescript
import { flow } from "@prismatic-io/spectral";

export const myFlow = flow({
  name: "Process Items",
  stableKey: "process-items",

  onExecution: async (context, params) => {
    const { executionState, logger } = context;

    // Initialize counters (typed access)
    executionState["successCount"] = 0;
    executionState["errorCount"] = 0;
    executionState["processedIds"] = [] as string[];

    const items = params.onTrigger.results.body.data as Array<{ id: string }>;

    // Process items
    for (const item of items) {
      try {
        await processItem(item);
        (executionState["successCount"] as number)++;
        (executionState["processedIds"] as string[]).push(item.id);
      } catch (error) {
        (executionState["errorCount"] as number)++;
        logger.error(
          `Failed to process ${item.id}: ${(error as Error).message}`,
        );
      }
    }

    const successCount = executionState["successCount"] as number;
    const errorCount = executionState["errorCount"] as number;
    const processedIds = executionState["processedIds"] as string[];

    logger.info(`Processed ${successCount} items successfully`);
    logger.info(`Failed: ${errorCount} items`);

    return {
      data: {
        success: successCount,
        failed: errorCount,
        processedIds,
      },
    };
  },
});
```

### When to Use

✅ **Use execution state for:**

- Loop counters and accumulators
- Building lists during processing
- Temporary flags or markers
- Intermediate calculation results
- Single-execution tracking

❌ **Don't use execution state for:**

- Data needed in next execution
- Information to share with other flows
- Persistent tracking (cursors, timestamps)

---

## Flow State (instanceState)

### Purpose

Persistent storage specific to a single flow. Each flow has its own isolated state that persists across executions. Other flows cannot access this state.

### Lifecycle

1. **Initialization**: Load from storage at execution start
2. **Runtime**: Read/write during execution
3. **Completion**: Changes persist to storage if execution succeeds
4. **Failure**: Changes are NOT saved if execution fails

### Access Pattern

```typescript
import { flow } from "@prismatic-io/spectral";

export const incrementalSyncFlow = flow({
  name: "Incremental Data Sync",
  stableKey: "incremental-sync",

  onExecution: async (context, params) => {
    const { instanceState, logger } = context;

    // Read last sync cursor with type assertions and defaults
    const lastCursor = (instanceState["syncCursor"] as string) ?? "0";
    const lastSyncTime = (instanceState["lastSyncTime"] as string) ?? "never";

    logger.info(`Last sync: ${lastSyncTime}, cursor: ${lastCursor}`);

    // Fetch records since last cursor
    const newRecords = await fetchRecordsSince(lastCursor);

    logger.info(`Found ${newRecords.length} new records`);

    // Process records...
    for (const record of newRecords) {
      await processRecord(record);
    }

    // Update cursor (direct property assignment)
    const newCursor = newRecords[newRecords.length - 1]?.id ?? lastCursor;
    const now = new Date().toISOString();

    instanceState["syncCursor"] = newCursor;
    instanceState["lastSyncTime"] = now;

    const previousCount = (instanceState["recordsProcessed"] as number) ?? 0;
    instanceState["recordsProcessed"] = previousCount + newRecords.length;

    logger.info(`Updated cursor to ${newCursor}`);

    return { data: { processed: newRecords.length, cursor: newCursor } };
  },
});
```

### State Access Methods

```typescript
// Read value with type assertion (returns undefined if doesn't exist)
const value = instanceState["key"] as string | undefined;

// Read with default value
const cursor = (instanceState["cursor"] as string) ?? "0";
const count = (instanceState["count"] as number) ?? 0;
const items = (instanceState["items"] as string[]) ?? [];

// Write value (any JSON-serializable type)
instanceState["key"] = "value";
instanceState["count"] = 42;
instanceState["data"] = { foo: "bar" };
instanceState["list"] = [1, 2, 3];

// Delete value
instanceState["key"] = undefined;
// or
delete instanceState["key"];

// Alternative: Return state in result
return {
  data: result,
  instanceState: {
    syncCursor: newCursor,
    lastSyncTime: now,
  },
};
```

### When to Use

✅ **Use flow state for:**

- Sync cursors for incremental data fetching
- Last execution timestamp
- Flow-specific counters or metrics
- Processing checkpoints
- Flow-specific configuration cache

❌ **Don't use flow state for:**

- Data other flows need
- Shared webhook URLs
- Instance-level configuration
- Concurrent execution scenarios

### Concurrency Behavior

**⚠️ RACE CONDITION:** If same flow runs concurrently (manual trigger during scheduled run), the last flow to complete overwrites ALL state.

**Example of data loss:**

```typescript
// Execution A starts
instanceState["key1"] = "valueA";
// Execution B starts (concurrent)
instanceState["key2"] = "valueB";
// Execution A completes - saves { key1: "valueA" }
// Execution B completes - saves { key2: "valueB" } - key1 is LOST!
```

**Solution:** Prevent concurrent execution or use external storage for concurrent scenarios.

---

## Cross-Flow State

### Purpose

Shared storage accessible by ALL flows in an instance. Use for data that multiple flows need to coordinate or share.

### Lifecycle

Same as flow state, but shared across all flows in instance.

### Access Pattern

```typescript
import { flow } from "@prismatic-io/spectral";

// Flow 1: Webhook receiver stores data
export const webhookReceiverFlow = flow({
  name: "Webhook Receiver",
  stableKey: "webhook-receiver",

  onInstanceDeploy: async (context) => {
    // Store webhook URL for other flows
    const webhookUrl = context.webhookUrls["webhook-receiver"];
    context.crossFlowState["webhookUrl"] = webhookUrl;

    // Return state update (alternative approach)
    return {
      crossFlowState: {
        webhookUrl,
        deployedAt: new Date().toISOString(),
      },
    };
  },

  onExecution: async (context, params) => {
    const payload = params.onTrigger.results.body.data;

    // Store latest webhook data for other flows
    context.crossFlowState["lastWebhookPayload"] = payload;
    context.crossFlowState["lastWebhookTime"] = new Date().toISOString();

    return { data: payload };
  },
});

// Flow 2: Scheduled processor uses webhook data
export const scheduledProcessorFlow = flow({
  name: "Process Webhook Data",
  stableKey: "scheduled-processor",

  onExecution: async (context, params) => {
    const { crossFlowState, logger } = context;

    // Read data stored by webhook receiver flow (with type assertions)
    const lastPayload = crossFlowState["lastWebhookPayload"] as
      | Record<string, unknown>
      | undefined;
    const lastTime = crossFlowState["lastWebhookTime"] as string | undefined;
    const webhookUrl = crossFlowState["webhookUrl"] as string | undefined;

    if (!lastPayload) {
      logger.info("No webhook data available yet");
      return { data: null };
    }

    logger.info(`Processing webhook from ${lastTime}`);
    logger.info(`Webhook URL: ${webhookUrl}`);

    // Process shared data...

    return { data: { processed: true } };
  },
});
```

### Common Use Cases

✅ **Use cross-flow state for:**

- Webhook URLs (from context.webhookUrls in onInstanceDeploy)
- Account metadata fetched during deployment
- Shared configuration derived from user input
- Instance-level counters or metrics
- Coordination flags between flows

❌ **Don't use cross-flow state for:**

- Flow-specific cursors (use flow state)
- Data shared across instances (use integration state)
- Frequently updated data in concurrent flows (race conditions)

### Concurrency Behavior

**⚠️ CRITICAL RACE CONDITION:** State is written in its entirety, not key-by-key.

**Example of data loss:**

```typescript
// Flow A execution starts
crossFlowState["keyA"] = "valueA";
// Flow B execution starts (concurrent)
crossFlowState["keyB"] = "valueB";
// Flow A completes - saves { keyA: "valueA" }
// Flow B completes - saves { keyB: "valueB" } - keyA is LOST!
```

**Solutions:**

1. **Avoid concurrent updates** - Design flows to not modify same state concurrently
2. **Use external storage** - DynamoDB, Redis, database for concurrent scenarios
3. **Read-modify-write pattern** - Read all state, modify, write back (still has race condition window)

---

## Integration State

### Purpose

Shared storage accessible by ALL instances of an integration across ALL customers. Rarely used, but powerful for global coordination.

### Lifecycle

Same as flow/cross-flow state, but shared across ALL instances.

### Access Pattern

```typescript
import { flow } from "@prismatic-io/spectral";

interface InstanceInfo {
  lastSeen: string;
  capacity: number;
}

interface RoutingTable {
  [instanceId: string]: InstanceInfo;
}

export const routingFlow = flow({
  name: "Route to Available Instance",
  stableKey: "routing-flow",

  onExecution: async (context, params) => {
    const { integrationState, instance, logger } = context;
    const instanceId = instance.id;

    // Register this instance in global routing table
    const routingTable =
      (integrationState["routingTable"] as RoutingTable) ?? {};
    routingTable[instanceId] = {
      lastSeen: new Date().toISOString(),
      capacity: 100,
    };

    integrationState["routingTable"] = routingTable;

    logger.info(`Registered instance ${instanceId} in global routing table`);

    // Find least-loaded instance
    const instances = Object.entries(routingTable);
    const leastLoaded = instances.reduce(
      (min, [id, info]) =>
        info.capacity < min.capacity ? { id, ...info } : min,
      { id: "", capacity: Infinity, lastSeen: "" },
    );

    logger.info(`Routing to instance ${leastLoaded.id}`);

    return { data: { targetInstance: leastLoaded.id } };
  },
});
```

### When to Use

✅ **Use integration state for:**

- Global routing tables
- Cross-customer coordination
- Shared metadata mapping (e.g., timezone → region)
- Integration-wide configuration
- Global counters or metrics

❌ **Don't use integration state for:**

- Customer-specific data (security risk!)
- Large datasets (size limits)
- Frequently updated data (race conditions)

### Security Consideration

**⚠️ SECURITY WARNING:** All instances (all customers) can read/write integration state. Never store customer-specific sensitive data here.

---

## Critical Limitations

### 1. Total Size Limit: 64 MB

**Combined size** across all three persistence types (flow + cross-flow + integration) cannot exceed 64 MB per instance.

**Error when exceeded:**

```
Unable to complete execution, persisted state exceeded maximum limit of 67108864 bytes.
```

**Solutions:**

- Use external storage for large data (S3, database, Redis)
- Paginate and store only references/metadata in state
- Clean up old data periodically
- Monitor state size growth

---

### 2. Concurrency Race Conditions

**Problem:** State is written in its entirety, not key-by-key.

**Scenario 1: Two flows modifying different keys**

```typescript
// Flow A modifies keyA, Flow B modifies keyB (concurrent)
// Whichever completes last wins, the other's changes are LOST
```

**Scenario 2: Two webhook handlers adding to list**

```typescript
// Handler 1: Adds item to list
const items = (crossFlowState["items"] as string[]) ?? [];
items.push("item1");
crossFlowState["items"] = items;

// Handler 2: Adds item to list (concurrent)
const items2 = (crossFlowState["items"] as string[]) ?? []; // Reads before Handler 1 saves
items2.push("item2");
crossFlowState["items"] = items2; // Overwrites Handler 1's change - item1 LOST!
```

**Solutions:**

- **Design for sequential execution** - Use flow scheduling to prevent overlap
- **Use external storage** - DynamoDB, Redis, PostgreSQL with proper locking
- **FIFO queues** - For order-dependent processing
- **Idempotent operations** - Design so re-running is safe

---

### 3. Failed Executions Don't Save State

**Problem:** State changes are only persisted if execution succeeds.

```typescript
onExecution: async (context, params) => {
  context.crossFlowState["cursor"] = "new-value";

  // Do some processing...

  throw new Error("Processing failed");
  // State change is NOT saved because execution failed
};
```

**Solution:** Commit state at safe checkpoints:

```typescript
onExecution: async (context, params) => {
  const batches = getBatches();

  // Process in batches, save after each batch
  for (const batch of batches) {
    await processBatch(batch);

    // Save progress after each successful batch
    context.crossFlowState["lastProcessedBatch"] = batch.id;

    // If next batch fails, we can resume from here
  }
};
```

---

### 4. Cross-Flow Triggers Can't Share State

**Problem:** Invoked flow starts before invoker completes, so state isn't saved yet.

```typescript
// Flow A: Invokes Flow B
context.crossFlowState["data"] = "important";
await context.invokeFlow("flow-b"); // Flow B starts
// Flow B can't see "data" because Flow A hasn't completed yet
```

**Solution:** Pass data as trigger parameters:

```typescript
// Flow A: Pass data to Flow B
await context.invokeFlow("flow-b", {
  data: "important",
  // Other parameters...
});

// Flow B: Receives data directly
onExecution: async (context, params) => {
  const data = params.onTrigger.results.body.data; // Available immediately
};
```

---

## Best Practices

### 1. Choose the Right State Type

```typescript
// ✅ CORRECT usage
onExecution: async (context, params) => {
  // Execution state: Temporary counter within this execution
  context.executionState["processedCount"] = 0;

  // Flow state: This flow's sync cursor
  const cursor = (context.instanceState["cursor"] as string) ?? "0";

  // Cross-flow state: Shared webhook URL from onInstanceDeploy
  const webhookUrl = context.crossFlowState["webhookUrl"] as string | undefined;

  // Integration state: Global routing table
  const routing = context.integrationState["routingTable"] as
    | Record<string, unknown>
    | undefined;
};

// ❌ WRONG usage
onExecution: async (context, params) => {
  // ❌ Using cross-flow state for flow-specific cursor (pollutes shared state)
  const cursor = context.crossFlowState["flowACursor"];

  // ❌ Using execution state for data needed next time (will be lost)
  context.executionState["syncCursor"] = newCursor;

  // ❌ Using integration state for customer data (security risk!)
  context.integrationState["customerApiKey"] = apiKey;
};
```

---

### 2. Initialize State in onInstanceDeploy

```typescript
import { flow } from "@prismatic-io/spectral";

export const myFlow = flow({
  name: "My Flow",
  stableKey: "my-flow",

  onInstanceDeploy: async (context) => {
    const { crossFlowState, logger } = context;

    // Check if already initialized (re-deployment)
    const existingCursor = crossFlowState["cursor"] as string | undefined;

    if (!existingCursor) {
      // Fresh deployment - initialize
      crossFlowState["cursor"] = Date.now().toString();
      crossFlowState["lastSyncTime"] = new Date().toISOString();
      crossFlowState["recordsProcessed"] = 0;

      logger.info("Initialized state for fresh deployment");
    } else {
      // Re-deployment - preserve existing state
      logger.info(`Preserving existing cursor: ${existingCursor}`);
    }
  },

  onExecution: async (context, params) => {
    // State guaranteed to be initialized
    const cursor = context.crossFlowState["cursor"] as string;
    // ...
  },
});
```

---

### 3. Handle Missing State Gracefully

```typescript
onExecution: async (context, params) => {
  // Always provide defaults for missing state
  const cursor = (context.instanceState["cursor"] as string) ?? "0";
  const count = (context.instanceState["count"] as number) ?? 0;
  const items = (context.instanceState["items"] as string[]) ?? [];

  // Or check explicitly
  const lastSync = context.instanceState["lastSyncTime"] as string | undefined;
  if (!lastSync) {
    context.logger.info("No previous sync, starting fresh");
    // Initialize...
  }
};
```

---

### 4. Clean Up Old State

```typescript
onExecution: async (context, params) => {
  const { crossFlowState, logger } = context;

  // Remove old webhook payloads to prevent size bloat
  const lastWebhookTime = crossFlowState["lastWebhookTime"] as
    | string
    | undefined;
  const hourAgo = Date.now() - 3600000;

  if (lastWebhookTime && new Date(lastWebhookTime).getTime() < hourAgo) {
    crossFlowState["lastWebhookPayload"] = undefined; // Delete
    logger.info("Cleaned up old webhook payload");
  }

  // Trim lists that grow unbounded
  const recentItems = (crossFlowState["recentItems"] as string[]) ?? [];
  if (recentItems.length > 100) {
    crossFlowState["recentItems"] = recentItems.slice(-100);
    logger.info("Trimmed recent items list");
  }
};
```

---

### 5. Monitor State Size

```typescript
onExecution: async (context, params) => {
  // Periodically log state size for monitoring
  const stateSnapshot = {
    cursor: context.instanceState["cursor"],
    items: context.instanceState["items"],
    // ... other keys
  };

  const sizeEstimate = JSON.stringify(stateSnapshot).length;
  context.logger.info(`State size estimate: ${sizeEstimate} bytes`);

  if (sizeEstimate > 1000000) {
    // 1 MB
    context.logger.warn("State size approaching limits");
  }
};
```

---

## Common Patterns

### Pattern 1: Incremental Synchronization

**Use Case:** Sync only new/changed records since last execution

```typescript
import { flow } from "@prismatic-io/spectral";

export const incrementalSyncFlow = flow({
  name: "Incremental Sync",
  stableKey: "incremental-sync",

  onInstanceDeploy: async (context) => {
    // Initialize cursor on first deployment (use crossFlowState in lifecycle hooks)
    const existing = context.crossFlowState["cursor"] as string | undefined;
    if (!existing) {
      context.crossFlowState["cursor"] = Date.now().toString();
      context.crossFlowState["lastSyncTime"] = new Date().toISOString();
    }
  },

  onExecution: async (context, params) => {
    const { instanceState, crossFlowState, logger } = context;

    // Get cursor - prefer instanceState, fallback to crossFlowState (from deploy)
    const cursor =
      (instanceState["cursor"] as string) ??
      (crossFlowState["cursor"] as string) ??
      "0";
    const lastSync =
      (instanceState["lastSyncTime"] as string) ??
      (crossFlowState["lastSyncTime"] as string) ??
      "never";

    logger.info(`Syncing changes since ${lastSync} (cursor: ${cursor})`);

    // Fetch only new records
    const newRecords = await fetchRecordsSince(cursor);

    logger.info(`Found ${newRecords.length} new records`);

    // Process records...
    for (const record of newRecords) {
      await processRecord(record);
    }

    // Update cursor for next execution
    const newCursor = newRecords[newRecords.length - 1]?.cursor ?? cursor;
    instanceState["cursor"] = newCursor;
    instanceState["lastSyncTime"] = new Date().toISOString();

    logger.info(`Updated cursor to ${newCursor}`);

    return { data: { synced: newRecords.length } };
  },
});
```

---

### Pattern 2: Coordinated Multi-Flow Processing

**Use Case:** Multiple flows need to share data and coordinate

```typescript
import { flow } from "@prismatic-io/spectral";

interface QueuedEvent {
  id: string;
  timestamp: string;
  data: Record<string, unknown>;
}

// Flow 1: Webhook receiver stores events
export const eventReceiverFlow = flow({
  name: "Event Receiver",
  stableKey: "event-receiver",

  onExecution: async (context, params) => {
    const event = params.onTrigger.results.body.data as { id: string };

    // Add event to processing queue (cross-flow state)
    const queue = (context.crossFlowState["eventQueue"] as QueuedEvent[]) ?? [];
    queue.push({
      id: event.id,
      timestamp: new Date().toISOString(),
      data: event,
    });

    // Keep queue from growing unbounded
    const trimmed = queue.slice(-1000); // Keep last 1000 events

    context.crossFlowState["eventQueue"] = trimmed;
    context.crossFlowState["lastEventTime"] = new Date().toISOString();

    context.logger.info(
      `Added event ${event.id} to queue, size: ${trimmed.length}`,
    );

    return { data: { queued: event.id } };
  },
});

// Flow 2: Scheduled processor handles queued events
export const eventProcessorFlow = flow({
  name: "Event Processor",
  stableKey: "event-processor",

  onExecution: async (context, params) => {
    const { crossFlowState, logger } = context;

    // Get events from queue
    const queue = (crossFlowState["eventQueue"] as QueuedEvent[]) ?? [];

    if (queue.length === 0) {
      logger.info("No events to process");
      return { data: null };
    }

    logger.info(`Processing ${queue.length} queued events`);

    // Process all events
    const processedIds: string[] = [];
    for (const event of queue) {
      try {
        await processEvent(event.data);
        processedIds.push(event.id);
      } catch (error) {
        logger.error(
          `Failed to process event ${event.id}: ${(error as Error).message}`,
        );
      }
    }

    // Clear processed events from queue
    crossFlowState["eventQueue"] = [];
    crossFlowState["lastProcessedTime"] = new Date().toISOString();

    logger.info(`Processed ${processedIds.length} events`);

    return { data: { processed: processedIds } };
  },
});
```

---

### Pattern 3: Caching Expensive Lookups

**Use Case:** Cache API responses to avoid repeated calls

```typescript
import { flow } from "@prismatic-io/spectral";

interface Category {
  id: string;
  name: string;
}

export const dataFetchFlow = flow({
  name: "Fetch Data with Cache",
  stableKey: "fetch-data",

  onExecution: async (context, params) => {
    const { crossFlowState, logger } = context;

    // Check cache
    const cached = crossFlowState["categoryCache"] as Category[] | undefined;
    const cacheTime = crossFlowState["cacheTimestamp"] as number | undefined;
    const cacheAge = Date.now() - (cacheTime ?? 0);

    // Cache valid for 1 hour
    if (cached && cacheAge < 3600000) {
      logger.info("Using cached category data");
      return { data: cached };
    }

    // Cache miss or expired - fetch fresh data
    logger.info("Cache miss, fetching fresh category data");
    const categories = await fetchCategoriesFromAPI();

    // Update cache
    crossFlowState["categoryCache"] = categories;
    crossFlowState["cacheTimestamp"] = Date.now();

    logger.info("Updated category cache");

    return { data: categories };
  },
});
```

---

### Pattern 4: Rate Limiting with State

**Use Case:** Track API calls to respect rate limits

```typescript
import { flow } from "@prismatic-io/spectral";

export const rateLimitedFlow = flow({
  name: "Rate Limited API Calls",
  stableKey: "rate-limited",

  onExecution: async (context, params) => {
    const { instanceState, logger } = context;

    // Get current rate limit state
    const callCount = (instanceState["apiCallCount"] as number) ?? 0;
    const windowStart =
      (instanceState["rateLimitWindowStart"] as number) ?? Date.now();

    const now = Date.now();
    const windowDuration = 60000; // 1 minute window
    const maxCallsPerWindow = 100;

    // Check if we're in a new window
    if (now - windowStart > windowDuration) {
      // New window - reset counter
      instanceState["apiCallCount"] = 0;
      instanceState["rateLimitWindowStart"] = now;
      logger.info("Started new rate limit window");
    } else if (callCount >= maxCallsPerWindow) {
      // Rate limit exceeded - wait until new window
      const waitTime = windowDuration - (now - windowStart);
      logger.warn(`Rate limit reached, waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Reset for new window
      instanceState["apiCallCount"] = 0;
      instanceState["rateLimitWindowStart"] = Date.now();
    }

    // Make API call
    const result = await makeAPICall();

    // Increment counter
    const currentCount = (instanceState["apiCallCount"] as number) ?? 0;
    instanceState["apiCallCount"] = currentCount + 1;

    logger.info(
      `API call ${currentCount + 1}/${maxCallsPerWindow} in current window`,
    );

    return { data: result };
  },
});
```

---

## When to Use External Storage

State persistence is convenient but has limitations. Use external storage when you need:

### ✅ Use External Storage For

**1. Large Data (> 1 MB)**

- Files (PDFs, images, videos) → S3, Google Drive, Dropbox
- Large datasets → Database, data warehouse
- Binary data → Object storage

**2. High Concurrency**

- Frequent concurrent updates → Database with transactions
- Order-dependent processing → FIFO queues (SQS, RabbitMQ)
- Real-time collaboration → Redis, DynamoDB

**3. Complex Queries**

- Searching/filtering → Elasticsearch, database
- Relationships → Relational database (PostgreSQL, MySQL)
- Analytics → Data warehouse (BigQuery, Redshift)

**4. Transactional Consistency**

- Atomic operations → Database with ACID guarantees
- Multi-step updates → Database transactions
- Rollback capability → Database with transaction support

**5. Cross-Instance Coordination** (Beyond Integration State)

- Load balancing → Redis, database
- Distributed locking → Redis, ZooKeeper
- Shared queues → SQS, RabbitMQ

### Example: Using DynamoDB for Concurrent State

```typescript
import { flow } from "@prismatic-io/spectral";
import { DynamoDB } from "aws-sdk";

const dynamodb = new DynamoDB.DocumentClient();

export const concurrentFlow = flow({
  name: "Concurrent Safe Flow",
  stableKey: "concurrent-flow",

  onExecution: async (context, params) => {
    const { instance, logger } = context;
    const instanceId = instance.id;

    // Use DynamoDB for concurrent-safe storage
    const tableName = "integration-state";

    // Atomic increment with DynamoDB
    const result = await dynamodb
      .update({
        TableName: tableName,
        Key: { instanceId },
        UpdateExpression: "ADD processedCount :inc",
        ExpressionAttributeValues: { ":inc": 1 },
        ReturnValues: "UPDATED_NEW",
      })
      .promise();

    const processedCount = result.Attributes?.processedCount as number;
    logger.info(`Processed count: ${processedCount}`);

    // No race condition - DynamoDB handles concurrency
    return { data: { count: processedCount } };
  },
});
```

---

## Additional Resources

- **Lifecycle Events**: [lifecycle-events.md](lifecycle-events.md)
- **Multi-Flow Patterns**: [multi-flow.md](multi-flow.md)
- **Error Handling**: [error-handling.md](error-handling.md)
- **Prismatic Docs**: <https://prismatic.io/docs/integrations/persist-data/>

---

## Summary

**State Type Decision Tree:**

```
Need data in next execution?
  ├─ No → Use Execution State (temporary)
  └─ Yes → Need to share with other flows?
      ├─ No → Use Flow State (flow-specific)
      └─ Yes → Need across all instances?
          ├─ No → Use Cross-Flow State (instance-shared)
          └─ Yes → Use Integration State (global) OR External Storage
```

**Key Takeaways:**

- ✅ **Execution State**: Temporary scratch space within execution
- ✅ **Flow State**: Flow-specific persistence across executions
- ✅ **Cross-Flow State**: Shared across flows in instance
- ✅ **Integration State**: Shared across all instances (use carefully)

**TypeScript Access Patterns:**

```typescript
// All state objects are Record<string, unknown>

// Reading (with type assertion and default)
const cursor = (instanceState["cursor"] as string) ?? "0";

// Writing (direct assignment)
instanceState["cursor"] = newCursor;

// Alternative: Return in result
return { data: result, instanceState: { cursor: newCursor } };
```

**Critical Limitations:**

- ⚠️ **64 MB combined limit** across all persistence types
- ⚠️ **Race conditions** with concurrent executions (state written entirely)
- ⚠️ **Failed executions don't save** state changes
- ⚠️ **Cross-flow triggers** can't access invoker's unsaved state

**When in doubt:**

- Start with Flow State for flow-specific data
- Use Cross-Flow State for coordination between flows
- Use External Storage for large data, concurrency, or complex queries
- Initialize state in `onInstanceDeploy` for predictable behavior
