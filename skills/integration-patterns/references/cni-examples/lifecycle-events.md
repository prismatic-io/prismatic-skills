# Instance Management Lifecycle Events

## Overview

Lifecycle events allow you to execute code when integration instances are deployed or deleted. These hooks enable resource initialization, webhook registration, cleanup operations, and state management across the instance lifecycle.

**Key Concepts:**

- `onInstanceDeploy` - Executes when instance is deployed or re-deployed
- `onInstanceDelete` - Executes when instance is deleted
- Access to instance configuration and webhook URLs
- 30-second execution limit
- Synchronous execution across flows
- Idempotency requirement

---

## When to Use Lifecycle Events

### ✅ Use onInstanceDeploy for

- **Webhook registration** - Tell external systems where to send events
- **Resource initialization** - Create folders, database tables, API resources
- **Configuration validation** - Verify credentials work before activation
- **Initial state setup** - Initialize cross-flow state or integration state
- **External system setup** - Configure third-party services for this instance

### ✅ Use onInstanceDelete for

- **Webhook cleanup** - Unregister webhooks to prevent orphaned calls
- **Resource deletion** - Remove folders, records, or temporary data
- **Connection cleanup** - Revoke tokens or close persistent connections
- **State cleanup** - Clear instance-specific state if needed
- **Notification** - Alert external systems that instance is gone

### ❌ Don't Use Lifecycle Events for

- **Long-running operations** - Over 30 seconds (use Instance Deployed management trigger)
- **Data synchronization** - Initial syncs (use scheduled flow or management trigger)
- **Heavy processing** - Bulk operations (use async flow execution)
- **Non-critical operations** - Things that can fail without blocking deployment

---

## Complete Lifecycle Event Reference

### onInstanceDeploy

**Execution Timing:**

- Runs EVERY time instance is deployed (initial + re-deployments)
- Runs when configuration changes and instance is re-deployed
- Runs synchronously across all flows (order not guaranteed)

**Performance Constraints:**

- **MUST complete within 30 seconds**
- Blocking operation - deployment fails if function errors
- Keep operations fast and focused

**Idempotency Requirement:**

- **MUST be safe to run multiple times**
- Handle case where resources already exist
- Don't fail if "already registered" or "already exists"

**Function Signature:**

```typescript
import { flow } from "@prismatic-io/spectral";

export const myFlow = flow({
  name: "My Flow",
  stableKey: "my-flow",

  onInstanceDeploy: async (context) => {
    const { logger, configVars, webhookUrls, instance } = context;
    const instanceId = instance.id;

    logger.info("Instance deployed - initializing resources");

    // Your initialization code here

    // Best practice: handle idempotency
    try {
      await createResource();
    } catch (error) {
      if ((error as { code?: string }).code === "ALREADY_EXISTS") {
        logger.info("Resource already exists, skipping creation");
      } else {
        throw error;
      }
    }
  },

  onExecution: async (context, params) => {
    // Main flow logic
  },
});
```

**Context Object Properties:**

| Property           | Type                    | Description                                  | Available?                                   |
| ------------------ | ----------------------- | -------------------------------------------- | -------------------------------------------- |
| `logger`           | Logger                  | Logging interface (info, warn, error)        | ✅ Yes                                       |
| `configVars`       | Record<string, any>     | User configuration values                    | ✅ Yes                                       |
| `webhookUrls`      | Record<string, string>  | Webhook URLs for each flow (key = stableKey) | ✅ Yes                                       |
| `instance`         | InstanceAttributes      | Instance attributes (contains `id`)          | ✅ Yes                                       |
| `executionId`      | string                  | Unique execution identifier for this deploy  | ✅ Yes                                       |
| `crossFlowState`   | Record<string, unknown> | Shared state across all flows                | ✅ Yes                                       |
| `integrationState` | Record<string, unknown> | Shared state across all instances            | ✅ Yes                                       |
| `instanceState`    | Record<string, unknown> | Flow-specific state                          | ❌ **NO** - Not available in lifecycle hooks |
| `executionState`   | Record<string, unknown> | Temporary execution state                    | ❌ **NO** - Not available in lifecycle hooks |

