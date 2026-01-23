# Code Generation Guide

This guide provides patterns and templates for generating Prismatic component code.

## Starting from CLI Scaffold

The scaffold script uses `prism components:init` to create a connector-style scaffold. This is what you get vs what you customize:

| File | Created By | Action |
|------|------------|--------|
| `src/client.ts` | CLI | Customize for your API |
| `src/connections.ts` | CLI | Customize auth methods |
| `src/actions.ts` | CLI | Replace with real actions |
| `src/triggers.ts` | CLI | Customize webhook handling |
| `src/dataSources.ts` | CLI | Customize data sources |
| `src/index.ts` | CLI | Usually no changes needed |
| `src/types.ts` | Scaffold script | Add your TypeScript interfaces |
| `src/inputs.ts` | Scaffold script | Add your input definitions |

### For Utility Components

Remove unused connector files before implementing:

```bash
# Delete these files
rm src/client.ts src/connections.ts src/triggers.ts src/dataSources.ts

# Update src/index.ts to remove:
# - import connections from "./connections"
# - import triggers from "./triggers"
# - import dataSources from "./dataSources"
# - connections, triggers, dataSources from component() call
```

Then implement your utility actions in `src/actions.ts`.

## Code Generation Process

1. Read requirements from `requirements.json`
2. Read API research from `api-research.json` (connectors only)
3. Customize scaffold files based on requirements
4. Customize based on specific API patterns

## File Generation Order

When customizing scaffold files, work in this order to resolve dependencies:

1. `src/types.ts` - No dependencies
2. `src/inputs.ts` - No dependencies
3. `src/connections.ts` - Imports from spectral (note: CLI creates plural filename)
4. `src/client.ts` - Imports types, uses connection
5. `src/actions.ts` - Imports client, inputs
6. `src/triggers.ts` - Imports client, inputs
7. `src/dataSources.ts` - Imports client, inputs
8. `src/index.ts` - Imports all other files

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Component key | kebab-case | `my-component` |
| Class names | PascalCase | `MyComponentClient` |
| Function names | camelCase | `listResources` |
| Connection keys | camelCase | `myComponentApiKey` |
| Action keys | camelCase | `createResource` |
| Input labels | Title Case | `Resource ID` |
| File names | kebab-case or camelCase | `client.ts` |

## types.ts Template

```typescript
// Type definitions for {ComponentName} component

/**
 * Main resource type
 */
export interface {ResourceName} {
  id: string;
  // Add fields from API research
}

/**
 * Create resource request
 */
export interface Create{ResourceName}Request {
  // Required fields from API research
}

/**
 * Update resource request
 */
export interface Update{ResourceName}Request {
  // Optional fields for updates
}

/**
 * API response wrapper (if API uses envelope)
 */
export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
  };
}

/**
 * Webhook payload
 */
export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: any;
}
```

## inputs.ts Template

```typescript
import { input, util } from "@prismatic-io/spectral";

export const connectionInput = input({
  label: "Connection",
  type: "connection",
  required: true,
});

export const idInput = input({
  label: "{Resource} ID",
  type: "string",
  required: true,
  comments: "The unique identifier for the {resource}",
  clean: util.types.toString,
});

// Add inputs for each field from API research
export const {fieldName}Input = input({
  label: "{Field Label}",
  type: "{type}", // string, boolean, number, password, code
  required: {true|false},
  comments: "{Field description}",
  clean: util.types.toString, // or toBool, toNumber, etc.
});
```

## Input Typing with Clean Functions

Use `clean` functions in input definitions to ensure proper types without manual casting in actions.

### Pattern

```typescript
import { input, util } from "@prismatic-io/spectral";

export const idInput = input({
  label: "ID",
  type: "string",
  required: true,
  clean: util.types.toString,
});

export const limitInput = input({
  label: "Limit",
  type: "string",
  default: "10",
  clean: util.types.toInt,
});

export const enabledInput = input({
  label: "Enabled",
  type: "boolean",
  default: "true",
  clean: util.types.toBool,
});
```

### In Actions (no casting needed)

When inputs use `clean` functions, the `params` object has correct types:

```typescript
// params.id is already string, params.limit is already number
await client.get(params.id, { limit: params.limit });

// params.enabled is already boolean
if (params.enabled) {
  await client.enable(params.id);
}
```

### Available Clean Functions

