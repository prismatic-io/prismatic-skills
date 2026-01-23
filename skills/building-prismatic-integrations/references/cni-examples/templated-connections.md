# Templated Connection Inputs Pattern

## Overview

Templated connection inputs allow you to dynamically derive connection configuration values based on user-provided inputs. This is particularly useful for multi-tenant SaaS applications where each customer has their own domain or subdomain.

**Use this pattern when:**

- Customers have custom domains (e.g., `customer1.api.example.com`, `customer2.api.example.com`)
- OAuth URLs vary by tenant or region
- API endpoints are constructed from a base domain or identifier
- Connection parameters can be derived from other inputs

---

## Basic Pattern

Instead of asking users to enter multiple related fields separately, you ask for one input (like domain) and derive the rest programmatically.

**Traditional Approach (Not using templates):**

```typescript
connectionConfigVar({
  dataType: "connection",
  oauth2Type: OAuth2Type.AuthorizationCode,
  inputs: {
    domain: { label: "Domain", type: "string" },
    authorizeUrl: { label: "Authorize URL", type: "string" }, // User enters full URL
    tokenUrl: { label: "Token URL", type: "string" }, // User enters full URL
    apiBaseUrl: { label: "API Base URL", type: "string" }, // User enters full URL
  },
});
```

**Problem:** Users must enter the same domain information in 3-4 different fields. Error-prone and poor UX.

**Better Approach (Using templated inputs):**

```typescript
import { templateConnectionInputs } from "@prismatic-io/spectral";

connectionConfigVar({
  dataType: "connection",
  oauth2Type: OAuth2Type.AuthorizationCode,
  inputs: {
    // User-specified input (shown in config wizard)
    domain: {
      label: "Your Acme Domain",
      type: "string",
      placeholder: "customer-name",
    },

    // Templated inputs (derived from user input, hidden from user)
    ...templateConnectionInputs({
      authorizeUrl: (inputs) =>
        `https://${inputs.domain}.acme.com/oauth/authorize`,
      tokenUrl: (inputs) => `https://${inputs.domain}.acme.com/oauth/token`,
      apiBaseUrl: (inputs) => `https://${inputs.domain}.acme.com/api/v1`,
    }),
  },
});
```

**Result:** User only enters their domain once; all URLs are constructed automatically.

---

## Complete Example: Multi-Tenant OAuth Integration

```typescript
import {
  connectionConfigVar,
  configPage,
  OAuth2Type,
  templateConnectionInputs,
} from "@prismatic-io/spectral";

