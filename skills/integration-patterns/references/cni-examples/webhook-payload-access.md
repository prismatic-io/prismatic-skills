# Webhook Payload Access Patterns

How to correctly access webhook payloads in CNI flows.

---

## Runtime Structure

### In `onTrigger`

```typescript
onTrigger: async (context, payload) => {
  // payload is the TriggerPayload with:
  // - headers: HTTP headers object
  // - body: { data: <parsed JSON>, contentType: string }
  // - rawBody: { data: Buffer, contentType: string }
  // - queryParameters, pathFragment, webhookUrls, etc.

  return { payload };
};
```

### In `onExecution`

```typescript
onExecution: async (context, params) => {
  // params.onTrigger.results IS the TriggerPayload directly
  // NO wrapper - access properties directly on results

  const payload = params.onTrigger.results;
  // payload.headers = HTTP headers
  // payload.body.data = your parsed JSON webhook payload
  // payload.body.contentType = "application/json"
  // payload.rawBody.data = Buffer (raw bytes)
};
```

---

## Correct Access Pattern

### Simple Direct Access

```typescript
onExecution: async (context, params) => {
  const { logger } = context;

  // Access the trigger results directly - it IS the payload
  const payload = params.onTrigger.results;

  // Your webhook JSON is in body.data
  const webhookData = payload.body?.data;

  logger.info(`Received: ${JSON.stringify(webhookData)}`);
};
```

### With TypeScript Interface

```typescript
interface MyWebhookPayload {
  eventType: string;
  data: {
    id: string;
    name: string;
  };
}

onExecution: async (context, params) => {
  const { logger } = context;

  const payload = params.onTrigger.results;
  const webhookData = payload.body?.data as MyWebhookPayload;

  if (!webhookData) {
    logger.error("No webhook data received");
    return { data: { error: "No webhook data" } };
  }

  logger.info(`Event: ${webhookData.eventType}`);
  logger.info(`ID: ${webhookData.data?.id}`);

  return { data: { success: true } };
};
```

---

## Complete Webhook Flow Example

```typescript
import { flow, util, type Connection } from "@prismatic-io/spectral";

interface LeadPayload {
  type: string;
  data: {
    lead: {
      id: string;
      companyName: string;
      contactEmail: string;
    };
  };
}

export const webhookFlow = flow({
  name: "Process Webhook",
  stableKey: "process-webhook",
  description: "Receives and processes webhooks",

  onTrigger: async (context, payload) => {
    const { logger } = context;
    logger.info("Webhook received");
    return { payload };
  },

  onExecution: async (context, params) => {
    const { logger, configVars } = context;

    // Access trigger results directly - no wrapper
    const payload = params.onTrigger.results;

    // Get the parsed JSON from body.data
    const webhookData = payload.body?.data as LeadPayload;

    if (!webhookData) {
      logger.error("No webhook data found");
      return { data: { error: "No webhook data" } };
    }

    const leadType = webhookData.type;
    const lead = webhookData.data?.lead;

    logger.info(`Lead type: ${leadType}`);
    logger.info(`Lead ID: ${lead?.id}`);
    logger.info(`Company: ${lead?.companyName}`);

    return {
      data: {
        success: true,
        leadType,
        leadId: lead?.id,
      },
    };
  },
});

export default [webhookFlow];
```

---

## Payload Structure Reference

For JSON webhooks (`application/json`):

```
params.onTrigger.results = {
  headers: { "Content-Type": "application/json", ... },
  body: {
    data: { <your parsed JSON payload> },
    contentType: "application/json"
  },
  rawBody: {
    data: { type: "Buffer", data: [...] },
    contentType: "application/json"
  },
  queryParameters: null,
  pathFragment: "",
  webhookUrls: { "Flow Name": "https://..." },
  invokeUrl: "https://...",
  executionId: "...",
  customer: { id, name, externalId },
  instance: { id, name },
  user: { id, email, name, externalId },
  integration: { id, name, ... },
  flow: { id, name },
  startedAt: "...",
  ...
}
```

---

## Quick Reference

| What You Want        | How To Access It                                              |
| -------------------- | ------------------------------------------------------------- |
| Full trigger payload | `params.onTrigger.results`                                    |
| Parsed JSON body     | `params.onTrigger.results.body?.data`                         |
| Raw body as string   | `util.types.toString(params.onTrigger.results.rawBody?.data)` |
| HTTP headers         | `params.onTrigger.results.headers`                            |
| Content type         | `params.onTrigger.results.body?.contentType`                  |
| Webhook URL          | `params.onTrigger.results.webhookUrls["Flow Name"]`           |

---

## Common Mistakes

### Mistake 1: Looking for a `.data` wrapper that doesn't exist

```typescript
// ❌ WRONG - there is no .data wrapper at top level
const payload = params.onTrigger.results.data;

// ✅ CORRECT - results IS the payload
const payload = params.onTrigger.results;
```

### Mistake 2: Forgetting that JSON is in `body.data`

```typescript
// ❌ WRONG - body contains { data, contentType }, not your JSON directly
const myData = params.onTrigger.results.body.id;

// ✅ CORRECT - your JSON is inside body.data
const myData = params.onTrigger.results.body?.data?.id;
```

### Mistake 3: Assuming rawBody.data is a string

```typescript
// ❌ WRONG - rawBody.data is a Buffer object
const bodyString = payload.rawBody.data;

// ✅ CORRECT - convert to string first
const bodyString = util.types.toString(payload.rawBody?.data);
```

---

## Debugging Payload Structure

When unsure about the structure, log it:

```typescript
onExecution: async (context, params) => {
  const { logger } = context;

  // Log the full trigger results
  logger.info(
    `Trigger results: ${JSON.stringify(params.onTrigger.results, null, 2)}`,
  );

  // Log just the body
  logger.info(`Body: ${JSON.stringify(params.onTrigger.results.body)}`);

  // Log the webhook data
  logger.info(
    `Webhook data: ${JSON.stringify(params.onTrigger.results.body?.data)}`,
  );
};
```

---

## Related Documentation

- **Webhook Patterns**: [webhook-patterns.md](webhook-patterns.md) - Parsing XML, JSON validation, signature verification
- **Multi-Flow**: [multi-flow.md](multi-flow.md) - onTrigger/onExecution split patterns
- **Error Handling**: [error-handling.md](error-handling.md) - Handling payload parsing errors
