# Prismatic CNI GitHub Examples Reference

## Using Component Manifests

**The GitHub examples referenced below use the component manifest approach, which is the recommended pattern.**

**For development, use component manifests:**

- See: [manifest-pattern.md](../manifest-pattern.md) for complete guide
- Install manifests with `prismatic-tools install-manifest <component>`
- Register in `componentRegistry.ts`
- Import manifest actions and call `<component>Actions.<action>.perform()`

---

This document provides a comprehensive directory of all Code Native Integration examples available in the Prismatic GitHub repository, with descriptions and specific use cases for each.

**Repository**: <https://github.com/prismatic-io/examples/tree/main/integrations/code-native-integrations>

---

## Available Examples

### 1. Salesforce Integration

**Path**: `/integrations/code-native-integrations/salesforce/`

**Description**: Full OAuth2 integration with Salesforce using jsforce SDK.

**What It Demonstrates:**

- OAuth2 connection using Prismatic Salesforce component
- Using jsforce library for Salesforce API calls
- SOQL queries for data retrieval
- Data transformation from Salesforce format
- Multiple flows (get opportunities, update opportunity)
- Type-safe Salesforce data models

**Key Files:**

- `src/configPages.ts` - OAuth connection configuration
- `src/services/salesforceClient.ts` - Connection helper functions
- `src/flows/getMyOpportunities.ts` - Query current user's opportunities
- `src/flows/updateOpportunity.ts` - Update opportunity fields
- `src/types/` - TypeScript interfaces for Salesforce objects

**Use This Example For:**

- Learning OAuth2 setup with pre-built component
- Working with jsforce SDK
- Understanding data transformations
- Multi-flow integrations

**Direct Links:**

- Config: <https://github.com/prismatic-io/examples/blob/main/integrations/code-native-integrations/salesforce/src/configPages.ts>
- Helper: <https://github.com/prismatic-io/examples/blob/main/integrations/code-native-integrations/salesforce/src/services/salesforceClient.ts>
- Flow: <https://github.com/prismatic-io/examples/blob/main/integrations/code-native-integrations/salesforce/src/flows/getMyOpportunities.ts>

---

### 2. Slack CNI Integration (Multi-Flow)

**Path**: `/integrations/code-native-integrations/slack-cni-integration/`

**Description**: Complete Slack integration demonstrating multiple flows, data sources, and lifecycle hooks.

**What It Demonstrates:**

- Custom OAuth2 configuration (not using component)
- Data source for dynamic channel dropdown
- Two different flow types:
  - Scheduled flow (TODO alerts)
  - Webhook flow (account notifications with XML parsing)
- Lifecycle hooks (onInstanceDeploy, onInstanceDelete)
- Shared configuration across flows
- HTTP client creation helper

**Key Files:**

- `src/connections.ts` - Custom OAuth2 configuration
- `src/dataSources.ts` - Dynamic channel selector with pagination
- `src/flows/todoAlerts.ts` - Scheduled flow pattern
- `src/flows/sendSlackMessages.ts` - Webhook flow with onTrigger/onExecution
- `src/slackClient.ts` - Reusable HTTP client helper

**Use This Example For:**

- Custom OAuth2 setup (no pre-built component)
- Data sources with pagination
- Multi-flow architecture
- Webhook parsing (XML)
- Lifecycle hooks for webhook registration

**Direct Links:**

- OAuth: <https://github.com/prismatic-io/examples/blob/main/integrations/code-native-integrations/slack-cni-integration/src/connections.ts>
- Data Source: <https://github.com/prismatic-io/examples/blob/main/integrations/code-native-integrations/slack-cni-integration/src/dataSources.ts>
- Webhook Flow: <https://github.com/prismatic-io/examples/blob/main/integrations/code-native-integrations/slack-cni-integration/src/flows/sendSlackMessages.ts>

---

### 3. Shared Endpoint Example (Preprocess Flow)

**Path**: `/integrations/code-native-integrations/shared-endpoint-example/`

**Description**: Advanced pattern showing how to route incoming webhooks to different flows based on payload content.

**What It Demonstrates:**

- Preprocess flow pattern
- Dynamic flow routing
- Single webhook URL for multiple event types
- Flow mapper pattern

**Key Files:**

- `src/flows.ts` - All three flows (preprocess, create, update)

**Flow Architecture:**

```
Webhook → Preprocess Flow → Determines which flow to run
                           ↓
                    ┌──────┴───────┐
                    ↓              ↓
            Create Flow      Update Flow
```

**Use This Example For:**

- Handling multiple event types on one webhook
- Dynamic flow routing
- Reducing webhook URL sprawl
- Event-driven architectures

**Direct Links:**

- Flows: <https://github.com/prismatic-io/examples/blob/main/integrations/code-native-integrations/shared-endpoint-example/src/flows.ts>
- Documentation: <https://github.com/prismatic-io/examples/blob/main/integrations/code-native-integrations/shared-endpoint-example/src/documentation.md>

---

### 4. Gong Integration