export const configPages = {
  "Connection Configuration": configPage({
    elements: {
      "Acme Connection": connectionConfigVar({
        stableKey: "acme-oauth-connection",
        dataType: "connection",
        oauth2Type: OAuth2Type.AuthorizationCode,
        inputs: {
          // User-provided inputs
          domain: {
            label: "Acme Domain",
            placeholder: "my-company",
            comments: "Enter your company's Acme subdomain (e.g., 'acme-corp')",
            type: "string",
            required: true,
            shown: true,
          },

          clientId: {
            label: "OAuth Client ID",
            placeholder: "abc123...",
            type: "string",
            required: true,
            shown: true,
          },

          clientSecret: {
            label: "OAuth Client Secret",
            type: "password",
            required: true,
            shown: true,
          },

          // Templated inputs (auto-generated from domain)
          ...templateConnectionInputs({
            authorizeUrl: (inputs) =>
              `https://${inputs.domain}.acme.com/oauth/v2/authorize`,
            tokenUrl: (inputs) =>
              `https://${inputs.domain}.acme.com/oauth/v2/token`,
            scopes: () => "read write admin", // Can also be static
          }),
        },
      }),
    },
  }),
};
```

---

## Regional OAuth Endpoints

When OAuth endpoints vary by region:

```typescript
connectionConfigVar({
  dataType: "connection",
  oauth2Type: OAuth2Type.AuthorizationCode,
  inputs: {
    region: {
      label: "Region",
      type: "string",
      model: [
        { label: "US", value: "us" },
        { label: "EU", value: "eu" },
        { label: "APAC", value: "apac" },
      ],
    },

    ...templateConnectionInputs({
      authorizeUrl: (inputs) => {
        const regionMap = {
          us: "https://auth.us.example.com/oauth/authorize",
          eu: "https://auth.eu.example.com/oauth/authorize",
          apac: "https://auth.apac.example.com/oauth/authorize",
        };
        return regionMap[inputs.region] || regionMap.us;
      },

      tokenUrl: (inputs) => {
        const regionMap = {
          us: "https://auth.us.example.com/oauth/token",
          eu: "https://auth.eu.example.com/oauth/token",
          apac: "https://auth.apac.example.com/oauth/token",
        };
        return regionMap[inputs.region] || regionMap.us;
      },
    }),
  },
});
```

---

## Advanced: Combining Multiple Inputs

You can derive templated values from multiple user inputs:

```typescript
connectionConfigVar({
  dataType: "connection",
  oauth2Type: OAuth2Type.AuthorizationCode,
  inputs: {
    // User provides both tenant ID and region
    tenantId: {
      label: "Tenant ID",
      type: "string",
      placeholder: "abc123",
    },

    environment: {
      label: "Environment",
      type: "string",
      model: [
        { label: "Production", value: "prod" },
        { label: "Staging", value: "staging" },
        { label: "Development", value: "dev" },
      ],
    },

    // Derive OAuth URLs from both inputs
    ...templateConnectionInputs({
      authorizeUrl: (inputs) =>
        `https://${inputs.tenantId}.${inputs.environment}.api.example.com/oauth/authorize`,

      tokenUrl: (inputs) =>
        `https://${inputs.tenantId}.${inputs.environment}.api.example.com/oauth/token`,

      // Can also include conditional logic
      scopes: (inputs) =>
        inputs.environment === "prod" ? "read write" : "read write admin debug",
    }),
  },
});
```

---

## Using Templated Connections in Flows

Once configured, access the connection normally in your flows:

```typescript
import { flow } from "@prismatic-io/spectral";
import { createClient } from "@prismatic-io/spectral/dist/clients/http";

