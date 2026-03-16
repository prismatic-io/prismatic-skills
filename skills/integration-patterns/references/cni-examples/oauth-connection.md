# Example 02: OAuth2 Connection Pattern

## Overview

This example demonstrates how to implement **OAuth2 authentication** in a Prismatic CNI integration using Salesforce as a real-world example. OAuth2 is the industry-standard protocol for secure authorization, allowing your integration to access user data without storing passwords.

**Key Concepts:**

- OAuth2 connectionConfigVar setup
- Token management (access, refresh, instance URL)
- Using OAuth tokens with external SDKs (jsforce)
- Handling token refresh automatically
- Permission scopes and visibility

---

## What This Integration Does

1. Authenticates with Salesforce using OAuth2 authorization code flow
2. Stores access token, refresh token, and instance URL securely
3. Creates authenticated jsforce connection for API calls
4. Fetches current user's opportunities from Salesforce
5. Transforms Salesforce data into clean format

**Use Case**: Any integration requiring secure, delegated authorization (CRMs, marketing platforms, social media APIs).

---

## Complete OAuth2 Configuration

### Step 1: Define OAuth2 Connection

**`src/configPages.ts`**

```typescript
import { configPage, connectionConfigVar } from "@prismatic-io/spectral";

export const configPages = {
  Configuration: configPage({
    tagline: "Configure your Salesforce connection",
    elements: {
      "Salesforce Connection": connectionConfigVar({
        // ⭐ STABLE KEY - Never change after deployment ⭐
        stableKey: "salesforce-oauth-connection",

        // ⭐ CONNECTION TYPE ⭐
        // "connection" tells Prismatic this is an OAuth/API connection
        dataType: "connection",

        // ⭐ CONNECTION CONFIGURATION ⭐
        connection: {
          // Specify which Prismatic component provides the connection
          component: "salesforce",

          // The specific connection type (oauth2, basic, api-key, etc.)
          key: "oauth2",

          // ⭐ CONNECTION VALUES ⭐
          values: {
            // Client ID from your Salesforce Connected App
            clientId: {
              value: process.env.SALESFORCE_CLIENT_ID || "",

              // ⭐ PERMISSION TYPE ⭐
              // "organization" means org admins set this, users can't change it
              permissionAndVisibilityType: "organization",

              // Allow org deployers to see this value (but not regular users)
              visibleToOrgDeployer: true,
            },

            // Client Secret from your Salesforce Connected App
            clientSecret: {
              value: process.env.SALESFORCE_CLIENT_SECRET || "",
              permissionAndVisibilityType: "organization",
              visibleToOrgDeployer: true,
            },

            // OAuth2 scopes - what permissions to request
            scopes: {
              value: "api refresh_token",
              permissionAndVisibilityType: "organization",
              visibleToOrgDeployer: true,
            },
          },
        },
      }),
    },
  }),
};
```

---

### Key Patterns Explained

#### 1. connectionConfigVar vs Regular configVar

```typescript
// Regular config var - just stores a value
configVar({
  stableKey: "api-key",
  dataType: "string",
});

// Connection config var - manages OAuth flow
connectionConfigVar({
  stableKey: "oauth-connection",
  dataType: "connection",
  connection: {
    /* OAuth configuration */
  },
});
```

**WHY USE connectionConfigVar**:

- Prismatic handles the entire OAuth flow for you
- Token refresh is automatic
- Secure token storage
- Built-in UI for authorization
- Token lifecycle management

**WHEN TO USE**:

- OAuth2 (most modern APIs)
- OAuth1 (Twitter, legacy APIs)
- API key authentication
- Basic auth with special handling

#### 2. Permission and Visibility Types

```typescript
permissionAndVisibilityType: "organization";
```

**Options:**

- `"organization"` - Only org admins can set/modify
- `"customer"` - End customers can set/modify (common for API keys)
- `"embedded"` - For embedded integrations

**WHY "organization"**:

- Client ID/Secret should be consistent across all instances
- Prevents users from breaking authentication
- Centralized management of OAuth app credentials

```typescript
visibleToOrgDeployer: true;
```

**When to use**:

- Set to `true` for non-secret values (Client ID, URLs)
- Set to `false` for secrets (Client Secret, API keys)
- Helps with debugging without exposing secrets

#### 3. Using Environment Variables

```typescript
value: process.env.SALESFORCE_CLIENT_ID || "",
```

**BEST PRACTICE**: Store OAuth credentials in environment variables:

```bash
# .env file (never commit this!)
SALESFORCE_CLIENT_ID=your_client_id_here
SALESFORCE_CLIENT_SECRET=your_client_secret_here
```

**WHY**:

- Keeps secrets out of source code
- Different credentials for dev/staging/prod
- Easy rotation without code changes

**HOW TO LOAD**: Use `dotenv` package:

```typescript
// In index.ts or top of configPages.ts
import "dotenv/config";
```

#### 4. OAuth Scopes

```typescript
scopes: {
  value: "api refresh_token",
  // ...
}
```

**IMPORTANT**: Request only the scopes you need:

- `api` - Access Salesforce REST API
- `refresh_token` - Get refresh tokens for long-lived access
- `full` - Complete access (avoid unless necessary)
- `web` - Access identity URLs

**SECURITY**: Minimal scopes = minimal risk if token is compromised.

---

## Step 2: Create Helper for Using OAuth Connection

**`src/services/salesforceClient.ts`**

```typescript
import * as jsforce from "jsforce";
import { Connection } from "@prismatic-io/spectral";

/**
 * Creates an authenticated jsforce connection from Prismatic OAuth connection.
 *
 * WHY THIS HELPER:
 * - Encapsulates token extraction logic
 * - Handles refresh tokens automatically
 * - Provides type safety
 * - Reusable across all flows
 */
export function createSalesforceConnection(
  connection: Connection,
): jsforce.Connection {
  // ⭐ ACCESS TOKEN VALIDATION ⭐
  // Always validate tokens exist before using them
  if (!connection?.token?.access_token) {
    throw new Error("No access token found in connection");
  }

  // ⭐ INSTANCE URL ⭐
  // Salesforce uses instance-specific URLs (e.g., na1.salesforce.com)
  if (!connection?.token?.instance_url) {
    throw new Error("No instance URL found in connection");
  }

  // ⭐ CREATE AUTHENTICATED CONNECTION ⭐
  const conn = new jsforce.Connection({
    // Instance URL from OAuth response
    instanceUrl: connection.token.instance_url as string,

    // Access token from OAuth response
    accessToken: connection.token.access_token as string,

    // Salesforce API version to use
    version: "59.0",
  });

  // ⭐ REFRESH TOKEN HANDLING ⭐
  // If present, jsforce will automatically refresh expired tokens
  if (connection.token.refresh_token) {
    conn.refreshToken = connection.token.refresh_token as string;
  }

  return conn;
}

/**
 * Gets the current authenticated user's Salesforce ID.
 *
 * COMMON USE CASE:
 * - Filter data by current user
 * - Audit logging
 * - User-specific queries
 */
export async function getCurrentUserId(
  conn: jsforce.Connection,
): Promise<string> {
  // jsforce.identity() calls Salesforce identity endpoint
  const identity = await conn.identity();
  return identity.user_id;
}
```

---

### Key Patterns Explained

#### 1. Connection Token Structure

```typescript
connection.token = {
  access_token: "00D...", // Short-lived token for API calls
  refresh_token: "5Aep...", // Long-lived token to get new access tokens
  instance_url: "https://...", // API endpoint URL
  token_type: "Bearer", // How to use the token
  issued_at: "1234567890", // When token was issued
};
```

**WHAT PRISMATIC PROVIDES**:

- Automatically captures these during OAuth flow
- Stores them encrypted
- Refreshes access_token when it expires
- Passes fresh tokens to your flows

**WHAT YOU DO**:

- Extract tokens from `connection.token`
- Use with SDK or HTTP client
- Handle edge cases (missing tokens)

#### 2. Token Validation Pattern

```typescript
if (!connection?.token?.access_token) {
  throw new Error("No access token found in connection");
}
```

**WHY VALIDATE**:

- User might not have completed OAuth flow yet
- Token might have been revoked
- Configuration might be incomplete

**BEST PRACTICE**: Always validate before using:

1. Connection exists
2. Token exists
3. Specific token fields exist (access_token, instance_url, etc.)

#### 3. Using Tokens with HTTP Clients

If you're NOT using an SDK like jsforce:

```typescript
import { createClient } from "@prismatic-io/spectral/dist/clients/http";

export const createSalesforceHttpClient = (connection: Connection) => {
  return createClient({
    baseUrl: connection.token?.instance_url as string,
    headers: {
      // ⭐ BEARER TOKEN AUTHENTICATION ⭐
      Authorization: `Bearer ${connection.token?.access_token}`,
      "Content-Type": "application/json",
    },
  });
};

// Usage in flow:
const client = createSalesforceHttpClient(configVars["Salesforce Connection"]);
const response = await client.get("/services/data/v59.0/sobjects/Account");
```