**⚠️ CRITICAL:** `instanceState` (flow-specific state) is NOT available in `onInstanceDeploy` or `onInstanceDelete` because these hooks run at the instance level, not flow level. Use `crossFlowState` for shared instance data instead.

---

### onInstanceDelete

**Execution Timing:**

- Runs when instance is deleted (disabled doesn't trigger)
- Runs synchronously across all flows
- Last chance to clean up before instance is removed

**Performance Constraints:**

- **MUST complete within 30 seconds**
- Keep cleanup operations fast
- Log failures but don't block deletion

**Best Practice:**

- Don't throw errors - log and continue
- Deletion should succeed even if cleanup partially fails
- External systems should handle missing webhooks gracefully

**Function Signature:**

```typescript
import { flow } from "@prismatic-io/spectral";

export const myFlow = flow({
  name: "My Flow",
  stableKey: "my-flow",

  onInstanceDelete: async (context) => {
    const { logger, configVars, webhookUrls } = context;

    logger.info("Instance deleted - cleaning up resources");

    // Best practice: don't throw errors, log them
    try {
      await deleteResource();
      logger.info("Successfully cleaned up resources");
    } catch (error) {
      logger.error(`Cleanup failed: ${(error as Error).message}`);
      // Don't throw - allow deletion to proceed
    }
  },

  onExecution: async (context, params) => {
    // Main flow logic
  },
});
```

**Context Object Properties:**

Same as `onInstanceDeploy` - see table above for available properties.

**⚠️ Remember:** `instanceState` and `executionState` are NOT available here either.

---

## 🛑 CRITICAL: When to Use onInstanceDeploy vs onExecution

### Decision Guide

**Use `onInstanceDeploy` for:**

✅ **One-time setup that happens ONCE when instance is created/updated**

- Initial baseline data collection (fetch all existing records once)
- Resource creation (folders, database tables, API resources)
- Webhook registration
- Configuration validation
- Fetching and caching account metadata
- Setting up initial state/cursors

✅ **Setup that should run on every configuration change**

- Re-registering webhooks with new URLs
- Updating external system configuration
- Re-validating new credentials

**Use `onExecution` (flow runs) for:**

✅ **Ongoing, repeated operations**

- Incremental sync (fetch only NEW records since last run)
- Regular data processing
- Scheduled tasks
- Processing individual webhook payloads
- Continuous monitoring or polling

### Example: Initial Baseline Data Collection

**❌ WRONG - Trying to do baseline collection in onExecution:**

```typescript
export const syncFlow = flow({
  onExecution: async (context, params) => {
    const cursor = context.instanceState["cursor"] as string | undefined;

    if (!cursor) {
      // ❌ This runs EVERY execution if something goes wrong
      // ❌ Could re-fetch ALL records multiple times
      const allRecords = await fetchAllRecordsEver(); // Expensive!
      // Process thousands of records...
      context.instanceState["cursor"] = latestCursor;
    } else {
      // Incremental sync
      const newRecords = await fetchRecordsSince(cursor);
    }
  },
});
```

**Problems:**

- If execution fails during baseline, it re-fetches ALL records next time
- Wastes API calls and time on every retry
- Baseline happens during regular flow execution (not deployment)

**✅ CORRECT - Baseline in onInstanceDeploy, incremental in onExecution:**

```typescript
import { flow } from "@prismatic-io/spectral";

export const syncFlow = flow({
  name: "Data Sync",
  stableKey: "data-sync",

  onInstanceDeploy: async (context) => {
    const { logger, crossFlowState } = context;

    logger.info("Initial deployment - collecting baseline data");

    // Check if already done (re-deployment case)
    const baselineComplete = crossFlowState["baselineComplete"] as
      | boolean
      | undefined;

    if (!baselineComplete) {
      // ONE-TIME: Fetch all existing records
      logger.info("Fetching baseline: all existing records");
      const allRecords = await fetchAllRecordsEver();

      logger.info(`Baseline: fetched ${allRecords.length} records`);

      // Process baseline data
      for (const record of allRecords) {
        await processRecord(context, record);
      }

      // Mark baseline as complete and set initial cursor
      const latestCursor = allRecords[allRecords.length - 1]?.id ?? "0";
      crossFlowState["cursor"] = latestCursor;
      crossFlowState["baselineComplete"] = true;
      crossFlowState["baselineTimestamp"] = new Date().toISOString();

      logger.info(`Baseline complete, cursor set to ${latestCursor}`);
    } else {
      logger.info("Baseline already complete, skipping");
    }
  },

  onExecution: async (context, params) => {
    const { logger, instanceState, crossFlowState } = context;

    // ONGOING: Fetch only NEW records since last execution
    // Prefer instanceState, fallback to crossFlowState (from deploy)
    const cursor =
      (instanceState["cursor"] as string) ??
      (crossFlowState["cursor"] as string) ??
      "0";

    logger.info(`Incremental sync from cursor: ${cursor}`);

    const newRecords = await fetchRecordsSince(cursor);

    logger.info(`Found ${newRecords.length} new records`);

    // Process only new records
    for (const record of newRecords) {
      await processRecord(context, record);
    }

    // Update cursor for next execution
    if (newRecords.length > 0) {
      const newCursor = newRecords[newRecords.length - 1].id;
      instanceState["cursor"] = newCursor;
      logger.info(`Updated cursor to ${newCursor}`);
    }

    return { data: { processed: newRecords.length } };
  },
});
```

**Benefits:**

- Baseline happens ONCE during deployment (fast subsequent executions)
- Re-deployment preserves baseline (checks `baselineComplete` flag)
- Incremental sync is lightweight and fast
- Clear separation of concerns

### Example: Resource Initialization

**❌ WRONG - Creating resources in onExecution:**

```typescript
export const fileProcessingFlow = flow({
  onExecution: async (context, params) => {
    const instanceId = context.instance.id;
    // ❌ Tries to create folder every execution
    const folder = await createFolder(instanceId);
    // Process files in folder...
  },
});
```

**Problems:**

- Tries to create folder every execution (fails with "already exists")
- Wastes API calls
- Requires error handling for "already exists" in business logic

**✅ CORRECT - Creating resources in onInstanceDeploy:**

```typescript
import { flow } from "@prismatic-io/spectral";

export const fileProcessingFlow = flow({
  name: "File Processing",
  stableKey: "file-processing",

  onInstanceDeploy: async (context) => {
    const { logger, crossFlowState, instance } = context;
    const instanceId = instance.id;

    logger.info("Creating instance-specific folder");

    try {
      const folder = await createFolder(instanceId);
      crossFlowState["folderPath"] = folder.path;
      logger.info(`Created folder: ${folder.path}`);
    } catch (error) {
      if ((error as { code?: string }).code === "ALREADY_EXISTS") {
        // Re-deployment - folder already exists
        logger.info("Folder already exists, reusing");
        const existingPath = await getFolderPath(instanceId);
        crossFlowState["folderPath"] = existingPath;
      } else {
        throw error;
      }
    }
  },

  onExecution: async (context, params) => {
    const { crossFlowState } = context;

    // Use pre-created folder
    const folderPath = crossFlowState["folderPath"] as string;

    // Process files in folder...
  },
});
```

### Decision Tree

```
Does this operation need to happen repeatedly?
  ├─ YES → Use onExecution
  │   └─ Examples: Incremental sync, processing webhooks, scheduled tasks
  │
  └─ NO → Does it happen once at setup?
      ├─ YES → Use onInstanceDeploy
      │   └─ Examples: Baseline data collection, resource creation, webhook registration
      │
      └─ Is it cleanup when instance is deleted?
          └─ YES → Use onInstanceDelete
              └─ Examples: Unregister webhooks, delete resources, revoke tokens
```

---

## Common Patterns

### Pattern 1: Webhook Registration/Unregistration

**Use Case:** External system needs to know where to send events

```typescript
import { flow } from "@prismatic-io/spectral";
import axios from "axios";

export const webhookFlow = flow({
  name: "Process Webhooks",
  stableKey: "webhook-processor",

  onInstanceDeploy: async (context) => {
    const { logger, configVars, webhookUrls } = context;

    const webhookUrl = webhookUrls["webhook-processor"];
    const apiEndpoint = configVars["API Endpoint"] as string;
    const apiKey = configVars["API Key"] as string;

    logger.info(`Registering webhook at ${webhookUrl}`);

    try {
      await axios.post(
        `${apiEndpoint}/webhooks`,
        {
          url: webhookUrl,
          events: ["order.created", "order.updated"],
        },
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      );

      logger.info("Webhook registered successfully");
    } catch (error) {
      const axiosError = error as { response?: { status: number } };
      if (axiosError.response?.status === 409) {
        // Already registered - update it
        logger.info("Webhook already registered, updating");
        await axios.put(
          `${apiEndpoint}/webhooks/${context.instance.id}`,
          { url: webhookUrl, events: ["order.created", "order.updated"] },
          { headers: { Authorization: `Bearer ${apiKey}` } },
        );
      } else {
        throw error;
      }
    }
  },

  onInstanceDelete: async (context) => {
    const { logger, configVars, instance } = context;
    const instanceId = instance.id;

    const apiEndpoint = configVars["API Endpoint"] as string;
    const apiKey = configVars["API Key"] as string;

    logger.info("Unregistering webhook");

    try {
      await axios.delete(`${apiEndpoint}/webhooks/${instanceId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      logger.info("Webhook unregistered successfully");
    } catch (error) {
      // Don't fail deletion if webhook already gone
      logger.error(`Failed to unregister webhook: ${(error as Error).message}`);
    }
  },

  onTrigger: async (context, payload) => {
    // Handle webhook
    return { payload };
  },

  onExecution: async (context, params) => {
    // Process webhook data
    return { data: params.onTrigger.results };
  },
});
```

---

### Pattern 2: Resource Initialization

**Use Case:** Create folders, database tables, or API resources on deploy

```typescript
import { flow } from "@prismatic-io/spectral";
import { S3 } from "aws-sdk";