| Function | Output Type | Use For |
|----------|-------------|---------|
| `util.types.toString` | `string` | Text inputs, IDs, names |
| `util.types.toInt` | `number` | Integer counts, limits, offsets |
| `util.types.toNumber` | `number` | Decimal values, amounts |
| `util.types.toBool` | `boolean` | Flags, toggles, enabled/disabled |
| `util.types.toDate` | `Date` | Date/time inputs |

### Why This Matters

Without `clean` functions, you must cast everywhere:

```typescript
// BAD - requires manual casting in every action
const id = params.id as string;
const limit = parseInt(params.limit as string, 10);
const enabled = params.enabled === "true" || params.enabled === true;
```

With `clean` functions, casting is automatic:

```typescript
// GOOD - clean functions handle type conversion
const { id, limit, enabled } = params;
// id: string, limit: number, enabled: boolean
```

### Connection Input (Special Case)

The connection input doesn't need a `clean` function:

```typescript
export const connectionInput = input({
  label: "Connection",
  type: "connection",
  required: true,
});
```

## connections.ts Template (Connector)

**Note:** The CLI creates `connections.ts` (plural). The template below shows the pattern to customize.

```typescript
import { connection, input, oauth2Connection, OAuth2Type } from "@prismatic-io/spectral";

// API Key Connection
export const apiKeyConnection = connection({
  key: "{componentName}ApiKey",
  display: {
    label: "{ComponentName} API Key",
    description: "Connect to {ComponentName} using an API key",
  },
  inputs: {
    api_key: input({
      label: "API Key",
      type: "password",
      required: true,
      comments: "Your {ComponentName} API key",
    }),
    base_url: input({
      label: "Base URL",
      type: "string",
      required: false,
      default: "{baseUrl from API research}",
      comments: "API base URL",
    }),
  },
});

// OAuth2 Connection (if supported)
export const oauth2Auth = oauth2Connection({
  key: "{componentName}OAuth2",
  display: {
    label: "{ComponentName} OAuth 2.0",
    description: "Connect to {ComponentName} using OAuth 2.0",
  },
  oauth2Type: OAuth2Type.AuthorizationCode,
  inputs: {
    authorizeUrl: {
      label: "Authorize URL",
      type: "string",
      required: true,
      default: "{authorizeUrl from API research}",
    },
    tokenUrl: {
      label: "Token URL",
      type: "string",
      required: true,
      default: "{tokenUrl from API research}",
    },
    scopes: {
      label: "Scopes",
      type: "string",
      required: false,
      default: "{scopes from API research}",
    },
    clientId: {
      label: "Client ID",
      type: "string",
      required: true,
    },
    clientSecret: {
      label: "Client Secret",
      type: "password",
      required: true,
    },
  },
});

export default [apiKeyConnection, oauth2Auth];
```

## client.ts Template (Connector)

```typescript
import type { Connection } from "@prismatic-io/spectral";
import {
  type HttpClient,
  createClient,
} from "@prismatic-io/spectral/dist/clients/http";
import type { {ResourceName}, ApiResponse } from "./types";

interface ConstructorParams {
  connection: Connection;
  debug?: boolean;
}

export class {ComponentName}Client {
  private client: HttpClient;

  constructor({ connection, debug = false }: ConstructorParams) {
    // Support both OAuth2 and API Key
    const token = connection.token?.access_token || connection.fields.api_key;
    const baseUrl = (connection.fields.base_url as string) || "{defaultBaseUrl}";

    if (!token) {
      throw new Error("No authentication credentials provided");
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

  // Resource operations - generate from API research
  public readonly {resourceName} = {
    list: async (): Promise<{ResourceName}[]> => {
      const response = await this.client.get<ApiResponse<{ResourceName}[]>>(
        "/{resourcePath}"
      );
      return response.data.data;
    },

    get: async (id: string): Promise<{ResourceName}> => {
      const response = await this.client.get<ApiResponse<{ResourceName}>>(
        `/{resourcePath}/${id}`
      );
      return response.data.data;
    },

    create: async (data: Omit<{ResourceName}, "id">): Promise<{ResourceName}> => {
      const response = await this.client.post<ApiResponse<{ResourceName}>>(
        "/{resourcePath}",
        data
      );
      return response.data.data;
    },

    update: async (
      id: string,
      data: Partial<{ResourceName}>
    ): Promise<{ResourceName}> => {
      const response = await this.client.put<ApiResponse<{ResourceName}>>(
        `/{resourcePath}/${id}`,
        data
      );
      return response.data.data;
    },

    delete: async (id: string): Promise<void> => {
      await this.client.delete(`/{resourcePath}/${id}`);
    },
  };

  // Webhook operations (if supported)
  public readonly webhook = {
    register: async (payload: {
      url: string;
      events: string[];
    }): Promise<{ id: string }> => {
      const response = await this.client.post<{ data: { id: string } }>(
        "/webhooks",
        payload
      );
      return response.data.data;
    },

    delete: async (id: string): Promise<void> => {
      await this.client.delete(`/webhooks/${id}`);
    },
  };
}
```

