# Answer-to-Code Cookbook

Maps component spec answers to TypeScript code. When generating code,
look up each answer and copy the corresponding snippet. Do NOT improvise types or imports.

## Critical Import Rules

```typescript
// CORRECT — always import from the package root
import { component, action, trigger, dataSource, connection, oauth2Connection, OAuth2Type, input, util } from "@prismatic-io/spectral";
import { ConnectionError } from "@prismatic-io/spectral";

// WRONG — never import from internal paths
// import { action } from "@prismatic-io/spectral/dist/serverTypes";

// EXCEPTION — HTTP client is imported from a subpath
import { createClient, type HttpClient } from "@prismatic-io/spectral/dist/clients/http";
```

---

## answer: component_type → file structure

### component_type: "Application Connector"

```
src/
  index.ts           # component() registration
  actions.ts         # CRUD + custom actions
  connections.ts     # connection definitions
  client.ts          # HTTP client factory
  triggers.ts        # webhook triggers (if webhook_support)
  dataSources.ts     # picklist data sources (if data_source_support)
  inputs.ts          # reusable input definitions
  types.ts           # TypeScript interfaces
assets/
  icon.png           # 128x128 component icon
```

### component_type: "Utility/Logic Component"

```
src/
  index.ts           # component() registration (no connections, triggers, dataSources)
  actions.ts         # utility actions
  inputs.ts          # reusable input definitions
  types.ts           # TypeScript interfaces (optional)
assets/
  icon.png
```

Utility index.ts omits connections, triggers, dataSources from component():
```typescript
export default component({
  key: "my-utility",
  public: false,
  display: { label: "My Utility", description: "Transforms data", iconPath: "icon.png" },
  actions,
});
```

---

## answer: auth_type → connection pattern

### auth_type: "oauth2"

```typescript
import { oauth2Connection, OAuth2Type } from "@prismatic-io/spectral";

export const oauth2Auth = oauth2Connection({
  key: "myServiceOAuth2",
  display: { label: "OAuth 2.0", description: "Connect using OAuth 2.0" },
  oauth2Type: OAuth2Type.AuthorizationCode,
  inputs: {
    authorizeUrl: { label: "Authorize URL", type: "string", required: true, default: "https://example.com/oauth/authorize" },
    tokenUrl: { label: "Token URL", type: "string", required: true, default: "https://example.com/oauth/token" },
    clientId: { label: "Client ID", type: "string", required: true },
    clientSecret: { label: "Client Secret", type: "password", required: true },
    scopes: { label: "Scopes", type: "string", required: false, default: "read write" },
  },
});

export default [oauth2Auth];
```

Client usage: `connection.token?.access_token`

### auth_type: "apikey"

```typescript
import { connection, input } from "@prismatic-io/spectral";

export const apiKeyConnection = connection({
  key: "myServiceApiKey",
  display: { label: "API Key", description: "Connect using an API key" },
  inputs: {
    api_key: input({ label: "API Key", type: "password", required: true }),
    endpoint: input({ label: "Base URL", type: "string", required: false, default: "https://api.example.com" }),
  },
});

export default [apiKeyConnection];
```

Client usage: `connection.fields.api_key as string`

### auth_type: "bearer"

```typescript
export const bearerConnection = connection({
  key: "myServiceBearer",
  display: { label: "Bearer Token", description: "Connect using a bearer token" },
  inputs: {
    token: input({ label: "Token", type: "password", required: true }),
    endpoint: input({ label: "Base URL", type: "string", required: false, default: "https://api.example.com" }),
  },
});

export default [bearerConnection];
```

Client usage: `connection.fields.token as string`

### auth_type: "basic"

```typescript
export const basicConnection = connection({
  key: "myServiceBasic",
  display: { label: "Basic Auth", description: "Connect using username and password" },
  inputs: {
    username: input({ label: "Username", type: "string", required: true }),
    password: input({ label: "Password", type: "password", required: true }),
    endpoint: input({ label: "Base URL", type: "string", required: false, default: "https://api.example.com" }),
  },
});

export default [basicConnection];
```

