# Client Patterns

HTTP client factory for Prismatic custom components.

## Pattern: Function-based createClient

Components use a function-based client factory that returns an `HttpClient` from spectral's HTTP client library. This is NOT a class — it's a factory function.

### Basic structure

```typescript
import { type Connection, ConnectionError, util } from "@prismatic-io/spectral";
import {
  createClient as createHttpClient,
  type HttpClient,
} from "@prismatic-io/spectral/dist/clients/http";

export const createClient = (connection: Connection, debug = false): HttpClient =>
  createHttpClient({
    baseUrl: "https://api.example.com/v1",
    headers: { Authorization: `Bearer ${util.types.toString(connection.token?.access_token)}` },
    debug,
  });
```

### Connection type validation

ALWAYS validate the connection type in client.ts. Throw `ConnectionError` for mismatches:

```typescript
import { apiKeyConnection, oauth2Connection } from "./connections";

export const createClient = (connection: Connection, debug = false): HttpClient => {
  if (![apiKeyConnection.key, oauth2Connection.key].includes(connection.key)) {
    throw new ConnectionError(connection, `Unexpected connection type: ${connection.key}`);
  }
  return createHttpClient({ baseUrl, headers: getAuthHeaders(connection), debug });
};
```

### Multi-auth helper

```typescript
const getAuthHeaders = (connection: Connection): Record<string, string> => {
  switch (connection.key) {
    case "oauth2":
      return { Authorization: `Bearer ${util.types.toString(connection.token?.access_token)}` };
    case "apiKey":
      return { Authorization: `Bearer ${util.types.toString(connection.fields.apiKey)}` };
    case "basic": {
      const username = util.types.toString(connection.fields.username);
      const password = util.types.toString(connection.fields.password);
      return { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` };
    }
    default:
      throw new ConnectionError(connection, "Unknown connection type.");
  }
};
```

### Debug mode

- Access via `context.debug.enabled` in actions
- Pass to client: `createClient(connection, context.debug.enabled)`
- In lifecycle hooks, pass `false` (no debug in deploy/delete)

### Error normalization

- `ConnectionError` for auth failures (401/403) and connection type mismatches
- Standard `Error` for business logic failures
- Import: `import { ConnectionError } from "@prismatic-io/spectral"`

### Anti-patterns

- WRONG: Class-based client (`class MyClient { ... }`)
- WRONG: Raw `fetch` or `axios` in the client
- WRONG: Missing connection type validation
- WRONG: Missing debug parameter
- WRONG: `connection.fields.apiKey` without `util.types.toString()`
