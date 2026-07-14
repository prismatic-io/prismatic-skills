# Understanding Component Authentication Patterns

## Overview

When using Prismatic components via **manifests** in your CNI, the authentication is handled automatically through connection helpers. This guide explains:

- How to use manifest connection helpers for OAuth and API keys
- Common authentication patterns across different components
- How to troubleshoot authentication issues
- Understanding authentication configuration options

**Primary approach:** Use component manifests with connection helpers. Authentication is configured in `configPages.ts` and automatically applied to component actions.

---

## Using Manifest Connection Helpers

### The Easy Way: Manifest Connections

Component manifests provide connection helper functions that handle all authentication complexity:

```typescript
// src/configPages.ts
import { slackOauth2 } from "./manifests/slack/connections/oauth2";

"Slack Connection": slackOauth2("slack-connection", {
  clientId: { value: process.env.SLACK_CLIENT_ID || "" },
  clientSecret: { value: process.env.SLACK_CLIENT_SECRET || "" },
  scopes: { value: "chat:write channels:read" },
})
```

When you call component actions, authentication is automatic:

```typescript
import slackActions from "../manifests/slack/actions";

// Connection handles all auth headers, token refresh, etc.
await slackActions.postMessage.perform({
  connection: context.configVars["Slack Connection"],
  channelName: "general",
  message: "Hello!",
});
```

---

## Finding Connection Helpers in Manifests

After installing a manifest, check the connections directory:

```
src/manifests/<component>/connections/
├── index.ts
├── oauth2.ts        # OAuth 2.0 connection
├── apiKey.ts        # API key connection
└── basic.ts         # Basic auth connection
```

Import the appropriate helper based on the API's authentication method.

---

## OAuth 2.0 Connection Pattern

Most SaaS platforms use OAuth 2.0. The manifest helper handles:

- Authorization URL redirect
- Token exchange
- Token refresh
- Scope management

### OAuth Configuration

```typescript
import { salesforceOauth2 } from "./manifests/salesforce/connections/oauth2";

"Salesforce Connection": salesforceOauth2("salesforce-connection", {
  clientId: {
    value: process.env.SALESFORCE_CLIENT_ID || "",
    permissionAndVisibilityType: "organization",
    visibleToOrgDeployer: false,
  },
  clientSecret: {
    value: process.env.SALESFORCE_CLIENT_SECRET || "",
    permissionAndVisibilityType: "organization",
    visibleToOrgDeployer: false,
  },
  // Some connections require additional fields
  instanceUrl: {
    permissionAndVisibilityType: "customer",  // User provides their instance URL
  },
})
```

### Permission and Visibility Types

- **`organization`** - Set by your organization, hidden from customers
- **`customer`** - Customer provides the value during configuration
- **`embedded`** - Set programmatically via embedded SDK

### OAuth Scopes

Scopes define what permissions the integration needs:

```typescript
"Slack Connection": slackOauth2("slack-connection", {
  clientId: { value: process.env.SLACK_CLIENT_ID || "" },
  clientSecret: { value: process.env.SLACK_CLIENT_SECRET || "" },
  scopes: {
    value: "chat:write chat:write.public channels:read users:read",
    permissionAndVisibilityType: "organization",
    visibleToOrgDeployer: false,
  },
})
```

---

## API Key Connection Pattern

For services using API keys instead of OAuth:

```typescript
import { sendgridApiKey } from "./manifests/sendgrid/connections/apiKey";

"SendGrid Connection": sendgridApiKey("sendgrid-connection", {
  apiKey: {
    permissionAndVisibilityType: "customer",  // Customer provides their key
  },
})
```

### API Key Placement

Different APIs expect keys in different places. Manifest helpers handle this automatically:

- **Header**: `Authorization: Bearer <key>` or `X-API-Key: <key>`
- **Query parameter**: `?api_key=<key>`
- **Basic auth**: Encoded in Authorization header

---

## Error Handling for Auth Issues

When authentication fails, provide clear error messages:

```typescript
import slackActions from "../manifests/slack/actions";

onExecution: async (context, params) => {
  try {
    const result = await slackActions.postMessage.perform({
      connection: context.configVars["Slack Connection"],
      channelName: "general",
      message: "Hello!",
    });
    return { data: result };
  } catch (error) {
    // Check for authentication errors
    if (error.message?.includes("401") || error.message?.includes("unauthorized")) {
      context.logger.error("Slack authentication failed - token may be expired");
      throw new Error(
        "Authentication failed. Please re-authorize your Slack connection in the integration settings."
      );
    }

    if (error.message?.includes("403") || error.message?.includes("forbidden")) {
      context.logger.error("Slack access forbidden - insufficient permissions");
      throw new Error(
        "Access forbidden. Your Slack app may not have sufficient permissions. " +
        "Required scopes: chat:write"
      );
    }

    throw error;
  }
};
```