export const syncFlow = flow({
  name: "S3 File Sync",
  stableKey: "s3-sync",

  onInstanceDeploy: async (context) => {
    const { logger, configVars, instance, crossFlowState } = context;
    const instanceId = instance.id;

    const s3Client = new S3({
      accessKeyId: configVars["AWS Access Key"] as string,
      secretAccessKey: configVars["AWS Secret Key"] as string,
    });

    const bucketName = configVars["S3 Bucket"] as string;
    const instanceFolder = `instances/${instanceId}`;

    logger.info(`Creating instance folder: ${instanceFolder}`);

    try {
      // Create instance-specific folder in S3
      await s3Client
        .putObject({
          Bucket: bucketName,
          Key: `${instanceFolder}/`,
          Body: "",
        })
        .promise();

      // Store folder path in cross-flow state
      crossFlowState["instanceFolder"] = instanceFolder;

      logger.info("Instance folder created and path stored in state");
    } catch (error) {
      logger.error(`Failed to create folder: ${(error as Error).message}`);
      throw error;
    }
  },

  onInstanceDelete: async (context) => {
    const { logger, configVars, crossFlowState } = context;

    const s3Client = new S3({
      accessKeyId: configVars["AWS Access Key"] as string,
      secretAccessKey: configVars["AWS Secret Key"] as string,
    });

    const bucketName = configVars["S3 Bucket"] as string;
    const instanceFolder = crossFlowState["instanceFolder"] as
      | string
      | undefined;

    if (!instanceFolder) {
      logger.warn("No instance folder found in state");
      return;
    }

    logger.info(`Deleting instance folder: ${instanceFolder}`);

    try {
      // List and delete all objects in folder
      const objects = await s3Client
        .listObjectsV2({
          Bucket: bucketName,
          Prefix: instanceFolder,
        })
        .promise();

      if (objects.Contents && objects.Contents.length > 0) {
        await s3Client
          .deleteObjects({
            Bucket: bucketName,
            Delete: {
              Objects: objects.Contents.map((obj) => ({ Key: obj.Key! })),
            },
          })
          .promise();
      }

      logger.info("Instance folder deleted");
    } catch (error) {
      logger.error(`Failed to delete folder: ${(error as Error).message}`);
    }
  },

  onExecution: async (context, params) => {
    // Use instance folder from cross-flow state
    const instanceFolder = context.crossFlowState["instanceFolder"] as string;
    // Process files...
    return { data: { folder: instanceFolder } };
  },
});
```

---

### Pattern 3: Configuration Validation

**Use Case:** Verify credentials and configuration before instance goes live

```typescript
import { flow } from "@prismatic-io/spectral";
import axios from "axios";