**WHY createClient**:

- Built into Spectral SDK
- Handles retries
- Better error messages
- Type-safe responses

---

## Step 3: Using OAuth Connection in Flows

**`src/flows/getMyOpportunities.ts`**

```typescript
import { flow } from "@prismatic-io/spectral";
import {
  createSalesforceConnection,
  getCurrentUserId,
} from "../services/salesforceClient";
import { SalesforceOpportunity } from "../types";

export const getMyOpportunities = flow({
  name: "Get My Opportunities",
  stableKey: "get-my-opportunities",
  description: "Retrieve opportunities owned by the current user",

  // ⭐ SYNCHRONOUS FLOW ⭐
  // Returns response immediately (like a REST API)
  isSynchronous: true,

  // ⭐ SECURITY TYPE ⭐
  // "customer_optional" means customers can optionally secure this endpoint
  endpointSecurityType: "customer_optional",

  onExecution: async (context, params) => {
    const { configVars, logger } = context;

    // ⭐ GET OAUTH CONNECTION ⭐
    // This is a Connection object with token, not just a string
    const connection = configVars["Salesforce Connection"];

    logger.info("Creating authenticated Salesforce connection");

    // ⭐ USE HELPER TO CREATE CLIENT ⭐
    const conn = createSalesforceConnection(connection);

    // ⭐ GET CURRENT USER ID ⭐
    // Many integrations need to filter by current user
    const userId = await getCurrentUserId(conn);
    logger.info(`Authenticated as user: ${userId}`);

    // ⭐ BUILD SOQL QUERY ⭐
    // Salesforce Object Query Language (like SQL)
    const query = `
      SELECT
        Id,
        Name,
        Account.Name,
        Amount,
        StageName,
        CloseDate
      FROM Opportunity
      WHERE OwnerId = '${userId}'
      ORDER BY CloseDate ASC
      LIMIT 50
    `;

    try {
      // ⭐ EXECUTE QUERY ⭐
      // jsforce handles authentication automatically
      const result = await conn.query<SalesforceOpportunity>(query);

      logger.info(`Found ${result.totalSize} opportunities`);

      // ⭐ TRANSFORM DATA ⭐
      // Clean up Salesforce response format
      const opportunities = result.records.map((opp) => ({
        id: opp.Id,
        name: opp.Name,
        accountName: opp.Account?.Name || null,
        amount: opp.Amount || 0,
        stage: opp.StageName,
        closeDate: opp.CloseDate,
      }));

      return {
        data: {
          opportunities,
          totalCount: result.totalSize,
          userId,
        },
      };
    } catch (e) {
      const error = e as Error;

      // ⭐ OAUTH ERROR HANDLING ⭐
      // jsforce throws specific errors for token issues
      if (error.message.includes("INVALID_SESSION_ID")) {
        throw new Error(
          "Salesforce session expired. Please reconnect your Salesforce account.",
        );
      }

      throw new Error(`Failed to retrieve opportunities: ${error.message}`);
    }
  },
});

export default getMyOpportunities;
```

---

### Key Patterns Explained

#### 1. isSynchronous Flag

```typescript
isSynchronous: true,
```

**USE CASES**:

- `true` - Flow returns data immediately (REST API pattern)
- `false` or omitted - Flow runs in background (async/webhook pattern)

**WHEN TO USE TRUE**:

- User expects immediate response
- Fetching data for display
- Quick operations (< 30 seconds)

**WHEN TO USE FALSE**:

- Long-running operations
- Batch processing
- Webhook receivers

#### 2. Endpoint Security Types

```typescript
endpointSecurityType: "customer_optional",
```

**OPTIONS**:

- `"customer_optional"` - Customer can enable API key protection
- `"customer_required"` - Must be protected with API key
- `"organization"` - Only org can call this endpoint
- `undefined` - No special security

**BEST PRACTICE**: Use `"customer_optional"` for most flows - gives customers control.

#### 3. OAuth Error Handling

```typescript
if (error.message.includes("INVALID_SESSION_ID")) {
  throw new Error("Salesforce session expired. Please reconnect...");
}
```

**COMMON OAUTH ERRORS**:

- `INVALID_SESSION_ID` - Token expired or revoked
- `INVALID_GRANT` - Refresh token expired
- `403` - Insufficient permissions (scope issue)
- `401` - Invalid or missing token

**PATTERN**: Catch these and provide user-friendly messages with action steps.

#### 4. Connection Type Safety