## actions.ts Template

```typescript
import { action } from "@prismatic-io/spectral";
import { {ComponentName}Client } from "./client";
import { connectionInput, idInput, {fieldInputs} } from "./inputs";

// List action
const list{ResourceName}s = action({
  display: {
    label: "List {ResourceName}s",
    description: "Get a list of all {resourceName}s",
  },
  inputs: {
    connection: connectionInput,
  },
  perform: async (context, params) => {
    const client = new {ComponentName}Client({
      connection: params.connection,
      debug: context.debug.enabled,
    });
    const items = await client.{resourceName}.list();
    return { data: items };
  },
});

// Get action
const get{ResourceName} = action({
  display: {
    label: "Get {ResourceName}",
    description: "Get a specific {resourceName} by ID",
  },
  inputs: {
    connection: connectionInput,
    id: idInput,
  },
  perform: async (context, params) => {
    const client = new {ComponentName}Client({
      connection: params.connection,
      debug: context.debug.enabled,
    });
    const item = await client.{resourceName}.get(params.id);
    return { data: item };
  },
});

// Create action
const create{ResourceName} = action({
  display: {
    label: "Create {ResourceName}",
    description: "Create a new {resourceName}",
  },
  inputs: {
    connection: connectionInput,
    // Add inputs for required fields
  },
  perform: async (context, params) => {
    const client = new {ComponentName}Client({
      connection: params.connection,
      debug: context.debug.enabled,
    });
    const item = await client.{resourceName}.create({
      // Map params to request body
    });
    return { data: item };
  },
});

// Update action
const update{ResourceName} = action({
  display: {
    label: "Update {ResourceName}",
    description: "Update an existing {resourceName}",
  },
  inputs: {
    connection: connectionInput,
    id: idInput,
    // Add inputs for updatable fields
  },
  perform: async (context, params) => {
    const client = new {ComponentName}Client({
      connection: params.connection,
      debug: context.debug.enabled,
    });

    const updates: Record<string, any> = {};
    // Only include provided values
    if (params.{field} !== undefined) updates.{field} = params.{field};

    const item = await client.{resourceName}.update(params.id, updates);
    return { data: item };
  },
});

// Delete action
const delete{ResourceName} = action({
  display: {
    label: "Delete {ResourceName}",
    description: "Delete a {resourceName}",
  },
  inputs: {
    connection: connectionInput,
    id: idInput,
  },
  perform: async (context, params) => {
    const client = new {ComponentName}Client({
      connection: params.connection,
      debug: context.debug.enabled,
    });
    await client.{resourceName}.delete(params.id);
    return { data: { success: true } };
  },
});

export default {
  list{ResourceName}s,
  get{ResourceName},
  create{ResourceName},
  update{ResourceName},
  delete{ResourceName},
};
```

## Error Handling

Add try/catch blocks for better error messages:

```typescript
perform: async (context, params) => {
  try {
    const client = new MyClient({ connection: params.connection });
    const result = await client.resource.get(params.id);
    return { data: result };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get resource: ${error.message}`);
    }
    throw error;
  }
},
```

## Utility Component Actions

For utility components without external API:

```typescript
import { action, input } from "@prismatic-io/spectral";

const formatDate = action({
  display: {
    label: "Format Date",
    description: "Format a date string",
  },
  inputs: {
    date: input({
      label: "Date",
      type: "string",
      required: true,
      comments: "Date to format (ISO 8601)",
    }),
    format: input({
      label: "Format",
      type: "string",
      required: true,
      default: "YYYY-MM-DD",
      comments: "Output format",
    }),
  },
  perform: async (context, params) => {
    // Implement formatting logic
    const formatted = formatDateString(params.date, params.format);
    return { data: formatted };
  },
});

export default { formatDate };
```
