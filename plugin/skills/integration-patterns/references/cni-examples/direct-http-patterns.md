# Direct HTTP Patterns

When no Prismatic component exists for a system, use direct HTTP calls with axios.

## When to use direct HTTP

- `prismatic-tools find-components` returned no results for the system
- The system has a REST API with documentation
- You need full control over request/response handling

## Setup

axios is included in the Spectral SDK — no additional install needed.

```typescript
import { flow } from "@prismatic-io/spectral";
import axios from "axios";
```

## Auth header patterns

### Bearer token (OAuth or API token)
```typescript
const token = context.configVars["My Connection"].token?.access_token;
const headers = { Authorization: `Bearer ${token}` };
```

### API key in header
```typescript
const apiKey = context.configVars["My Connection"].fields.apiKey;
const headers = { "X-API-Key": apiKey };
```

### Basic auth
```typescript
const username = context.configVars["My Connection"].fields.username;
const password = context.configVars["My Connection"].fields.password;
const headers = {
  Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
};
```

### API key as query parameter
```typescript
const apiKey = context.configVars["API Key"] as unknown as string;
const url = `https://api.example.com/data?api_key=${apiKey}`;
```

## Typed response pattern

```typescript
interface ApiResponse {
  id: string;
  name: string;
  status: "active" | "inactive";
}

const { data } = await axios.get<ApiResponse>(
  "https://api.example.com/resource/123",
  { headers }
);
```

## Error handling

```typescript
try {
  const { data } = await axios.post(url, payload, { headers });
  return { data };
} catch (error) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body = error.response?.data;
    context.logger.error(`API error ${status}: ${JSON.stringify(body)}`);

    if (status === 429) {
      // Rate limited — let Prismatic's retry handle it
      throw new Error(`Rate limited by API. Retry after delay.`);
    }
    if (status && status >= 500) {
      // Server error — retryable
      throw new Error(`Server error ${status}. Will retry.`);
    }
    // Client error (4xx) — not retryable, log and fail
    throw new Error(`API returned ${status}: ${JSON.stringify(body)}`);
  }
  throw error;
}
```

## Rate limit handling

```typescript
const response = await axios.get(url, { headers });

// Check rate limit headers (common patterns)
const remaining = parseInt(response.headers["x-ratelimit-remaining"] ?? "999", 10);
const resetAt = parseInt(response.headers["x-ratelimit-reset"] ?? "0", 10);

if (remaining < 5) {
  context.logger.warn(`Rate limit low: ${remaining} remaining, resets at ${new Date(resetAt * 1000).toISOString()}`);
}
```

## Pagination pattern

```typescript
interface PaginatedResponse<T> {
  data: T[];
  nextCursor?: string;
  hasMore: boolean;
}

async function fetchAll<T>(url: string, headers: Record<string, string>): Promise<T[]> {
  const allItems: T[] = [];
  let cursor: string | undefined;

  do {
    const params = cursor ? { cursor } : {};
    const { data } = await axios.get<PaginatedResponse<T>>(url, { headers, params });
    allItems.push(...data.data);
    cursor = data.hasMore ? data.nextCursor : undefined;
  } while (cursor);

  return allItems;
}
```

## Complete flow example — direct HTTP to external API

```typescript
import { flow } from "@prismatic-io/spectral";
import axios from "axios";

interface OrderPayload {
  orderId: string;
  customerEmail: string;
  total: number;
}

interface ErpResponse {
  erpOrderId: string;
  status: string;
}

export const orderSync = flow({
  name: "Order Sync",
  stableKey: "order-sync",
  description: "Syncs orders to ERP via direct API calls",

  onExecution: async (context, params) => {
    const payload = params.onTrigger.results;
    const order = payload.body.data as unknown as OrderPayload;

    // Get API credentials from config
    const apiKey = context.configVars["ERP Connection"].fields.apiKey as string;
    const baseUrl = context.configVars["ERP Base URL"] as unknown as string;

    const headers = {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    };

    // POST to external API
    const { data } = await axios.post<ErpResponse>(
      `${baseUrl}/orders`,
      {
        externalId: order.orderId,
        email: order.customerEmail,
        amount: order.total,
      },
      { headers }
    );

    context.logger.info(`Created ERP order ${data.erpOrderId} with status ${data.status}`);
    return { data: null };
  },
});

export default [orderSync];
```

## Connection config for direct HTTP

When using direct HTTP, create a simple connection on the config page:

```typescript
import { configPage, configVar } from "@prismatic-io/spectral";

export const configPages = {
  "API Connection": configPage({
    elements: {
      "API Key": configVar({
        stableKey: "api-key",
        dataType: "string",
        description: "API key for the external service",
        permissionAndVisibilityType: "organization",
        visibleToOrgDeployer: false,
      }),
      "Base URL": configVar({
        stableKey: "base-url",
        dataType: "string",
        description: "Base URL for the API",
        defaultValue: "https://api.example.com/v1",
      }),
    },
  }),
};
```