export const apiFlow = flow({
  name: "API Sync",
  stableKey: "api-sync",

  onInstanceDeploy: async (context) => {
    const { logger, configVars, crossFlowState } = context;

    const apiEndpoint = configVars["API Endpoint"] as string;
    const apiKey = configVars["API Key"] as string;

    logger.info("Validating API credentials");

    try {
      // Test API connection
      const response = await axios.get(`${apiEndpoint}/health`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
      });

      if (response.status !== 200) {
        throw new Error(`API health check failed: ${response.status}`);
      }

      logger.info("API credentials validated successfully");

      // Fetch and store account metadata
      const account = await axios.get(`${apiEndpoint}/account`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      crossFlowState["accountId"] = account.data.id;
      crossFlowState["accountName"] = account.data.name;

      logger.info(`Connected to account: ${account.data.name}`);
    } catch (error) {
      logger.error(
        `Configuration validation failed: ${(error as Error).message}`,
      );
      throw new Error(
        `Unable to connect to API. Please check your endpoint and API key.`,
      );
    }
  },

  onExecution: async (context, params) => {
    const accountId = context.crossFlowState["accountId"] as string;
    // Use validated account info...
    return { data: { accountId } };
  },
});
```

---

### Pattern 4: Initial State Setup

**Use Case:** Initialize tracking state for synchronization or cursors

```typescript
import { flow } from "@prismatic-io/spectral";