```typescript
const connection = configVars["Salesforce Connection"];
// TypeScript knows this is a Connection, not string
```

**WHY THIS WORKS**:

- Prismatic's type system infers types from configPages
- `connectionConfigVar` → returns `Connection` type
- `configVar` → returns string, number, etc.

---

## Alternative: Custom OAuth Configuration

If you're not using a Prismatic component (e.g., for a custom API):

**`src/connections.ts`**

```typescript
import { OAuth2Type, connectionConfigVar } from "@prismatic-io/spectral";

export const customOAuthConnection = connectionConfigVar({
  stableKey: "custom-oauth-connection",
  dataType: "connection",

  // ⭐ SPECIFY OAUTH2 TYPE ⭐
  oauth2Type: OAuth2Type.AuthorizationCode,

  // ⭐ DEFINE OAUTH INPUTS ⭐
  inputs: {
    authorizeUrl: {
      label: "Authorize URL",
      type: "string",
      default: "https://api.example.com/oauth/authorize",
      required: true,
      shown: false, // Hide from UI (use default)
      comments: "The OAuth 2.0 Authorization URL for the API",
    },

    tokenUrl: {
      label: "Token URL",
      type: "string",
      default: "https://api.example.com/oauth/token",
      required: true,
      shown: false,
      comments: "The OAuth 2.0 Token URL for the API",
    },

    scopes: {
      label: "Scopes",
      type: "string",
      default: "read write",
      required: false,
      shown: false,
      comments: "Space-separated OAuth 2.0 permission scopes",
    },

    clientId: {
      label: "Client ID",
      type: "string",
      required: true,
      shown: true, // Show in UI so users can configure
      comments: "Client Identifier from your OAuth app",
    },

    clientSecret: {
      label: "Client Secret",
      type: "password", // Masked in UI
      required: true,
      shown: true,
      comments: "Client Secret from your OAuth app",
    },
  },
});
```

**USE THIS WHEN**:

- API doesn't have a Prismatic component yet
- Need custom OAuth flow
- Want full control over OAuth parameters

---

## Complete Integration Structure

**`src/index.ts`**

```typescript
import { integration } from "@prismatic-io/spectral";
import flows from "./flows";
import { configPages } from "./configPages";

export { configPages } from "./configPages";

const salesforceOpportunities = integration({
  name: "Salesforce Opportunities",
  description: "Manage sales pipeline opportunities and generate reports",
  iconPath: "icon.png",

  flows,
  configPages,
});

export default salesforceOpportunities;
```

**Note:** No component registry needed - we use extracted component source code directly in our flows.

**`src/utils/salesforceHelpers.ts`**

```typescript
/**
 * COMPONENT_SOURCE: salesforce/connection
 * Creates Salesforce OAuth client from connection config
 */
export function createSalesforceClient(connection: any) {
  const jsforce = require("jsforce");

  return new jsforce.Connection({
    instanceUrl: connection.instanceUrl,
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
  });
}

/**
 * COMPONENT_SOURCE: salesforce/queryRecords
 * Executes SOQL query against Salesforce
 *
 * Note: Do not annotate context with FlowContext — it is not a public export.
 * The flow() function infers context types automatically. For extracted helpers,
 * use a minimal interface or accept the context parameter as-is.
 */
export async function querySalesforce(
  context: { logger: { info: (msg: string) => void }; configVars: Record<string, any> },
  query: string,
): Promise<any[]> {
  context.logger.info("Using Salesforce component: queryRecords");

  const connection = context.configVars["Salesforce OAuth"];
  const client = createSalesforceClient(connection);

  const result = await client.query(query);
  return result.records;
}
```

**WHY EXTRACT COMPONENT SOURCE**:

- Review component OAuth patterns directly
- Understand exact connection fields needed
- Extract only the authentication logic you need
- Full control over client creation and error handling

---

## Testing OAuth Flow

### 1. Set Up OAuth App

**For Salesforce**:

1. Go to Salesforce Setup → App Manager
2. Create New Connected App
3. Enable OAuth Settings
4. Add callback URL: `https://oauth2.prismatic.io/callback`
5. Add scopes: `api`, `refresh_token`
6. Copy Client ID and Client Secret

### 2. Configure Environment

```bash
# .env
SALESFORCE_CLIENT_ID=your_client_id_here
SALESFORCE_CLIENT_SECRET=your_client_secret_here
```

### 3. Build and Deploy

```bash
npm run build
prism integrations:import
```

### 4. Authorize Connection

