# Spectral Component Quickstart

Spectral is Prismatic's SDK for building custom components. This guide covers the essentials.

## Installation

```bash
npm install @prismatic-io/spectral
```

## Core Concepts

### Component

A component is a collection of actions, triggers, data sources, and connections.

```typescript
import { component } from "@prismatic-io/spectral";
import actions from "./actions";
import triggers from "./triggers";
import dataSources from "./dataSources";
import connections from "./connection";

export default component({
  key: "my-component",
  public: false,
  display: {
    label: "My Component",
    description: "What this component does",
    iconPath: "icon.png",
  },
  actions,
  triggers,
  dataSources,
  connections,
});
```

### Action

Actions are operations that users can perform.

```typescript
import { action } from "@prismatic-io/spectral";

const myAction = action({
  display: {
    label: "My Action",
    description: "What this action does",
  },
  inputs: {
    // Define inputs here
  },
  perform: async (context, params) => {
    // Implement action logic
    return { data: result };
  },
});
```

### Input

Inputs define the parameters for actions, triggers, and data sources.

```typescript
import { input, util } from "@prismatic-io/spectral";

const myInput = input({
  label: "My Input",
  type: "string",           // string, boolean, number, password, code, connection
  required: true,
  default: "default value",
  comments: "Help text",
  example: "example value",
  placeholder: "Enter value",
  clean: util.types.toString,  // Type coercion function
});
```

### Connection

Connections define authentication configurations.

```typescript
import { connection, input } from "@prismatic-io/spectral";

const apiKeyConnection = connection({
  key: "apiKey",
  display: {
    label: "API Key",
    description: "Connect using an API key",
  },
  inputs: {
    api_key: input({
      label: "API Key",
      type: "password",
      required: true,
    }),
  },
});
```

### OAuth2 Connection

```typescript
import { oauth2Connection, OAuth2Type } from "@prismatic-io/spectral";

const oauth2 = oauth2Connection({
  key: "oauth2",
  display: {
    label: "OAuth 2.0",
    description: "Connect using OAuth 2.0",
  },
  oauth2Type: OAuth2Type.AuthorizationCode,
  inputs: {
    authorizeUrl: { label: "Authorize URL", type: "string", required: true },
    tokenUrl: { label: "Token URL", type: "string", required: true },
    clientId: { label: "Client ID", type: "string", required: true },
    clientSecret: { label: "Client Secret", type: "password", required: true },
  },
});
```

### Trigger

Triggers define entry points for integrations.

```typescript
import { trigger } from "@prismatic-io/spectral";

const webhookTrigger = trigger({
  display: {
    label: "Webhook",
    description: "Receive webhook events",
  },
  inputs: {
    connection: connectionInput,
  },
  onInstanceDeploy: async (context, inputs) => {
    // Called when integration is deployed
    // Register webhook, return state
    return { instanceState: { webhookId: "123" } };
  },
  onInstanceDelete: async (context, inputs) => {
    // Called when integration is deleted
    // Unregister webhook
  },
  perform: async (context, payload) => {
    // Called when webhook is received
    return { payload };
  },
  scheduleSupport: "invalid",
  synchronousResponseSupport: "valid",
});
```

### Data Source

Data sources provide dynamic values for dropdowns.

```typescript
import { dataSource } from "@prismatic-io/spectral";

const itemList = dataSource({
  display: {
    label: "Items",
    description: "Select an item",
  },
  dataSourceType: "picklist",
  inputs: {
    connection: connectionInput,
  },
  perform: async (context, params) => {
    // Fetch items and return as picklist
    return {
      result: [
        { label: "Item 1", key: "item-1" },
        { label: "Item 2", key: "item-2" },
      ],
    };
  },
});
```

## HTTP Client

Spectral provides an HTTP client for making API calls.

```typescript
import { createClient } from "@prismatic-io/spectral/dist/clients/http";

const client = createClient({
  baseUrl: "https://api.example.com",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  debug: false,
});

// GET request
const response = await client.get<ResponseType>("/path");
const data = response.data;

// POST request
const response = await client.post<ResponseType>("/path", { body: data });

// PUT request
const response = await client.put<ResponseType>("/path", { body: data });

// DELETE request
await client.delete("/path");
```

## Context Object

The `context` parameter in perform functions provides:

```typescript
perform: async (context, params) => {
  // Logging
  context.logger.info("Processing...");
  context.logger.warn("Warning message");
  context.logger.error("Error occurred");

  // Debug mode
  if (context.debug.enabled) {
    context.logger.debug("Debug info");
  }

  // Instance info
  const instanceId = context.instance.id;
  const customerId = context.customer.id;

  // Webhook URLs (in triggers)
  const webhookUrl = context.webhookUrls[context.flow.name];

  // State (persisted between executions)
  const previousState = context.instanceState;

  return { data: result };
}
```

## Type Coercion

Use utility functions to ensure correct types:

```typescript
import { util } from "@prismatic-io/spectral";

// String coercion
const myStringInput = input({
  label: "String",
  type: "string",
  clean: util.types.toString,
});

// Boolean coercion
const myBoolInput = input({
  label: "Boolean",
  type: "boolean",
  clean: util.types.toBool,
});

// Number coercion
const myNumberInput = input({
  label: "Number",
  type: "number",
  clean: util.types.toNumber,
});

// Integer coercion
const myIntInput = input({
  label: "Integer",
  type: "number",
  clean: util.types.toInt,
});
```

## Input Types

| Type | Description |
|------|-------------|
| `string` | Text input |
| `boolean` | Checkbox |
| `number` | Numeric input |
| `password` | Masked text input |
| `code` | Code editor |
| `connection` | Connection selector |
| `data` | Data/file input |
| `objectSelection` | Object picker |
| `objectFieldMap` | Field mapping |

## Action Return Values

Actions must return an object with a `data` property:

```typescript
// Simple data
return { data: { id: "123", name: "Result" } };

// Array data
return { data: [item1, item2] };

// With content type
return {
  data: "CSV content",
  contentType: "text/csv",
};

// Binary data
return {
  data: Buffer.from(binaryContent),
  contentType: "application/octet-stream",
};
```

## Trigger Payload

Webhook triggers receive payload information:

```typescript
perform: async (context, payload) => {
  const body = payload.body.data;      // Request body
  const headers = payload.headers;      // Request headers
  const queryParams = payload.queryParameters;  // Query string params
  const rawBody = payload.rawBody;      // Raw body string

  return { payload };
}
```

## Building and Publishing

```bash
# Install dependencies
npm install

# Build component
npm run build

# Publish to Prismatic
prism components:publish
```

## Testing

```bash
# Run local tests
npm test

# Test specific action
prism components:dev:run --action myAction
```

## Resources

- [Spectral Documentation](https://prismatic.io/docs/custom-components/custom-components-sdk/)
- [Component Examples](https://github.com/prismatic-io/examples/tree/main/components)
- [API Reference](https://prismatic.io/docs/custom-components/spectral-api-reference/)