Client usage: `Buffer.from(`${connection.fields.username}:${connection.fields.password}`).toString("base64")`

### auth_type: "multiple"

```typescript
export const apiKeyConnection = connection({ key: "myServiceApiKey", /* ... */ });
export const oauth2Auth = oauth2Connection({ key: "myServiceOAuth2", /* ... */ });
export default [apiKeyConnection, oauth2Auth];
```

Client determines auth by checking `connection.token?.access_token` first, then `connection.fields.*`.

---

## answer: webhook_support → trigger pattern

### webhook_support: "Yes - include webhook triggers"

```typescript
import { trigger } from "@prismatic-io/spectral";
import { MyClient } from "./client";
import { connectionInput } from "./inputs";

const webhookTrigger = trigger({
  display: { label: "Webhook", description: "Receive webhook events" },
  inputs: { connection: connectionInput },
  onInstanceDeploy: async (context, inputs) => {
    const client = new MyClient({ connection: inputs.connection });
    const webhookUrl = context.webhookUrls[context.flow.name];
    const result = await client.webhooks.register({ url: webhookUrl });
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

## answer: polling_support → not a component feature

Polling is integration-level (via `triggerType: "polling"` on a flow with `context.polling.getState/setState`).
Component triggers do not poll. If the spec says "polling", note this and handle it in the integration, not the component.

---

## answer: pagination_strategy → client pattern

### pagination_strategy: "internal_loop"

Client fetches all pages internally, returns complete results:

```typescript
async listAll(): Promise<Item[]> {
  const items: Item[] = [];
  let cursor: string | undefined;
  do {
    const response = await this.client.get<PagedResponse>("/items", { params: { cursor, limit: 100 } });
    items.push(...response.data.data);
    cursor = response.data.next_cursor;
  } while (cursor);
  return items;
}
```

### pagination_strategy: "exposed_inputs"

Actions expose cursor/page inputs, return partial results:

```typescript
const listItems = action({
  display: { label: "List Items", description: "List items with pagination" },
  inputs: {
    connection: connectionInput,
    cursor: input({ label: "Cursor", type: "string", required: false }),
    limit: input({ label: "Limit", type: "string", default: "100", clean: util.types.toInt }),
  },
  perform: async (context, params) => {
    const client = new MyClient({ connection: params.connection });
    const result = await client.items.list({ cursor: params.cursor, limit: params.limit });
    return { data: { items: result.data, nextCursor: result.next_cursor } };
  },
});
```

### pagination_strategy: "none"

Single request, no pagination logic needed.

---

## answer: data_source_support → data source pattern

```typescript
import { dataSource } from "@prismatic-io/spectral";
import { MyClient } from "./client";
import { connectionInput } from "./inputs";

const selectItem = dataSource({
  display: { label: "Select Item", description: "Choose an item from the list" },
  dataSourceType: "picklist",
  inputs: { connection: connectionInput },
  perform: async (context, params) => {
    const client = new MyClient({ connection: params.connection });
    const items = await client.items.list();
    const result = items
      .map((item) => ({ label: item.name, key: item.id }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return { result };
  },
});

export default { selectItem };
```

Picklist element shape: `{ label: string, key: string }`.

---

## answer: error_handling_strategy → error pattern

### error_handling_strategy: "connection_error"

```typescript
import { ConnectionError } from "@prismatic-io/spectral";

perform: async (context, params) => {
  try {
    const client = new MyClient({ connection: params.connection });
    const result = await client.items.list();
    return { data: result };
  } catch (error) {
    if (error instanceof Error && (error.message.includes("401") || error.message.includes("403"))) {
      throw new ConnectionError(params.connection, `Authentication failed: ${error.message}`);
    }
    throw error;
  }
},
```

### error_handling_strategy: "try_catch"

```typescript
perform: async (context, params) => {
  try {
    const client = new MyClient({ connection: params.connection });
    const result = await client.items.create(params);
    return { data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    context.logger.error(`Failed to create item: ${message}`);
    return { data: { error: true, message } };
  }
},
```

### error_handling_strategy: "none"

No try/catch — errors propagate to the integration's error handler.