export const incrementalSyncFlow = flow({
  name: "Incremental Data Sync",
  stableKey: "incremental-sync",

  onInstanceDeploy: async (context) => {
    const { logger, crossFlowState } = context;

    logger.info("Initializing sync state");

    // Check if this is a fresh deployment or re-deployment
    const existingCursor = crossFlowState["syncCursor"] as string | undefined;

    if (!existingCursor) {
      // Fresh deployment - start from now
      const now = new Date().toISOString();
      crossFlowState["syncCursor"] = now;
      crossFlowState["lastSyncTime"] = now;
      crossFlowState["recordsProcessed"] = 0;

      logger.info(`Initialized sync cursor to ${now}`);
    } else {
      // Re-deployment - preserve existing state
      logger.info(`Preserving existing sync cursor: ${existingCursor}`);
    }
  },

  onExecution: async (context, params) => {
    const { logger, crossFlowState } = context;

    // Get cursor from state
    const cursor = crossFlowState["syncCursor"] as string;

    // Fetch records since cursor
    const newRecords = await fetchRecordsSince(cursor);

    // Process records...

    // Update cursor
    const newCursor = new Date().toISOString();
    crossFlowState["syncCursor"] = newCursor;
    crossFlowState["lastSyncTime"] = newCursor;

    const processed = (crossFlowState["recordsProcessed"] as number) ?? 0;
    crossFlowState["recordsProcessed"] = processed + newRecords.length;

    logger.info(
      `Processed ${newRecords.length} records, cursor updated to ${newCursor}`,
    );

    return { data: { processed: newRecords.length } };
  },
});
```

---

### Pattern 5: Multi-Flow Coordination

**Use Case:** Multiple flows need coordinated setup/teardown

```typescript
import { flow } from "@prismatic-io/spectral";

