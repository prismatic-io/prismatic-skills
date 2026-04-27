# Integration-Agnostic Connections

## Overview

Integration-agnostic connections are centrally managed connections that can be referenced and reused across multiple integrations. There are **three types**, each designed for different use cases:

1. **Customer-Activated Connection** - Customers enter their own credentials (OAuth or API keys)
2. **Organization-Activated Customer Connection** - You provide unique credentials for each customer
3. **Organization-Activated Global Connection** - You provide one set of credentials used by all customers

**Key Benefits:**

- **Reusability**: Configure once, use in multiple integrations
- **Centralized Management**: Connections managed in one place
- **Automatic Token Refresh**: Prismatic handles token lifecycle
- **Consistent Authentication**: Same auth flow across integrations
- **Flexible Visibility**: Control whether customers see connections

---

## Decision Tree: Which Type To Use?

```
Do customers need to provide their own credentials to a third-party service?
│
├─ YES → Are the credentials unique per customer?
│         │
│         ├─ YES → Do customers enter them, or do you provide them?
│         │        │
│         │        ├─ CUSTOMERS ENTER → Customer-Activated Connection
│         │        │                    (e.g., Salesforce OAuth)
│         │        │
│         │        └─ YOU PROVIDE → Organization-Activated Customer Connection
│         │                         (e.g., Your app's API keys per customer)
│         │
│         └─ NO → Customers share the same credentials?
│                  │
│                  └─ YES → Organization-Activated Global Connection
│                            (e.g., Your Twilio account for all customers)
│
└─ NO → Use integration-specific connectionConfigVar
```

---

## Type Comparison

| Feature                      | Customer-Activated   | Org-Customer              | Org-Global                |
| ---------------------------- | -------------------- | ------------------------- | ------------------------- |
| **Location in Code**         | configPages.ts       | index.ts scopedConfigVars | index.ts scopedConfigVars |
| **Customer Sees It**         | ✅ Yes (in wizard)   | ❌ No                     | ❌ No                     |
| **Who Provides Credentials** | Customer             | Organization              | Organization              |
| **Credentials Per Customer** | Unique               | Unique                    | Shared                    |
| **OAuth Support**            | ✅ Yes               | ✅ Yes                    | ✅ Yes                    |
| **Use Case**                 | Third-party services | Your app's API            | Shared services           |

---

## Type 1: Customer-Activated Connection

### When to Use

- Customers have their own accounts on third-party services (Salesforce, Slack, Google)
- Each customer needs to authenticate via OAuth or enter their own API keys
- Connection will be reused across multiple integrations
- Customer must go through authorization flow themselves

### Configuration Location

**In configPages.ts** - Visible to customers in config wizard

### Code Example

```typescript
import {
  configPage,
  customerActivatedConnection,
} from "@prismatic-io/spectral";

export const configPages = {
  Connections: configPage({
    tagline: "Connect to Salesforce",
    elements: {
      "Salesforce Connection": customerActivatedConnection({
        stableKey: "salesforce-cac", // Must match connection in Prismatic UI
      }),
    },
  }),
};
```

### Using in Flows

```typescript
import { flow, type Connection } from "@prismatic-io/spectral";

export const myFlow = flow({
  name: "Sync from Salesforce",
  stableKey: "sync-from-salesforce",

  onExecution: async (context) => {
    // Access the customer-activated connection
    const sfConnection = context.configVars[
      "Salesforce Connection"
    ] as Connection;

    // Validate connection
    if (!sfConnection?.token?.access_token) {
      throw new Error("Salesforce connection not authorized");
    }

    // Use connection tokens
    const accessToken = sfConnection.token.access_token;
    const instanceUrl = sfConnection.token.instance_url;

    return { data: { connected: true } };
  },
});
```

---

## Type 2: Organization-Activated Customer Connection

### When to Use

- Each customer has unique credentials, but YOU know what they are
- You want to provide credentials on behalf of customers
- Customers shouldn't see or configure the connection
- Connection is customer-specific (not shared)

### Configuration Location

**In index.ts scopedConfigVars** - NOT visible to customers

### Code Example

```typescript
// src/index.ts
import {
  integration,
  organizationActivatedConnection,
} from "@prismatic-io/spectral";
import flows from "./flows";
import { configPages } from "./configPages";

// Export scopedConfigVars for TypeScript type inference
export const scopedConfigVars = {
  // Organization-Activated Customer Connection
  "Acme API Key": organizationActivatedConnection({
    stableKey: "acme-api-key", // Each customer gets unique value
  }),
};

export { configPages } from "./configPages";

export default integration({
  name: "Acme Integration",
  description: "Connect to Acme API",
  flows,
  configPages,
  scopedConfigVars, // Include org-activated connections
});
```

### Using in Flows

```typescript
// src/flows.ts
import { flow, util } from "@prismatic-io/spectral";

export const myFlow = flow({
  name: "Sync to Acme",
  stableKey: "sync-to-acme",

  onExecution: async (context) => {
    // Access the org-activated customer connection
    const acmeConnection = context.configVars["Acme API Key"];

    // Extract connection fields
    const apiKey = util.types.toString(acmeConnection.fields.apiKey);

    // Validate
    if (!apiKey) {
      throw new Error("Acme API Key not configured for this customer");
    }

    return { data: { apiKey: "***" } };
  },
});
```