1. In Prismatic UI, open your integration
2. Go to "Configuration" page
3. Click "Authorize" next to Salesforce Connection
4. You'll be redirected to Salesforce login
5. Approve permissions
6. Redirected back to Prismatic
7. Connection shows "Connected" status

### 5. Test Flow

```bash
prism executions:test --integration="Salesforce Opportunities" --flow="Get My Opportunities"
```

**EXPECTED RESULTS**:

- Execution succeeds
- Logs show authenticated user ID
- Returns list of opportunities
- No authentication errors

---

## Common OAuth Troubleshooting

### Issue: "No access token found"

**CAUSE**: User hasn't completed OAuth flow yet

**FIX**:

1. Check connection status in Prismatic UI
2. Click "Authorize" to complete OAuth flow
3. Verify redirect URI matches OAuth app config

### Issue: "Invalid session ID"

**CAUSE**: Access token expired and refresh failed

**FIX**:

1. Check refresh token is being captured
2. Verify `refresh_token` scope is requested
3. Re-authorize connection in Prismatic UI

### Issue: "Redirect URI mismatch"

**CAUSE**: OAuth app redirect URI doesn't match Prismatic's

**FIX**:

1. In OAuth app settings, set redirect URI to:
   `https://oauth2.prismatic.io/callback`
2. For custom domains: `https://yourdomain.prismatic.io/oauth2/callback`

### Issue: "Insufficient privileges"

**CAUSE**: OAuth scopes don't include required permissions

**FIX**:

1. Check scopes in configPages.ts
2. Update OAuth app to include required scopes
3. Re-authorize connection (scopes don't update automatically)

---

## OAuth Best Practices

### 1. Always Use Refresh Tokens

```typescript
scopes: {
  value: "api refresh_token", // ← Include refresh_token scope
}
```

**WHY**: Access tokens expire (typically 15 minutes to 2 hours). Refresh tokens allow automatic renewal.

### 2. Validate Tokens Before Use

```typescript
if (!connection?.token?.access_token) {
  throw new Error("Please authorize your Salesforce connection");
}
```

**WHY**: Prevents cryptic errors. Gives users actionable error messages.

### 3. Handle Token Refresh Gracefully

```typescript
try {
  const result = await conn.query(query);
} catch (e) {
  if (e.message.includes("INVALID_SESSION")) {
    // jsforce will attempt refresh automatically if refresh_token exists
    // If that fails, guide user to re-authorize
    throw new Error(
      "Session expired. Please re-authorize Salesforce connection.",
    );
  }
  throw e;
}
```

### 4. Use Organization-Level Credentials

```typescript
permissionAndVisibilityType: "organization",
```

**WHY**:

- One OAuth app for all instances
- Easier to manage and rotate credentials
- Consistent authorization experience

### 5. Request Minimal Scopes

```typescript
scopes: {
  value: "api refresh_token", // Only what you need
  // NOT: "full" (gives too much access)
}
```

**WHY**: Principle of least privilege. Reduces security risk.

---

## Summary: OAuth2 Pattern

### Core Components

1. ✅ **connectionConfigVar** - Define OAuth connection
2. ✅ **Helper function** - Extract and use tokens
3. ✅ **Token validation** - Check tokens exist before use
4. ✅ **Error handling** - Catch and explain OAuth errors
5. ✅ **Component source** - Download component source to learn OAuth patterns (if available)

### Key Rules

- ✅ **Use environment variables** for Client ID/Secret
- ✅ **Set permissionAndVisibilityType** to "organization"
- ✅ **Always include refresh_token** scope
- ✅ **Validate tokens** before API calls
- ✅ **Handle token expiration** gracefully

### When to Use OAuth2

Use OAuth2 for:

- Modern REST APIs (Salesforce, Google, Slack, etc.)
- Services where users delegate access
- APIs requiring user-specific permissions
- Any API with "Sign in with..." buttons

**DON'T use OAuth2 for**:

- Simple API key authentication (use configVar instead)
- Server-to-server APIs (consider OAuth2 Client Credentials flow instead)
- Legacy APIs (might need OAuth1 or basic auth)

---

## Next Steps

- **Example 03**: Build integrations with multiple flows
- **Example 04**: Add dynamic data sources (dropdowns populated from API)
- **Example 06**: Use pre-built Prismatic components

---

## Additional Resources

- **OAuth2 Spec**: <https://oauth.net/2/>
- **Prismatic OAuth Docs**: <https://prismatic.io/docs/connections/>
- **jsforce Docs**: <https://jsforce.github.io/>
- **Salesforce OAuth**: <https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_oauth_and_connected_apps.htm>
