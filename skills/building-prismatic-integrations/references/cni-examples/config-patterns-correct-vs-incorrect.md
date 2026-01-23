# Config Patterns: Correct vs Incorrect

## Overview

This guide shows **CORRECT** vs **INCORRECT** configuration patterns to prevent common code generation mistakes.

**CRITICAL**: Every config element MUST use the appropriate wrapper function (`configVar`, `connectionConfigVar`, or `dataSourceConfigVar`). Plain objects will NOT work.

---

## ❌ INCORRECT: Plain Objects

### What NOT to Do

```typescript
// ❌ WRONG - Plain object without wrapper function
export const configPages = {
  Configuration: configPage({
    elements: {
      "API Endpoint": {
        dataType: "string",
        stableKey: "apiEndpoint",
        label: "API Endpoint",
        comments: "The API endpoint URL",
        default: "https://api.example.com",
        placeholder: "Enter URL",
      },
    },
  }),
};
```

**Why this is wrong:**

- Missing `configVar()` wrapper function
- Uses invalid properties (`label`, `comments`, `default`, `placeholder`)
- Will fail to compile
- Prismatic won't recognize it as a valid config variable

---

## ✅ CORRECT: Using configVar()

### Basic String Config

```typescript
import { configPage, configVar } from "@prismatic-io/spectral";

export const configPages = {
  Configuration: configPage({
    tagline: "Configure your integration",
    elements: {
      // ✅ CORRECT - Wrapped in configVar()
      "API Endpoint": configVar({
        stableKey: "apiEndpoint",
        dataType: "string",
        description: "The API endpoint URL", // Use 'description', NOT 'comments'
        defaultValue: "https://api.example.com", // Use 'defaultValue', NOT 'default'
      }),
    },
  }),
};
```

**Valid configVar properties:**

- `stableKey` (required) - Unique identifier, never change after deployment
- `dataType` (required) - Type: "string", "date", "timestamp", "picklist", "code", "boolean", "number", "schedule", "objectSelection", "objectFieldMap", "jsonForm", "htmlElement"
- `description` (optional) - Help text shown to users
- `defaultValue` (optional) - Default value
- `permissionAndVisibilityType` (optional) - "customer", "embedded", or "organization"
- `visibleToOrgDeployer` (optional) - Whether org deployer can see this

**Note:** "text" and "password" are NOT valid `dataType` values for `configVar()`. Use "string" for single-line text. For secrets, use a connection with `type: "password"` inputs.

**Properties that DON'T exist:**

- ❌ `label` - The element key IS the label
- ❌ `comments` - Use `description` instead
- ❌ `default` - Use `defaultValue` instead
- ❌ `placeholder` - Not supported
- ❌ `shown` - Not applicable to configVar
- ❌ `required` - Not a direct property (use validation or `permissionAndVisibilityType`)

---

## ⚠️ Secrets and API Keys

**Important:** `dataType: "password"` is NOT valid for `configVar()`. For secrets, use one of these approaches:

### Option 1: Use a Connection (Recommended)

For API keys and secrets, create a connection config var:

```typescript
import { configPage, connectionConfigVar } from "@prismatic-io/spectral";

"API Connection": connectionConfigVar({
  stableKey: "apiConnection",
  dataType: "connection",
  inputs: {
    apiKey: {
      label: "API Key",
      type: "password",  // "password" IS valid for connection inputs
      required: true,
      comments: "Your API key from the provider dashboard",
    },
  },
}),
```

### Option 2: Use a String Config (Not Masked)

```typescript
"API Key": configVar({
  stableKey: "apiKey",
  dataType: "string",  // Will NOT be masked in UI
  description: "Your API key from the provider dashboard",
  permissionAndVisibilityType: "organization",  // Hide from customers
}),
```

---

## ✅ CORRECT: Number Config

```typescript
"Retry Limit": configVar({
  stableKey: "retryLimit",
  dataType: "number",
  description: "Maximum number of retry attempts",
  defaultValue: 3,
}),
```

---

## ✅ CORRECT: Boolean Config

```typescript
"Enable Notifications": configVar({
  stableKey: "enableNotifications",
  dataType: "boolean",
  description: "Send notifications on completion",
  defaultValue: true,
}),
```

---

## ⚠️ Multi-line Text

**Important:** `dataType: "text"` is NOT valid for `configVar()`. For multi-line text, use `dataType: "code"`:

```typescript
"Custom Message": configVar({
  stableKey: "customMessage",
  dataType: "code",  // Use "code" for multi-line text areas
  codeLanguage: "json",  // Required for code type - use "json", "xml", or "html"
  description: "Custom message template (JSON format)",
  defaultValue: JSON.stringify({
    greeting: "Hello {name}",
    body: "Your order is ready."
  }, null, 2),
}),
```

