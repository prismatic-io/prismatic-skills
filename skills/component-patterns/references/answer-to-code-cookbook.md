# Answer-to-Code Cookbook

Maps component spec answers to TypeScript code. When generating code,
look up each answer and copy the corresponding snippet. Do NOT improvise types or imports.

## Code Planning: Answer Combinations → Architecture

Read this section FIRST, before looking up individual answers. It maps answer combinations
to architectural decisions and documents spectral type constraints that affect code structure.

### Spectral Type Constraints

These are from the actual `@prismatic-io/spectral` type definitions. Violating them causes
compile errors that the templates alone won't catch.

**TriggerPayload** — has 13+ required properties (`headers`, `queryParameters`, `rawBody`,
`body`, `pathFragment`, `webhookUrls`, `webhookApiKeys`, etc.). Trigger `perform` MUST return
the original payload, not a reconstructed subset:
```typescript
// CORRECT — pass through the original TriggerPayload
perform: async (context, payload, inputs) => {
  return Promise.resolve({ payload });
}

// WRONG — reconstructing a partial object fails type checking
perform: async (context, payload, inputs) => {
  return { payload: { headers: payload.headers, body: payload.body.data } };
}
```

**DataSourceContext** — does NOT have `.debug`. Always pass `false` for debug in data sources:
```typescript
// CORRECT
perform: async (_context, { connection }) => {
  const client = createClient(connection, false);
}

// WRONG — DataSourceContext has no .debug property
perform: async (context, { connection }) => {
  const client = createClient(connection, context.debug.enabled);
}
```

**Element** — `label` is optional (`label?: string`). Sort must handle undefined:
```typescript
.sort((a, b) => ((a.label ?? "") < (b.label ?? "") ? -1 : 1))
```

**DefaultConnectionDefinition** — `label` and `description` go inside `display`, not at root:
```typescript
// CORRECT
connection({ key: "apiKey", display: { label: "API Key", description: "..." }, inputs: {...} })

// WRONG — label at root causes TS2353
connection({ key: "apiKey", label: "API Key", inputs: {...} })
```

**sendRawRequest** — takes three args: `(baseUrl: string, values, authHeaders?)`:
```typescript
// CORRECT
await sendRawRequest("https://api.example.com", { ...inputs, debugRequest: debug }, headers)

// WRONG — missing baseUrl arg
await sendRawRequest({ ...inputs, debugRequest: debug }, headers)
```

### Combination Decision Tree

**Token exchange auth (`api_key_secret`)**
When the API authenticates via key ID + key exchanged for a session token (e.g., Backblaze B2):
- `client.ts` needs an `authorize()` function that calls the auth endpoint, returns `{ authorizationToken, apiUrl, downloadUrl }`
- `createClient()` takes the auth result, not the raw connection — the base URL is dynamic
- Connection defines two fields: key ID + key
- Every action calls `authorize()` first, then `createClient()` with the result

**Binary data (upload/download)**
When actions need to transfer files rather than JSON:
- Download: use `responseType: "arraybuffer"` on the client, return `{ data: Buffer, contentType }` where contentType comes from response headers
- If the API uses a different URL for downloads (e.g., Backblaze `downloadUrl`), create a separate `createDownloadClient()` factory
- Upload: may need multipart form data or raw binary body depending on API — check the API research
- Standard actions still return `{ data }` JSON — only file operations return Buffer

**Webhook triggers with HMAC verification**
- `perform` receives the full `TriggerPayload` — return `{ payload }` for pass-through
- For HMAC: compute hash from `payload.rawBody.data`, compare with header value, return `{ payload, response: { statusCode: 401, body: "..." } }` on mismatch
- Registration in `onInstanceDeploy`: POST to webhook endpoint with `context.webhookUrls[context.flow.name]`
- Cleanup in `onInstanceDelete`: DELETE using stored ID from `context.instanceState`
- Lifecycle hooks use `createClient(connection, false)` — no debug in lifecycle

**Data sources that depend on auth**
- `DataSourceContext` has no `.debug` — always pass `false` to `createClient`
- Elements use `{ label?: string, key: string }` — `label` is optional, sort needs null handling
- If the data source uses token-exchange auth, `authorize()` is called inside the perform function

---

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
import { createClient } from "./client";
import { connectionInput } from "./inputs";