export const myFlow = flow({
  name: "Fetch Data from Acme",
  stableKey: "fetch-acme-data",

  onExecution: async (context, params) => {
    // Get the connection (OAuth token and fields)
    const connection = context.configVars["Acme Connection"];

    // Access templated fields like any other connection field
    const apiBaseUrl = connection.fields.apiBaseUrl;
    const accessToken = connection.token?.access_token;

    // Create HTTP client
    const client = createClient({
      baseUrl: apiBaseUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // Make API calls
    const response = await client.get("/customers");

    return { data: response.data };
  },
});
```

---

## API Key Connections with Templates

Templated inputs work with any connection type, not just OAuth:

```typescript
import { ConnectionDefinition } from "@prismatic-io/spectral";

connectionConfigVar({
  dataType: "connection",
  inputs: {
    // User inputs
    domain: {
      label: "Instance Domain",
      placeholder: "company-name",
      type: "string",
    },

    apiKey: {
      label: "API Key",
      type: "password",
    },

    // Templated API endpoint
    ...templateConnectionInputs({
      apiEndpoint: (inputs) => `https://${inputs.domain}.api.service.com/v2`,
    }),
  },
});
```

**Using in flow:**

```typescript
onExecution: async (context) => {
  const connection = context.configVars["API Connection"];
  const apiEndpoint = connection.fields.apiEndpoint; // Auto-generated URL
  const apiKey = connection.fields.apiKey;

  const client = createClient({
    baseUrl: apiEndpoint,
    headers: {
      "X-API-Key": apiKey,
    },
  });

  // Make requests...
};
```

---

## Benefits

1. **Better UX**: Users enter domain once instead of 3-4 times
2. **Fewer Errors**: Eliminates typos in multiple URL fields
3. **Consistency**: Ensures all URLs use the same domain
4. **Flexibility**: Easy to update URL patterns without changing config wizard
5. **Multi-tenancy Support**: Perfect for SaaS apps with custom domains

---

## Common Patterns

### Pattern 1: Custom Subdomain

```typescript
domain → https://{domain}.api.example.com
```

### Pattern 2: Regional Endpoints

```typescript
region → https://api-{region}.example.com
```

### Pattern 3: Environment-based

```typescript
env → https://api.{env}.example.com  // api.prod, api.staging, api.dev
```

### Pattern 4: Tenant + Environment

```typescript
tenant + env → https://{tenant}.{env}.api.example.com
```

### Pattern 5: Custom Port

```typescript
domain + port → https://{domain}.example.com:{port}
```

---

## Best Practices

1. **Validate User Input**: Add placeholder text and comments to guide users

   ```typescript
   domain: {
     label: "Domain",
     placeholder: "company-name",
     comments: "Enter only your subdomain (e.g., 'acme-corp')",
   }
   ```

2. **Provide Examples**: Show what the generated URLs will look like

   ```typescript
   comments: "Your authorize URL will be: https://{domain}.example.com/oauth";
   ```

3. **Handle Edge Cases**: Consider empty inputs, special characters, etc.

   ```typescript
   authorizeUrl: (inputs) => {
     const domain = inputs.domain?.trim() || "default";
     return `https://${domain}.example.com/oauth/authorize`;
   };
   ```

4. **Use Type Safety**: Ensure input types match expected values

   ```typescript
   region: {
     type: "string",
     model: [/* predefined options */], // Prevents invalid regions
   }
   ```

5. **Document Pattern**: Add helper text to config page explaining how domain is used

---

## Testing Templated Connections

When testing your integration:

1. **Verify URL Construction**: Log the generated URLs to confirm they're correct

   ```typescript
   context.logger.info("Generated URLs", {
     authorizeUrl: connection.fields.authorizeUrl,
     tokenUrl: connection.fields.tokenUrl,
   });
   ```

2. **Test with Different Domains**: Try various customer domain formats
3. **Check OAuth Flow**: Ensure OAuth redirects work with generated URLs
4. **Validate Error Cases**: Test with missing or invalid domain inputs

---

## Migration from Non-Templated

If you have an existing integration without templates:

1. **Create new config page** with templated connection
2. **Mark old connection as deprecated** (add warning text)
3. **Support both** during transition period
4. **Migrate instances** gradually to new connection

---

## Example: Complete GitHub-Style Integration

See full example in Prismatic GitHub repository:  
https://github.com/prismatic-io/examples/tree/main/integrations/templated-connection-inputs

This example demonstrates:

- Multi-tenant OAuth with custom domains
- Templated API endpoints
- Region selection
- Best practices for UX

---

## Related Patterns

- **Connection Templates**: Pre-fill connection values across integrations (different from templated inputs)
- **Data Sources**: Dynamic dropdowns based on connection state
- **Environment Variables**: Store client secrets outside code

---

## When NOT to Use Templates

Don't use templated inputs when:

- URLs are completely static (no variation per customer)
- Users need full control over exact URLs
- The derived logic is complex and error-prone
- Different customers use completely different URL patterns

In these cases, use regular connection inputs instead.

---

## Reference

**Spectral Documentation:**

- `templateConnectionInputs()` function
- Connection types and OAuth configuration
- Access connection fields in flows

**GitHub Examples:**

- https://github.com/prismatic-io/examples/tree/main/integrations/templated-connection-inputs
- https://github.com/prismatic-io/examples/tree/main/integrations/code-native-integrations/slack-cni-integration

**Prismatic Docs:**

- Custom Connections: https://prismatic.io/docs/custom-connectors/connections/
- Code-Native Config Wizard: https://prismatic.io/docs/integrations/code-native/config-wizard/