**Alternatively**, for plain multi-line text without syntax highlighting, you could use a `string` type and handle line breaks in your code, though this won't render as a text area in the UI.

---

## OAuth Connections

### ❌ INCORRECT: Mixed Pattern

```typescript
// ❌ WRONG - Mixing properties from different patterns
"Jira Connection": connectionConfigVar({
  stableKey: "jiraConnection",
  dataType: "connection",
  oauth2Type: OAuth2Type.AuthorizationCode,
  inputs: {
    authorizeUrl: {
      label: "Authorize URL", // ❌ 'label' is correct here
      type: "string",
      default: "https://auth.atlassian.com/authorize", // ✅ This is correct
      required: true,
      shown: false,
      comments: "The OAuth 2.0 Authorization URL", // ❌ Should be 'comments'
    },
  },
}),
"Acme Endpoint": { // ❌ WRONG - Plain object
  dataType: "string",
  stableKey: "acmeEndpoint",
  label: "Acme Endpoint", // ❌ Invalid property
  default: "https://api.acme.com", // ❌ Should be 'defaultValue'
},
```

---

### ✅ CORRECT: Component-Based OAuth

**Use this when a Prismatic component exists for the service:**

```typescript
import { configPage, connectionConfigVar } from "@prismatic-io/spectral";

export const configPages = {
  Configuration: configPage({
    tagline: "Connect to Salesforce",
    elements: {
      "Salesforce Connection": connectionConfigVar({
        stableKey: "salesforce-oauth",
        dataType: "connection",

        // Reference existing Prismatic component
        connection: {
          component: "salesforce", // Component key
          key: "oauth2", // Connection type within component

          // Override default values
          values: {
            clientId: {
              value: process.env.SALESFORCE_CLIENT_ID || "",
              permissionAndVisibilityType: "organization",
              visibleToOrgDeployer: true,
            },
            clientSecret: {
              value: process.env.SALESFORCE_CLIENT_SECRET || "",
              permissionAndVisibilityType: "organization",
              visibleToOrgDeployer: true,
            },
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

**When to use:** Service has an existing Prismatic component (Salesforce, Slack, Google, etc.)

---

### ✅ CORRECT: Custom OAuth

**Use this when NO Prismatic component exists:**

```typescript
import {
  configPage,
  connectionConfigVar,
  OAuth2Type,
} from "@prismatic-io/spectral";

export const configPages = {
  Configuration: configPage({
    tagline: "Connect to Custom Service",
    elements: {
      "Custom OAuth Connection": connectionConfigVar({
        stableKey: "custom-oauth",
        dataType: "connection",

        // Specify OAuth2 type
        oauth2Type: OAuth2Type.AuthorizationCode,

        // Define OAuth parameters
        inputs: {
          authorizeUrl: {
            label: "Authorize URL",
            type: "string",
            default: "https://auth.example.com/oauth/authorize",
            required: true,
            shown: false, // Hide from UI (use default)
            comments: "The OAuth 2.0 Authorization URL",
          },
          tokenUrl: {
            label: "Token URL",
            type: "string",
            default: "https://auth.example.com/oauth/token",
            required: true,
            shown: false,
            comments: "The OAuth 2.0 Token URL",
          },
          scopes: {
            label: "Scopes",
            type: "string",
            default: "read write",
            required: false,
            shown: false,
            comments: "Space-delimited OAuth scopes",
          },
          clientId: {
            label: "Client ID",
            type: "string",
            required: true,
            shown: true, // Show in UI for user configuration
            comments: "OAuth Client ID from your app",
          },
          clientSecret: {
            label: "Client Secret",
            type: "password", // Masked in UI
            required: true,
            shown: true,
            comments: "OAuth Client Secret from your app",
          },
        },
      }),
    },
  }),
};
```

**Valid input properties for custom OAuth:**

- `label` - Display name
- `type` - "string", "password", "boolean"
- `default` - Default value (note: NOT `defaultValue` here!)
- `required` - Whether required
- `shown` - Whether visible in UI
- `comments` - Help text

**When to use:** Custom API without existing Prismatic component

---

## Complete Working Example

### ✅ CORRECT: Mixed Config Types

```typescript
import {
  configPage,
  configVar,
  connectionConfigVar,
  OAuth2Type,
} from "@prismatic-io/spectral";

