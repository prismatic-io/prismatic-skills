# Trigger Patterns

Webhook trigger structure for custom components. Triggers are the entry points that receive
external events and forward payloads to the integration.

---

## Basic Webhook Trigger

```typescript
import { trigger } from "@prismatic-io/spectral";
import { MyClient } from "./client";
import { connectionInput } from "./inputs";

const webhookTrigger = trigger({
  display: {
    label: "Webhook",
    description: "Receive webhook events from the service",
  },
  inputs: {
    connection: connectionInput,
  },

  onInstanceDeploy: async (context, inputs) => {
    const client = new MyClient({ connection: inputs.connection });
    const webhookUrl = context.webhookUrls[context.flow.name];
    const result = await client.webhooks.register({ url: webhookUrl, events: ["item.created"] });
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
    return { payload, response };
  }

  return { payload };
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
  onInstanceDeploy: async (context, inputs) => {
    const events = inputs.eventTypes ? inputs.eventTypes.split(",").map((e) => e.trim()) : ["*"];
    const client = new MyClient({ connection: inputs.connection });
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