const webhookTrigger = trigger({
  display: { label: "Webhook", description: "Receive webhook events" },
  inputs: { connection: connectionInput },
  onInstanceDeploy: async (context, { connection }) => {
    const client = createClient(connection, false);
    const webhookUrl = context.webhookUrls[context.flow.name];
    const result = await client.webhooks.register({ url: webhookUrl });
    return { instanceState: { webhookId: result.id } };
  },
  onInstanceDelete: async (context, { connection }) => {
    const webhookId = context.instanceState?.webhookId;
    if (webhookId) {
      const client = createClient(connection, false);
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
  examplePayload: listItemsExamplePayload,
  inputs: {
    connection: connectionInput,
    cursor: input({ label: "Cursor", type: "string", required: false }),
    limit: input({ label: "Limit", type: "string", default: "100", clean: util.types.toInt }),
  },
  perform: async (context, { connection, cursor, limit }) => {
    const client = createClient(connection, context.debug.enabled);
    const result = await client.items.list({ cursor, limit });
    return { data: { items: result.data, nextCursor: result.next_cursor } };
  },
});
```

### pagination_strategy: "none"

Single request, no pagination logic needed.

---

## answer: data_source_support → data source pattern

```typescript
import { dataSource, type Element } from "@prismatic-io/spectral";
import { createClient } from "./client";
import { connectionInput } from "./inputs";

const selectItem = dataSource({
  display: { label: "Select Item", description: "Choose an item from the list" },
  dataSourceType: "picklist",
  inputs: { connection: connectionInput },
  perform: async (_context, { connection }) => {
    // DataSourceContext does NOT have .debug — always pass false
    const client = createClient(connection, false);
    const items = await client.items.list();
    const result = items
      .map((item): Element => ({ label: item.name, key: item.id }))
      .sort((a, b) => ((a.label ?? "") < (b.label ?? "") ? -1 : 1));
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

perform: async (context, { connection }) => {
  try {
    const client = createClient(connection, context.debug.enabled);
    const result = await client.items.list();
    return { data: result };
  } catch (error) {
    if (error instanceof Error && (error.message.includes("401") || error.message.includes("403"))) {
      throw new ConnectionError(connection, `Authentication failed: ${error.message}`);
    }
    throw error;
  }
},
```

### error_handling_strategy: "try_catch"

```typescript
perform: async (context, { connection, ...params }) => {
  try {
    const client = createClient(connection, context.debug.enabled);
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

---

## Required Structure

Every connector component must include:
- `src/client.ts` — function-based `createClient` returning `HttpClient`
- `src/inputs/` — folder with all input definitions (never inline in actions)
- `src/actions/` — folder tree with one action per file
- `src/actions/misc/rawRequest.ts` — REQUIRED raw HTTP request action
- `src/examplePayloads/` — folder with verified payloads for each action
- `src/connections.ts` — connection definitions
- `src/index.ts` — component definition with custom error hook

---

## Input Clean Functions

Every non-connection input MUST have a `clean` function:

| Input type | Clean function |
|-----------|---------------|
| Required string | `clean: util.types.toString` |
| Optional string | `clean: (val) => util.types.toString(val) \|\| undefined` |
| Boolean | `clean: util.types.toBool` |
| Number | `clean: util.types.toNumber` |
| JSON/object | `clean: util.types.toObject` |
| Data (binary) | `clean: util.types.toData` |

String inputs also need `placeholder` and `example` fields.
All inputs need a `comments` field.

---

## Example Payloads

Every action must have an `examplePayload` imported from `src/examplePayloads/`.

Rules from the components repo standardization:
- The payload MUST match what the action's `perform` actually returns — including nullable fields
- NEVER modify an action's `perform` function to match a payload
- NEVER remove generics from HTTP calls to avoid type conflicts with payloads
- If a type has `field: string | null`, the example payload must also have `null` (not just `string`)
- Use realistic vendor-specific ID formats (e.g., `usr_`, `org_`, `4a48fe8875c6214145260818`)
- Import from `src/examplePayloads/`, never define inline

```typescript
// src/examplePayloads/users.ts
export const getUserExamplePayload = {
  data: {
    id: "usr_abc123",
    name: "Jane Smith",
    email: "jane@example.com",
    status: "active",
    deletedAt: null, // nullable field — must be null, not omitted
  },
};

export const listUsersExamplePayload = {
  data: [getUserExamplePayload.data], // reuse single-item payload
};

export const deleteUserExamplePayload = {
  data: null,
};
```

---

## Error Hooks

Every component definition MUST include an error hook that:
1. Re-throws `ConnectionError` as-is (preserves connection error semantics in the UI)
2. Extracts Axios response data (status, body) for API errors
3. Wraps everything else in a plain Error

```typescript
import { component, ConnectionError } from "@prismatic-io/spectral";

export default component({
  // ...
  display: {
    // ...
    category: "Application Connectors", // Required for connectors
  },
  hooks: {
    error: (error: unknown) => {
      if (error instanceof ConnectionError) throw error;
      // Preserve Axios response data for better error messages
      if (error && typeof error === "object" && "response" in error) {
        const axiosErr = error as { message?: string; response?: { data?: unknown; status?: number } };
        return {
          message: axiosErr.message ?? "API request failed",
          data: axiosErr.response?.data,
          status: axiosErr.response?.status,
        };
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(msg);
    },
  },
});
```