export const configPages = {
  // Page 1: Connection
  Connection: configPage({
    tagline: "Connect to Jira",
    elements: {
      // OAuth connection
      "Jira Connection": connectionConfigVar({
        stableKey: "jiraConnection",
        dataType: "connection",
        oauth2Type: OAuth2Type.AuthorizationCode,
        inputs: {
          authorizeUrl: {
            label: "Authorize URL",
            type: "string",
            default:
              "https://auth.atlassian.com/authorize?audience=api.atlassian.com",
            required: true,
            shown: false,
            comments: "The OAuth 2.0 Authorization URL for Jira",
          },
          tokenUrl: {
            label: "Token URL",
            type: "string",
            default: "https://auth.atlassian.com/oauth/token",
            required: true,
            shown: false,
            comments: "The OAuth 2.0 Token URL for Jira",
          },
          scopes: {
            label: "Scopes",
            type: "string",
            default:
              "read:jira-user read:jira-work write:jira-work offline_access",
            required: true,
            shown: true,
            comments: "OAuth scopes for Jira access",
          },
          clientId: {
            label: "Client ID",
            type: "string",
            required: true,
            shown: true,
            comments: "OAuth Client ID from your Jira OAuth app",
          },
          clientSecret: {
            label: "Client Secret",
            type: "password",
            required: true,
            shown: true,
            comments: "OAuth Client Secret from your Jira OAuth app",
          },
        },
      }),
    },
  }),

  // Page 2: Settings
  Settings: configPage({
    tagline: "Configure integration settings",
    elements: {
      // Simple string config
      "Acme API Endpoint": configVar({
        stableKey: "acmeEndpoint",
        dataType: "string",
        description: "The URL where Jira issues will be posted to Acme",
        defaultValue: "https://api.acme.com/jira-sync",
      }),

      // Multi-line JSON config (use "code" with codeLanguage)
      "Field Mapping": configVar({
        stableKey: "fieldMapping",
        dataType: "code",
        codeLanguage: "json",
        description: "JSON mapping of Jira fields to Acme fields",
        defaultValue: JSON.stringify(
          {
            projectId: "project.id",
            issueKey: "key",
            issueType: "fields.issuetype.name",
            summary: "fields.summary",
            status: "fields.status.name",
          },
          null,
          2,
        ),
      }),

      // Boolean config
      "Enable Debug Logging": configVar({
        stableKey: "enableDebugLogging",
        dataType: "boolean",
        description: "Enable detailed debug logging for troubleshooting",
        defaultValue: false,
      }),

      // Number config
      "Batch Size": configVar({
        stableKey: "batchSize",
        dataType: "number",
        description: "Number of issues to process in each batch",
        defaultValue: 50,
      }),
    },
  }),
};
```

---

## Key Rules Summary

### ✅ DO

1. **Always wrap config elements** in the appropriate function:
   - `configVar()` for simple values
   - `connectionConfigVar()` for OAuth/connections
   - `dataSourceConfigVar()` for dynamic dropdowns

2. **Use correct property names** for `configVar()`:
   - `description` (not `comments`)
   - `defaultValue` (not `default`)
   - `dataType` (required)
   - `stableKey` (required)

3. **Use correct property names** for custom OAuth `inputs`:
   - `label` (display name)
   - `type` (field type)
   - `default` (default value - NOTE: not `defaultValue`!)
   - `comments` (help text)
   - `shown` (visibility)

4. **Never change `stableKey`** after deployment

### ❌ DON'T

1. **Never use plain objects** without wrapper functions
2. **Never mix property names** from different patterns
3. **Never use invalid properties** like `label`, `placeholder`, `required` in `configVar()`
4. **Never use `defaultValue`** in custom OAuth inputs (use `default`)
5. **Never use `comments`** in `configVar()` (use `description`)
6. **Never use `dataType: "text"` or `dataType: "password"`** in `configVar()` - use "string" or "code"

---

## Quick Reference

| Config Type       | Wrapper Function        | Key Properties                                                    |
| ----------------- | ----------------------- | ----------------------------------------------------------------- |
| Simple value      | `configVar()`           | `stableKey`, `dataType`, `description`, `defaultValue`            |
| OAuth (component) | `connectionConfigVar()` | `stableKey`, `dataType`, `connection: { component, key, values }` |
| OAuth (custom)    | `connectionConfigVar()` | `stableKey`, `dataType`, `oauth2Type`, `inputs`                   |
| Dynamic dropdown  | `dataSourceConfigVar()` | `stableKey`, `dataSourceType: "picklist"`, `perform`              |
| JSON Form         | `dataSourceConfigVar()` | `stableKey`, `dataSourceType: "jsonForm"`, `perform`              |

---

## See Also

- [Basic API to Slack](basic-api-to-slack.md) - Simple config examples
- [OAuth Connection Pattern](oauth-connection.md) - Complete OAuth examples
- [Data Sources](data-sources.md) - Dynamic dropdowns
- [JSON Forms](json-forms.md) - Complex configuration UIs