---

## Type 3: Organization-Activated Global Connection

### When to Use

- All customers share ONE set of credentials
- You (the organization) own the third-party account
- Customers shouldn't see or know about the connection
- Single account used by all customer instances

### Configuration Location

**In index.ts scopedConfigVars** - NOT visible to customers

### Code Example

```typescript
// src/index.ts
import {
  integration,
  organizationActivatedConnection,
} from "@prismatic-io/spectral";

export const scopedConfigVars = {
  // Organization-Activated Global Connection
  "Twilio Connection": organizationActivatedConnection({
    stableKey: "twilio-global", // Same credentials for all customers
  }),
};

export default integration({
  name: "SMS Notifications",
  flows,
  configPages,
  scopedConfigVars,
});
```

---

## Combining Connection Types

```typescript
// src/configPages.ts
import {
  configPage,
  customerActivatedConnection,
} from "@prismatic-io/spectral";

export const configPages = {
  Connections: configPage({
    elements: {
      // Customer-activated: Customer provides Salesforce credentials
      Salesforce: customerActivatedConnection({
        stableKey: "salesforce-cac",
      }),
    },
  }),
};

// src/index.ts
import {
  integration,
  organizationActivatedConnection,
} from "@prismatic-io/spectral";

export const scopedConfigVars = {
  // Org-activated customer: You provide each customer's API key
  "Acme API": organizationActivatedConnection({
    stableKey: "acme-api-key",
  }),

  // Org-activated global: Shared logging service
  "Logging Service": organizationActivatedConnection({
    stableKey: "logging-global",
  }),
};

export default integration({
  name: "Salesforce to Acme",
  flows,
  configPages,
  scopedConfigVars,
});
```

---

## Using StableKeys from Requirements

When requirements.json contains `source_connection_existing` or `destination_connection_existing` objects, use the `stableKey` value from those objects. These reference existing connections in the user's Prismatic organization.

```json
{
  "source_connection_existing": {
    "stableKey": "abc123-actual-key",
    "managedBy": "CUSTOMER"
  }
}
```

Use `customerActivatedConnection` when `managedBy` is `"CUSTOMER"`, or `organizationActivatedConnection` when `managedBy` is `"ORG"`.

---

## Connection Creation: SCV and CCV Model

Reusable connections are backed by two platform objects:

**SCV (Scoped Config Variable)** — the org-level connection definition. Defines which connector, auth type, and which inputs are org-managed vs customer-managed. Created once, referenced by `stableKey`.

**CCV (Customer Config Variable)** — a child of an SCV. Holds actual credentials for a specific customer or for testing.

| Strategy | SCV `managedBy` | SCV `variableScope` | CCVs needed? |
|---|---|---|---|
| `customer-activated` | `customer` | `customer` | Customer creates during config (OAuth flow) |
| `org-activated-customer` | `org` | `customer` | Org creates per customer before deploying |
| `org-activated-global` | `org` | `org` | Only test CCV (all customers share SCV credentials) |

**Creating connections:**

```bash
# Customer-activated (default)
prismatic-tools create-organization-connection \
  --component-key salesforce --connection-key oauth2 \
  --name "Salesforce OAuth" --stable-key salesforce-oauth2 \
  --strategy customer-activated

# Org-activated per-customer
prismatic-tools create-organization-connection \
  --component-key salesforce --connection-key oauth2 \
  --name "Salesforce OAuth" --stable-key salesforce-oauth2 \
  --strategy org-activated-customer

# Org-activated global
prismatic-tools create-organization-connection \
  --component-key datadog --connection-key apiKey \
  --name "Datadog API" --stable-key datadog-api \
  --strategy org-activated-global
```

**Build-only connections** (`managedBy: "SYSTEM"`) are Prismatic-managed OAuth apps for development. They work for test instances but cannot be used in production deployments. If only build-only connections exist for a system, create a real connection instead.

---

## Best Practices

### 1. Choose the Right Type

```
Customer enters credentials → Customer-Activated
You know customer's credentials → Org-Activated Customer
All customers share credentials → Org-Activated Global
```

### 2. Always Export scopedConfigVars

```typescript
// Required for TypeScript type inference
export const scopedConfigVars = {
  // ...
};
```

### 3. Validate Before Use

```typescript
if (!connection?.token?.access_token) {
  throw new Error("Connection not authorized");
}
```

---

## Quick Reference

### Customer-Activated

- ✅ Import `customerActivatedConnection`
- ✅ Add to `configPages.ts`
- ✅ Visible to customers
- ✅ Customer authorizes

### Organization-Activated (Both Types)

- ✅ Import `organizationActivatedConnection`
- ✅ Add to `index.ts` scopedConfigVars
- ✅ Export scopedConfigVars
- ✅ NOT visible to customers
- ✅ You configure in Prismatic UI

---

## Related Resources

- **Code Generation Guide**: [../code-generation-guide.md](../code-generation-guide.md)
- **OAuth Patterns**: [oauth-connection.md](oauth-connection.md)
- **Prismatic Docs**: https://prismatic.io/docs/integrations/connections/#integration-agnostic-connections
