# Client Patterns

HTTP client factory for custom components. The client abstracts authentication, base URL,
and error handling so actions stay clean.

---

## Client Factory

```typescript
import type { Connection } from "@prismatic-io/spectral";
import { ConnectionError } from "@prismatic-io/spectral";
import { createClient, type HttpClient } from "@prismatic-io/spectral/dist/clients/http";

interface ClientParams {
  connection: Connection;
  debug?: boolean;
}

export class MyServiceClient {
  private client: HttpClient;

  constructor({ connection, debug = false }: ClientParams) {
    const token = connection.token?.access_token || (connection.fields.api_key as string);
    const baseUrl = (connection.fields.endpoint as string) || "https://api.example.com";

    if (!token) {
      throw new ConnectionError(connection, "No authentication credentials provided");
    }

    this.client = createClient({
      baseUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      debug,
    });
  }

  public readonly items = {
    list: async (): Promise<Item[]> => {
      const response = await this.client.get<{ data: Item[] }>("/items");
      return response.data.data;
    },
    get: async (id: string): Promise<Item> => {
      const response = await this.client.get<{ data: Item }>(`/items/${id}`);
      return response.data.data;
    },
    create: async (data: CreateItemRequest): Promise<Item> => {
      const response = await this.client.post<{ data: Item }>("/items", data);
      return response.data.data;
    },
  };
}
```

---

## Auth Type Detection

When a component supports multiple connection types:

```typescript
constructor({ connection }: ClientParams) {
  let authHeader: string;

  if (connection.token?.access_token) {
    // OAuth2
    authHeader = `Bearer ${connection.token.access_token}`;
  } else if (connection.fields.api_key) {
    // API key
    authHeader = `Bearer ${connection.fields.api_key as string}`;
  } else if (connection.fields.username && connection.fields.password) {
    // Basic auth
    const creds = Buffer.from(
      `${connection.fields.username as string}:${connection.fields.password as string}`
    ).toString("base64");
    authHeader = `Basic ${creds}`;
  } else {
    throw new ConnectionError(connection, "No valid credentials found");
  }

  this.client = createClient({ baseUrl, headers: { Authorization: authHeader } });
}
```

---

## Debug Logging

Pass `context.debug.enabled` to the client for request-level logging:

```typescript
perform: async (context, params) => {
  const client = new MyServiceClient({
    connection: params.connection,
    debug: context.debug.enabled,
  });
  // createClient logs requests/responses when debug: true
  return { data: await client.items.list() };
},
```

---

## Rate Limit Retry

Check for 429 status and respect `Retry-After` header:

```typescript
private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await this.client[method]<T>(path, body);
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(error.response.headers["retry-after"] || "1", 10);
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Max retries exceeded for ${method.toUpperCase()} ${path}`);
}
```

---

## Error Normalization

Throw `ConnectionError` for auth failures, standard `Error` for everything else:

```typescript
import { ConnectionError } from "@prismatic-io/spectral";

private handleError(error: unknown, connection: Connection): never {
  if (error instanceof Error) {
    const status = (error as any)?.response?.status;
    if (status === 401 || status === 403) {
      throw new ConnectionError(connection, `Auth failed (${status}): ${error.message}`);
    }
    throw new Error(`API error: ${error.message}`);
  }
  throw new Error("Unknown error occurred");
}
```

`ConnectionError` surfaces in the Prismatic UI as a connection-specific failure, prompting
the user to re-authenticate rather than debug the integration logic.