// Flow 1: Webhook receiver
export const webhookReceiverFlow = flow({
  name: "Webhook Receiver",
  stableKey: "webhook-receiver",

  onInstanceDeploy: async (context) => {
    const { logger, webhookUrls, crossFlowState } = context;

    // Store webhook URL for other flows to use
    const webhookUrl = webhookUrls["webhook-receiver"];
    crossFlowState["webhookUrl"] = webhookUrl;

    logger.info(`Webhook URL stored: ${webhookUrl}`);
  },

  onTrigger: async (context, payload) => {
    // Store webhook payload in cross-flow state
    context.crossFlowState["lastWebhookPayload"] = payload.body.data;
    context.crossFlowState["lastWebhookTime"] = new Date().toISOString();

    return { payload };
  },

  onExecution: async (context, params) => {
    // Process webhook
    return { data: params.onTrigger.results };
  },
});

// Flow 2: Scheduled processor (uses webhook data)
export const scheduledProcessorFlow = flow({
  name: "Process Webhook Data",
  stableKey: "scheduled-processor",

  onInstanceDeploy: async (context) => {
    const { logger, crossFlowState } = context;

    // Wait for webhook receiver to initialize
    const webhookUrl = crossFlowState["webhookUrl"] as string | undefined;

    if (webhookUrl) {
      logger.info(`Webhook receiver initialized at: ${webhookUrl}`);
    } else {
      logger.warn("Webhook receiver not yet initialized");
    }
  },

  onExecution: async (context, params) => {
    const { logger, crossFlowState } = context;

    // Access webhook data stored by other flow
    const lastPayload = crossFlowState["lastWebhookPayload"] as
      | Record<string, unknown>
      | undefined;
    const lastTime = crossFlowState["lastWebhookTime"] as string | undefined;

    if (!lastPayload) {
      logger.info("No webhook data available yet");
      return { data: null };
    }

    logger.info(`Processing webhook data from ${lastTime}`);
    // Process data...

    return { data: { processed: true, from: lastTime } };
  },
});