**Path**: `/integrations/code-native-integrations/gong/`

**Description**: Real-world integration with Gong API demonstrating advanced patterns.

**What It Demonstrates:**

- Complex API authentication
- Advanced data transformations
- Error handling patterns
- Rate limiting considerations
- Testing with vitest

**Use This Example For:**

- Complex API integrations
- Advanced error handling
- Rate limiting strategies
- Modern testing approaches (vitest)

---

### 5. Outlook Integration

**Path**: `/integrations/code-native-integrations/outlook/`

**Description**: Microsoft Outlook/Office 365 integration example.

**What It Demonstrates:**

- Microsoft OAuth2 (tenant-specific)
- Microsoft Graph API usage
- Email and calendar operations
- Microsoft-specific authentication patterns

**Use This Example For:**

- Microsoft services integrations
- Microsoft Graph API patterns
- Tenant-based authentication

---

## Example Selection Guide

### I need to learn

#### OAuth2 Basics

→ **Start with**: Salesforce example
→ **Why**: Uses pre-built component, simplest OAuth setup
→ **File**: `/salesforce/src/configPages.ts`

#### Custom OAuth2

→ **Start with**: Slack CNI Integration
→ **Why**: Shows full OAuth2 configuration without component
→ **File**: `/slack-cni-integration/src/connections.ts`

#### Data Sources

→ **Start with**: Slack CNI Integration
→ **Why**: Complete data source with pagination
→ **File**: `/slack-cni-integration/src/dataSources.ts`

#### Multi-Flow Architecture

→ **Start with**: Slack CNI Integration
→ **Why**: Two different flow types, shared config
→ **Files**: `/slack-cni-integration/src/flows/`

#### Webhook Handling

→ **Start with**: Slack CNI Integration (sendSlackMessages flow)
→ **Why**: Complete webhook with onTrigger/onExecution pattern
→ **File**: `/slack-cni-integration/src/flows/sendSlackMessages.ts`

#### Webhook Routing

→ **Start with**: Shared Endpoint Example
→ **Why**: Shows preprocess flow pattern for routing
→ **File**: `/shared-endpoint-example/src/flows.ts`

#### XML Parsing

→ **Start with**: Slack CNI Integration (sendSlackMessages flow)
→ **Why**: Shows fast-xml-parser usage in onTrigger
→ **File**: `/slack-cni-integration/src/flows/sendSlackMessages.ts` (lines 25-60)

#### Data Transformation

→ **Start with**: Salesforce example
→ **Why**: Clean data transformation patterns
→ **File**: `/salesforce/src/flows/getMyOpportunities.ts` (lines 100-120)

#### Lifecycle Hooks

→ **Start with**: Slack CNI Integration (sendSlackMessages flow)
→ **Why**: Shows onInstanceDeploy and onInstanceDelete
→ **File**: `/slack-cni-integration/src/flows/sendSlackMessages.ts` (lines 93-112)

---

## Pattern Quick Reference

### Connection Patterns

#### Using Pre-built Component

```typescript
// See: /salesforce/src/configPages.ts
connectionConfigVar({
  dataType: "connection",
  connection: {
    component: "salesforce",
    key: "oauth2",
    values: {
      /* ... */
    },
  },
});
```

#### Custom OAuth2

```typescript
// See: /slack-cni-integration/src/connections.ts
connectionConfigVar({
  dataType: "connection",
  oauth2Type: OAuth2Type.AuthorizationCode,
  inputs: {
    authorizeUrl: {
      /* ... */
    },
    tokenUrl: {
      /* ... */
    },
    // ...
  },
});
```

### Data Source Patterns

#### With Pagination

```typescript
// See: /slack-cni-integration/src/dataSources.ts (lines 22-64)
dataSourceConfigVar({
  dataSourceType: "picklist",
  perform: async (context) => {
    let items = [];
    let cursor = null;
    do {
      const response = await api.get({ params: { cursor } });
      items = [...items, ...response.data];
      cursor = response.data.next_cursor;
    } while (cursor && items.length < 10000);
    return { result: items.map(/* transform */) };
  },
});
```

### Flow Patterns

#### Scheduled Flow

```typescript
// Scheduled flow with polling logic
flow({
  name: "Daily Sync",
  stableKey: "daily-sync",

  // Schedule is REQUIRED for scheduled flows
  schedule: { value: "0 * * * *" }, // Every hour
  // OR use a config var: schedule: { configVar: "My Schedule" }

  onExecution: async (context) => {
    // Main logic here - runs on schedule
    const { logger, crossFlowState } = context;
    const lastRun = (crossFlowState["lastRun"] as string) ?? "0";
    // Fetch changes since last run...
    crossFlowState["lastRun"] = new Date().toISOString();
    return { data: null };
  },
});
```

#### Manual/Webhook Passthrough Flow

```typescript
// See: /slack-cni-integration/src/flows/todoAlerts.ts
// This is a manually-invoked flow (triggered via webhook URL without payload processing)
flow({
  name: "Manual Flow",
  stableKey: "manual-flow",

  onTrigger: async (context, payload) => Promise.resolve({ payload }),
  onExecution: async (context) => {
    // Main logic here
  },
});
```