---

## Common Authentication Patterns

Understanding these patterns helps when configuring connections or troubleshooting:

### Pattern 1: Bearer Token (OAuth 2.0)

**Used by:** Slack, GitHub, Salesforce, most modern APIs

Manifest helpers handle this automatically. The token is included as:
```
Authorization: Bearer <access_token>
```

### Pattern 2: API Key in Header

**Used by:** SendGrid, many custom APIs

```typescript
import { apiKeyConnection } from "./manifests/api/connections/apiKey";

"API Connection": apiKeyConnection("api-connection", {
  apiKey: { permissionAndVisibilityType: "customer" },
})
```

### Pattern 3: Basic Auth

**Used by:** JIRA, Confluence, some legacy APIs

```typescript
import { basicAuthConnection } from "./manifests/http/connections/basicAuth";

"JIRA Connection": basicAuthConnection("jira-connection", {
  username: { permissionAndVisibilityType: "customer" },
  password: { permissionAndVisibilityType: "customer" },
})
```

---

## Troubleshooting Authentication

### Issue 1: "401 Unauthorized"

**Common causes:**

1. Token expired - Customer needs to re-authorize
2. Wrong credentials - Verify client ID/secret
3. Missing scopes - Add required OAuth scopes

**Solution:**

```typescript
// Check for auth errors and provide helpful message
catch (error) {
  if (error.message?.includes("401")) {
    throw new Error(
      "Authentication failed. Please re-authorize your connection."
    );
  }
  throw error;
}
```

### Issue 2: "403 Forbidden"

**Common causes:**

1. Insufficient OAuth scopes
2. API key lacks permissions
3. IP restrictions on the account

**Solution:**

Verify required scopes in your connection configuration:

```typescript
scopes: {
  value: "chat:write channels:read users:read",  // Add missing scopes
}
```

### Issue 3: Token Not Refreshing

**Symptom:** Works initially, fails after token expires

**Solution:** Manifest connections handle refresh automatically, but ensure:

1. Refresh token is included in OAuth response
2. Token endpoint is accessible
3. Client credentials are correct

### Issue 4: Connection Test Fails

**Steps to debug:**

1. Verify credentials in Prismatic UI
2. Check OAuth app configuration in the third-party service
3. Ensure redirect URI matches: `https://oauth2.prismatic.io/callback`
4. Check if the service requires specific OAuth scopes

---

## Best Practices

### 1. Use Organization-Level Credentials

Store OAuth client credentials at organization level:

```typescript
clientId: {
  value: process.env.SLACK_CLIENT_ID || "",
  permissionAndVisibilityType: "organization",
  visibleToOrgDeployer: false,
},
```

### 2. Request Minimum Scopes

Only request OAuth scopes your integration actually needs:

```typescript
scopes: {
  value: "chat:write channels:read",  // Not "chat:write channels:read users:read admin"
}
```

### 3. Log Authentication Events

```typescript
context.logger.info("Calling Slack API", { action: "postMessage" });
// ... API call
context.logger.info("Slack API call successful");
```

### 4. Handle Errors Gracefully

```typescript
try {
  await slackActions.postMessage.perform({...});
} catch (error) {
  context.logger.error(`Slack API error: ${error.message}`);
  throw new Error(`Failed to send Slack message: ${error.message}`);
}
```

---

---

## Summary

**Key Takeaway:** Use component manifest connection helpers for authentication. They handle:

1. **OAuth flows** - Authorization, token exchange, refresh
2. **API keys** - Header placement and formatting
3. **Error handling** - Token expiration, invalid credentials
4. **Retry logic** - Rate limiting, transient failures

**Workflow:**

1. Install manifest: `prismatic-tools install-manifest <component>`
2. Import connection helper: `import { slackOauth2 } from "./manifests/slack/connections/oauth2"`
3. Configure in `configPages.ts` with appropriate visibility settings
4. Pass connection to component actions: `connection: configVars["Connection Name"]`

---

## Related Documentation

- [Component Manifest Guide](../manifest-pattern.md) - Complete manifest reference
- [Using Components](using-components.md) - Component usage patterns
- [OAuth Connection Examples](oauth-connection.md) - OAuth configuration details
- [Troubleshooting Errors](../troubleshooting-errors.md) - Common error solutions
