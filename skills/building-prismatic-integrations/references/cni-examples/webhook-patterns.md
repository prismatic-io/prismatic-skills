# Webhook Parsing Patterns for CNI

Comprehensive patterns for handling webhooks in Prismatic Code Native Integrations.

---

## XML Parsing

```typescript
import { XMLParser } from "fast-xml-parser";
import { HttpResponse, flow, util } from "@prismatic-io/spectral";

onTrigger: async (context, payload) => {
  // ⭐ PARSE XML ⭐
  const parser = new XMLParser({
    ignoreAttributes: false, // Keep attributes
    attributeNamePrefix: "@_", // Prefix for attribute names
    textNodeName: "#text", // Key for text content
  });

  const xmlString = util.types.toString(payload.rawBody.data);
  const parsed = parser.parse(xmlString);

  // ⭐ IMMEDIATE RESPONSE ⭐
  const response: HttpResponse = {
    statusCode: 200,
    contentType: "application/xml",
    body: '<?xml version="1.0"?><ack>received</ack>',
  };

  return {
    payload: { ...payload, body: { data: parsed } },
    response,
  };
};
```

## JSON Parsing with Validation

```typescript
import Ajv from "ajv";

const ajv = new Ajv();
const schema = {
  type: "object",
  properties: {
    event: { type: "string" },
    data: { type: "object" },
  },
  required: ["event", "data"],
};

onTrigger: async (context, payload) => {
  // ⭐ PARSE JSON ⭐
  const jsonString = util.types.toString(payload.rawBody.data);
  let parsed;

  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    // HttpResponse requires statusCode, contentType, and body must be string
    const response: HttpResponse = {
      statusCode: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
    return { payload, response };
  }

  // ⭐ VALIDATE SCHEMA ⭐
  const valid = ajv.validate(schema, parsed);
  if (!valid) {
    const response: HttpResponse = {
      statusCode: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Invalid schema", details: ajv.errors }),
    };
    return { payload, response };
  }

  // ⭐ SUCCESS RESPONSE ⭐
  return {
    payload: { ...payload, body: { data: parsed } },
    response: {
      statusCode: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok" }),
    },
  };
};
```

## Webhook Signature Verification

```typescript
import crypto from "crypto";

onTrigger: async (context, payload) => {
  const { configVars } = context;
  const secret = configVars["Webhook Secret"];

  // ⭐ GET SIGNATURE FROM HEADERS ⭐
  const receivedSignature = payload.headers["x-webhook-signature"];

  // ⭐ COMPUTE EXPECTED SIGNATURE ⭐
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(util.types.toString(payload.rawBody.data));
  const expectedSignature = hmac.digest("hex");

  // ⭐ VERIFY ⭐
  if (receivedSignature !== expectedSignature) {
    logger.error("Invalid webhook signature");
    return {
      payload,
      response: { statusCode: 401, body: "Invalid signature" },
    };
  }

  // Continue processing...
};
```

---

## Verification/Challenge Requests

Many APIs send a verification request when registering a webhook. Handle the challenge in `onTrigger` (echo it back), then skip processing in `onExecution`:

```typescript
onExecution: async (context, params) => {
  const { logger } = context;

  // params.onTrigger.results IS the payload directly
  // Your parsed JSON is in body.data
  const webhookData = params.onTrigger.results.body?.data as {
    challenge?: string;
  };

  // Skip execution for verification challenges
  if (webhookData?.challenge) {
    logger.info("Verification challenge - skipping execution");
    return { data: { status: "verification_complete" } };
  }

  // Normal processing continues...
};
```

**Note:** Check the trigger implementations in the relevant component source (`src/triggers/`) to see how verification is handled for specific APIs.

## Best Practices

- ✅ Parse payload in onTrigger
- ✅ Respond immediately (< 30s)
- ✅ Validate webhook signatures
- ✅ Handle malformed payloads gracefully
- ✅ Skip execution for verification/challenge requests
- ✅ Process data in onExecution

---

## Additional Resources

- **Webhook Triggers**: https://prismatic.io/docs/spectral/triggers/
- **Security Best Practices**: https://prismatic.io/docs/spectral/security/