export default [webhookReceiverFlow, scheduledProcessorFlow];
```

---

## Best Practices

### 1. Keep It Fast

**DO:**

```typescript
onInstanceDeploy: async (context) => {
  // Quick operations: < 30 seconds total
  await registerWebhook(context);
  await validateCredentials(context);
  await initializeState(context);
};
```

**DON'T:**

```typescript
onInstanceDeploy: async (context) => {
  // ❌ Long operations that might timeout
  await syncAllHistoricalData(); // Could take minutes
  await processLargeDataset(); // Unpredictable duration
};
```

**For long operations:** Use Instance Deployed management trigger (up to 15 minutes)

---

### 2. Handle Idempotency

**DO:**

```typescript
onInstanceDeploy: async (context) => {
  try {
    await createResource();
  } catch (error) {
    if ((error as { code?: string }).code === "ALREADY_EXISTS") {
      context.logger.info("Resource exists, updating instead");
      await updateResource();
    } else {
      throw error;
    }
  }
};
```

**DON'T:**

```typescript
onInstanceDeploy: async (context) => {
  // ❌ Assumes fresh deployment every time
  await createResource(); // Fails on re-deployment
};
```

---

### 3. Graceful Cleanup

**DO:**

```typescript
onInstanceDelete: async (context) => {
  try {
    await deleteResource();
    context.logger.info("Cleanup successful");
  } catch (error) {
    // Log but don't throw
    context.logger.error(`Cleanup failed: ${(error as Error).message}`);
  }
};
```

**DON'T:**

```typescript
onInstanceDelete: async (context) => {
  // ❌ Throws error, blocks deletion
  await deleteResource(); // What if already deleted?
  throw new Error("Failed to clean up"); // Prevents instance deletion
};
```

---

### 4. Use State Effectively

**DO:**

```typescript
onInstanceDeploy: async (context) => {
  // Store configuration derived during deploy
  const accountInfo = await fetchAccountInfo(context.configVars);
  context.crossFlowState["accountId"] = accountInfo.id;
  context.crossFlowState["accountRegion"] = accountInfo.region;

  // Other flows can use this without re-fetching
};
```

**DON'T:**

```typescript
onInstanceDeploy: async (context) => {
  // ❌ Fetch same data every execution
  // Should store in state during deploy
};
```

See [state-persistence.md](state-persistence.md) for complete state management guide.

---

### 5. Log Everything

**DO:**

```typescript
onInstanceDeploy: async (context) => {
  const { logger } = context;

  logger.info("Starting instance deployment");
  logger.info(`Webhook URL: ${context.webhookUrls["my-flow"]}`);

  try {
    await registerWebhook();
    logger.info("Webhook registered successfully");
  } catch (error) {
    logger.error(`Webhook registration failed: ${(error as Error).message}`);
    throw error;
  }
};
```

**DON'T:**

```typescript
onInstanceDeploy: async (context) => {
  // ❌ Silent failures, hard to debug
  await registerWebhook();
};
```

---

## Troubleshooting

### "Deployment timeout after 30 seconds"

**Cause:** onInstanceDeploy took too long

**Solutions:**

- Profile operations to find slow calls
- Use Instance Deployed management trigger for long operations
- Cache expensive lookups in state
- Parallelize independent operations

---

### "Webhook still receiving calls after deletion"

**Cause:** onInstanceDelete didn't clean up webhook

**Solutions:**

- Ensure onInstanceDelete calls unregister endpoint
- Log errors but don't throw (allow deletion to proceed)
- External system should handle 404 from deleted webhooks gracefully

---

### "State lost after re-deployment"

**Cause:** onInstanceDeploy overwrites existing state

**Solutions:**

- Check if state exists before initializing
- Only set defaults if keys don't exist
- Log when preserving vs initializing state

```typescript
onInstanceDeploy: async (context) => {
  const existingCursor = context.crossFlowState["cursor"] as string | undefined;

  if (!existingCursor) {
    // Fresh deployment
    context.crossFlowState["cursor"] = Date.now().toString();
  } else {
    // Re-deployment - preserve state
    context.logger.info(`Preserving cursor: ${existingCursor}`);
  }
};
```

---

### "Multiple flows registering same webhook"

**Cause:** Each flow's onInstanceDeploy called independently

**Solutions:**

- Use instance-level state to coordinate
- Only register in one flow, others check state
- Use idempotent API endpoints that handle duplicates

---

## Additional Resources

- **State Management**: [state-persistence.md](state-persistence.md)
- **Multi-Flow Patterns**: [multi-flow.md](multi-flow.md)
- **Error Handling**: [error-handling.md](error-handling.md)
- **Webhook Patterns**: [webhook-patterns.md](webhook-patterns.md)
- **Prismatic Docs**: <https://prismatic.io/docs/integrations/lifecycle/>

---

## Summary

Lifecycle events provide critical hooks for:

- ✅ **Resource setup/teardown** during instance lifecycle
- ✅ **Webhook management** (register/unregister)
- ✅ **State initialization** for tracking and synchronization
- ✅ **Configuration validation** before instance goes live
- ✅ **Multi-flow coordination** via shared state

**Key Requirements:**

- Complete within 30 seconds
- Be idempotent (safe to run multiple times)
- Handle errors gracefully (especially in onInstanceDelete)
- Use state to share info across flows
- Log all operations for debugging

**TypeScript State Access (from @prismatic-io/spectral):**

```typescript
// State objects are Record<string, unknown> - use direct property access

// Reading (with type assertion and default)
const cursor = (context.crossFlowState["cursor"] as string) ?? "0";

// Writing (direct assignment)
context.crossFlowState["cursor"] = newCursor;

// Note: instanceState is NOT available in lifecycle hooks
// Use crossFlowState for shared instance data
```

**When to use alternatives:**

- Long operations → Instance Deployed management trigger
- Initial data sync → Scheduled flow or management trigger
- Complex workflows → Regular flow execution
