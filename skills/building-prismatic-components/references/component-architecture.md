# Component Architecture

Prismatic custom components follow a single-directory structure with TypeScript source files compiled by webpack.

## Directory Structure

```
components/{component-name}/
├── src/
│   ├── client.ts           # HTTP client (connectors only)
│   ├── types.ts            # TypeScript interfaces
│   ├── connection.ts       # Connection definitions (connectors only)
│   ├── actions.ts          # Component actions
│   ├── triggers.ts         # Webhook triggers (connectors only)
│   ├── dataSources.ts      # Picklist data sources (optional)
│   ├── inputs.ts           # Reusable input definitions
│   └── index.ts            # Component registration
├── assets/
│   └── icon.png            # Component icon (128x128 recommended)
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── webpack.config.js       # Build configuration
└── README.md               # Documentation
```

## File Responsibilities

### index.ts

The main component registration file that ties everything together.

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
    description: "Description of what this component does",
    iconPath: "icon.png",
  },
  actions,
  triggers,
  dataSources,
  connections,
});
```

### actions.ts

Component actions are the primary operations users can perform.

```typescript
import { action } from "@prismatic-io/spectral";
import { MyClient } from "./client";
import { connectionInput } from "./inputs";

const listItems = action({
  display: {
    label: "List Items",
    description: "Get all items",
  },
  inputs: {
    connection: connectionInput,
  },
  perform: async (context, params) => {
    const client = new MyClient({ connection: params.connection });
    const items = await client.items.list();
    return { data: items };
  },
});

export default { listItems };
```

### client.ts

HTTP client that communicates with the external API.

```typescript
import type { Connection } from "@prismatic-io/spectral";
import { createClient, HttpClient } from "@prismatic-io/spectral/dist/clients/http";

export class MyClient {
  private client: HttpClient;

  constructor({ connection }: { connection: Connection }) {
    const token = connection.token?.access_token || connection.fields.api_key;

    this.client = createClient({
      baseUrl: "https://api.example.com",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  public readonly items = {
    list: async () => {
      const response = await this.client.get("/items");
      return response.data;
    },

    get: async (id: string) => {
      const response = await this.client.get(`/items/${id}`);
      return response.data;
    },

    create: async (data: any) => {
      const response = await this.client.post("/items", data);
      return response.data;
    },
  };
}
```

### connection.ts

Connection definitions for authentication.

```typescript
import { connection, input, oauth2Connection, OAuth2Type } from "@prismatic-io/spectral";

// API Key connection
export const apiKeyConnection = connection({
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

// OAuth2 connection
export const oauth2 = oauth2Connection({
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

export default [apiKeyConnection, oauth2];
```

### triggers.ts

Webhook triggers for event-driven integrations.

```typescript
import { trigger } from "@prismatic-io/spectral";
import { MyClient } from "./client";
import { connectionInput } from "./inputs";

const webhookTrigger = trigger({
  display: {
    label: "Webhook",
    description: "Receive webhook events",
  },
  inputs: { connection: connectionInput },

  // Called when integration is deployed
  onInstanceDeploy: async (context, inputs) => {
    const client = new MyClient({ connection: inputs.connection });
    const webhookUrl = context.webhookUrls[context.flow.name];

    // Register webhook with external API
    const result = await client.webhooks.register({ url: webhookUrl });

    return {
      instanceState: { webhookId: result.id },
    };
  },

  // Called when integration is deleted
  onInstanceDelete: async (context, inputs) => {
    const webhookId = context.instanceState?.webhookId;
    if (webhookId) {
      const client = new MyClient({ connection: inputs.connection });
      await client.webhooks.delete(webhookId);
    }
  },

  // Called when webhook is received
  perform: async (context, payload) => {
    return { payload };
  },

  scheduleSupport: "invalid",
  synchronousResponseSupport: "valid",
});

export default { webhookTrigger };
```

### dataSources.ts

Picklist data sources for dropdown inputs.

```typescript
import { dataSource } from "@prismatic-io/spectral";
import { MyClient } from "./client";
import { connectionInput } from "./inputs";

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
    const client = new MyClient({ connection: params.connection });
    const items = await client.items.list();

    return {
      result: items.map((item) => ({
        label: item.name,
        key: item.id,
      })),
    };
  },
});

export default { itemList };
```

### inputs.ts

Reusable input definitions.

```typescript
import { input, util } from "@prismatic-io/spectral";

export const connectionInput = input({
  label: "Connection",
  type: "connection",
  required: true,
});

export const idInput = input({
  label: "ID",
  type: "string",
  required: true,
  clean: util.types.toString,
});
```

### types.ts

TypeScript interfaces for type safety.

```typescript
export interface Item {
  id: string;
  name: string;
  createdAt: string;
}

export interface WebhookPayload {
  event: string;
  data: any;
}
```

## Build Process

The component is built using webpack:

1. TypeScript files are compiled with `ts-loader`
2. Assets are copied to the dist folder
3. Output is a single `dist/index.js` file
4. Spectral is marked as an external dependency

## Utility vs Connector

| Feature | Utility | Connector |
|---------|---------|-----------|
| client.ts | No | Yes |
| connection.ts | No | Yes |
| triggers.ts | No | Yes (if webhooks) |
| dataSources.ts | Optional | Yes |
| actions.ts | Yes | Yes |
| inputs.ts | Yes | Yes |
| types.ts | Optional | Yes |
