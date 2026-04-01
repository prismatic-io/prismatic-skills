# Trigger Patterns

Webhook trigger structure for custom components. Triggers are the entry points that receive
external events and forward payloads to the integration.

---

## Basic Webhook Trigger

```typescript
import { trigger } from "@prismatic-io/spectral";
import { createClient } from "./client";
import { connectionInput } from "./inputs";

const webhookTrigger = trigger({
  display: {
    label: "Webhook",
    description: "Receive webhook events from the service",
  },
  inputs: {
    connection: connectionInput,
  },

  onInstanceDeploy: async (context, { connection }) => {
    const client = createClient(connection, false);
    const webhookUrl = context.webhookUrls[context.flow.name];
    const result = await client.webhooks.register({ url: webhookUrl, events: ["item.created"] });
    return { instanceState: { webhookId: result.id } };
  },

  onInstanceDelete: async (context, { connection }) => {
    const webhookId = context.instanceState?.webhookId;
    if (webhookId) {
      const client = createClient(connection, false);
      await client.webhooks.delete(webhookId as string);
    }
  },

  // Return the full TriggerPayload as-is — do NOT reconstruct a partial object
  perform: async (context, payload) => {
    return Promise.resolve({ payload });
  },

  scheduleSupport: "invalid",
  synchronousResponseSupport: "valid",
});

export default { webhookTrigger };
```

---

## HMAC Signature Verification

Verify webhook authenticity before processing. Return 401 HttpResponse on mismatch.

```typescript
import crypto from "crypto";
import { trigger, type HttpResponse } from "@prismatic-io/spectral";

perform: async (context, payload) => {
  const signature = payload.headers["x-signature"] as string;
  const secret = context.instanceState?.webhookSecret as string;

  const computed = crypto
    .createHmac("sha256", secret)
    .update(payload.rawBody.data as string)
    .digest("hex");

  if (signature !== computed) {
    const response: HttpResponse = {
      statusCode: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Invalid signature" }),
    };
    // Return the original payload with a 401 response — do NOT reconstruct payload
    return { payload, response };
  }

  // Pass through the full TriggerPayload as-is
  return Promise.resolve({ payload });
},
```

---

## Event Filtering

Add filter inputs so integrations can subscribe to specific event types:

```typescript
const webhookTrigger = trigger({
  display: { label: "Webhook", description: "Receive filtered events" },
  inputs: {
    connection: connectionInput,
    eventTypes: input({
      label: "Event Types",
      type: "string",
      required: false,
      comments: "Comma-separated event types to subscribe to (e.g., 'item.created,item.updated')",
      clean: util.types.toString,
    }),
  },
  onInstanceDeploy: async (context, { connection, eventTypes }) => {
    const events = eventTypes ? eventTypes.split(",").map((e) => e.trim()) : ["*"];
    const client = createClient(connection, false);
    const webhookUrl = context.webhookUrls[context.flow.name];
    const result = await client.webhooks.register({ url: webhookUrl, events });
    return { instanceState: { webhookId: result.id } };
  },
  // ... onInstanceDelete and perform as above
});
```

---

## Trigger Options

| Option | Values | Use |
|--------|--------|-----|
| `scheduleSupport` | `"invalid"`, `"valid"`, `"required"` | Set `"invalid"` for pure webhook triggers |
| `synchronousResponseSupport` | `"invalid"`, `"valid"`, `"required"` | Set `"valid"` to allow sync HTTP responses |

---

## Multiple Triggers

Export named triggers when the API has distinct webhook event categories:

```typescript
const orderWebhook = trigger({
  display: { label: "Order Webhook", description: "Receive order events" },
  // ...
});

const customerWebhook = trigger({
  display: { label: "Customer Webhook", description: "Receive customer events" },
  // ...
});

export default { orderWebhook, customerWebhook };
```

---

## instanceState in Triggers

- `onInstanceDeploy` returns `{ instanceState: { ... } }` to persist state
- `onInstanceDelete` reads `context.instanceState` to retrieve stored values
- `perform` reads `context.instanceState` for verification secrets or metadata
- Always cast: `context.instanceState?.webhookId as string`

---

## Polling Triggers

Polling triggers use a SEPARATE function from `trigger()`. Import `pollingTrigger` from `@prismatic-io/spectral`.

```typescript
import { pollingTrigger, input, util } from "@prismatic-io/spectral";
import { createClient } from "./client";

const pollNewRecords = pollingTrigger({
  display: {
    label: "New Records",
    description: "Poll for new records created since the last check.",
  },
  inputs: {
    connection: input({ label: "Connection", type: "connection", required: true }),
  },
  perform: async (context, payload, { connection }) => {
    const client = createClient(connection, context.debug.enabled);

    // Get cursor from last poll (or default)
    const state = context.polling.getState();
    const since = (state.lastChecked as string) || new Date(0).toISOString();

    // Fetch new records
    const { data } = await client.get("/records", { params: { since } });

    // Update cursor for next poll
    context.polling.setState({ lastChecked: new Date().toISOString() });

    // Return results — polledNoChanges: true skips execution
    const hasNew = Array.isArray(data) && data.length > 0;
    return {
      payload: { ...payload, body: { data } },
      polledNoChanges: !hasNew,
    };
  },
});

export default { pollNewRecords };
```

Key differences from webhook `trigger()`:
- Import `pollingTrigger` (separate function, NOT `trigger()`)
- `context.polling.getState()` / `setState()` for cursor management
- Return `polledNoChanges: true` when no new data (skips onExecution)
- `scheduleSupport` is implicit (polling triggers always run on a schedule)
- No `onInstanceDeploy`/`onInstanceDelete` needed (no webhook registration)
- Optional `pollAction` property to reference an existing component action for the polling logic