#### Webhook Flow with Parsing

```typescript
// See: /slack-cni-integration/src/flows/sendSlackMessages.ts
flow({
  onTrigger: async (context, payload) => {
    const parsed = parser.parse(payload.rawBody.data);
    return {
      payload: { ...payload, body: { data: parsed } },
      // HttpResponse requires statusCode, contentType, and body (string)
      response: { statusCode: 200, contentType: "text/plain", body: "ok" },
    };
  },
  onExecution: async (context, params) => {
    const data = params.onTrigger.results.body.data;
    // Process parsed data
  },
});
```

#### Preprocess Flow (Routing)

```typescript
// See: /shared-endpoint-example/src/flows.ts (lines 28-43)
flow({
  preprocessFlowConfig: { flowNameField: "myFlowName" },
  onExecution: async (context, params) => {
    const event = params.onTrigger.results.body.data.event;
    return { data: { myFlowName: flowMapper[event] } };
  },
});
```

---

## Common Code Snippets

All examples use similar patterns for common tasks:

### Creating HTTP Client

```typescript
// See: /slack-cni-integration/src/slackClient.ts
import { createClient } from "@prismatic-io/spectral/dist/clients/http";

export const createClient = (connection: Connection) => {
  return createClient({
    baseUrl: "https://api.example.com",
    headers: {
      Authorization: `Bearer ${connection.token?.access_token}`,
    },
  });
};
```

### Error Handling

```typescript
// See: /salesforce/src/flows/getMyOpportunities.ts (lines 129-132)
try {
  const result = await operation();
} catch (e) {
  const error = e as Error;
  throw new Error(`User-friendly message: ${error.message}`);
}
```

### Data Transformation

```typescript
// See: /salesforce/src/flows/getMyOpportunities.ts (lines 101-119)
const transformed = apiData.records.map((record) => ({
  // Map API fields to clean format
  id: record.Id,
  name: record.Name,
  // Add computed fields
  daysToClose: calculateDays(record.CloseDate),
  // Handle nulls
  amount: record.Amount || 0,
}));
```

---

## Example Comparison Matrix

| Example         | OAuth          | Data Sources | Multi-Flow | Webhooks    | Components | Lifecycle Hooks |
| --------------- | -------------- | ------------ | ---------- | ----------- | ---------- | --------------- |
| Salesforce      | ✅ (Component) | ❌           | ✅         | ❌          | ✅         | ❌              |
| Slack CNI       | ✅ (Custom)    | ✅           | ✅         | ✅ (XML)    | ❌         | ✅              |
| Shared Endpoint | ❌             | ❌           | ✅         | ✅ (Router) | ❌         | ❌              |
| Gong            | ✅             | ❌           | ✅         | ❌          | ❌         | ❌              |
| Outlook         | ✅ (Microsoft) | ❌           | ✅         | ❌          | ✅         | ❌              |

---

## Additional Resources

- **Main Docs**: <https://prismatic.io/docs/spectral/>
- **Examples Repo**: <https://github.com/prismatic-io/examples>
- **Community Forum**: <https://community.prismatic.io/>
- **Office Hours**: <https://prismatic.io/office-hours/>

---

## Quick Links to Specific Patterns

### OAuth Patterns

- [Salesforce Component OAuth](https://github.com/prismatic-io/examples/blob/main/integrations/code-native-integrations/salesforce/src/configPages.ts)
- [Custom OAuth2 (Slack)](https://github.com/prismatic-io/examples/blob/main/integrations/code-native-integrations/slack-cni-integration/src/connections.ts)
- [Token Usage Helper](https://github.com/prismatic-io/examples/blob/main/integrations/code-native-integrations/salesforce/src/services/salesforceClient.ts)

### Data Sources

- [Channel Picker with Pagination](https://github.com/prismatic-io/examples/blob/main/integrations/code-native-integrations/slack-cni-integration/src/dataSources.ts)

### Flows

- [Scheduled Flow](https://github.com/prismatic-io/examples/blob/main/integrations/code-native-integrations/slack-cni-integration/src/flows/todoAlerts.ts)
- [Webhook with XML](https://github.com/prismatic-io/examples/blob/main/integrations/code-native-integrations/slack-cni-integration/src/flows/sendSlackMessages.ts)
- [Preprocess Router](https://github.com/prismatic-io/examples/blob/main/integrations/code-native-integrations/shared-endpoint-example/src/flows.ts)
- [Data Transformation](https://github.com/prismatic-io/examples/blob/main/integrations/code-native-integrations/salesforce/src/flows/getMyOpportunities.ts)

### Helpers

- [HTTP Client Factory](https://github.com/prismatic-io/examples/blob/main/integrations/code-native-integrations/slack-cni-integration/src/slackClient.ts)
- [jsforce Connection](https://github.com/prismatic-io/examples/blob/main/integrations/code-native-integrations/salesforce/src/services/salesforceClient.ts)
