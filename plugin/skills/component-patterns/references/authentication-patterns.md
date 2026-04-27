# Authentication Patterns

This guide covers the authentication patterns for Prismatic custom components.

## Connection Types

Prismatic supports multiple connection types:

| Type | Use Case | Spectral Function |
|------|----------|-------------------|
| API Key | Simple token-based auth | `connection()` |
| OAuth2 Authorization Code | User-facing integrations | `oauth2Connection()` |
| OAuth2 Client Credentials | Server-to-server auth | `oauth2Connection()` |
| Basic Auth | Username/password | `connection()` |
| Bearer Token | Simple bearer auth | `connection()` |

## API Key Connection

The simplest authentication pattern.

```typescript
import { connection, input } from "@prismatic-io/spectral";

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
      comments: "Your API key from the service dashboard",
    }),
    base_url: input({
      label: "Base URL",
      type: "string",
      required: false,
      default: "https://api.example.com",
      comments: "API base URL (optional)",
    }),
  },
});
```

**Using in client:**

```typescript
constructor({ connection }: { connection: Connection }) {
  const apiKey = connection.fields.api_key as string;
  const baseUrl = connection.fields.base_url as string || "https://api.example.com";

  this.client = createClient({
    baseUrl,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      // Or: "X-API-Key": apiKey
    },
  });
}
```

## OAuth2 Authorization Code

For integrations where users grant access to their accounts.

```typescript
import { oauth2Connection, OAuth2Type } from "@prismatic-io/spectral";

export const oauth2Connection = oauth2Connection({
  key: "oauth2",
  display: {
    label: "OAuth 2.0",
    description: "Connect using OAuth 2.0 Authorization Code flow",
  },
  oauth2Type: OAuth2Type.AuthorizationCode,
  inputs: {
    authorizeUrl: {
      label: "Authorize URL",
      type: "string",
      required: true,
      shown: true,
      default: "https://example.com/oauth/authorize",
      comments: "OAuth 2.0 authorization endpoint",
    },
    tokenUrl: {
      label: "Token URL",
      type: "string",
      required: true,
      shown: true,
      default: "https://example.com/oauth/token",
      comments: "OAuth 2.0 token endpoint",
    },
    scopes: {
      label: "Scopes",
      type: "string",
      required: false,
      shown: true,
      default: "read write",
      comments: "Space-separated list of OAuth scopes",
    },
    clientId: {
      label: "Client ID",
      type: "string",
      required: true,
      shown: true,
    },
    clientSecret: {
      label: "Client Secret",
      type: "password",
      required: true,
      shown: true,
    },
  },
});
```

**Using in client:**

```typescript
constructor({ connection }: { connection: Connection }) {
  // OAuth2 tokens are stored in connection.token
  const accessToken = connection.token?.access_token;

  if (!accessToken) {
    throw new Error("No access token available. User may need to re-authenticate.");
  }

  this.client = createClient({
    baseUrl: "https://api.example.com",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
```

## OAuth2 Client Credentials

For server-to-server authentication without user interaction.

```typescript
import { oauth2Connection, OAuth2Type } from "@prismatic-io/spectral";

export const clientCredentialsConnection = oauth2Connection({
  key: "clientCredentials",
  display: {
    label: "OAuth 2.0 Client Credentials",
    description: "Connect using client credentials (server-to-server)",
  },
  oauth2Type: OAuth2Type.ClientCredentials,
  inputs: {
    tokenUrl: {
      label: "Token URL",
      type: "string",
      required: true,
      shown: true,
      default: "https://example.com/oauth/token",
    },
    scopes: {
      label: "Scopes",
      type: "string",
      required: false,
      shown: false,
      default: "https://example.com/.default",
    },
    clientId: {
      label: "Client ID",
      type: "string",
      required: true,
      shown: true,
    },
    clientSecret: {
      label: "Client Secret",
      type: "password",
      required: true,
      shown: true,
    },
  },
});
```

## Basic Auth Connection

For services using username/password authentication.

```typescript
import { connection, input } from "@prismatic-io/spectral";

export const basicAuthConnection = connection({
  key: "basicAuth",
  display: {
    label: "Basic Authentication",
    description: "Connect using username and password",
  },
  inputs: {
    username: input({
      label: "Username",
      type: "string",
      required: true,
    }),
    password: input({
      label: "Password",
      type: "password",
      required: true,
    }),
  },
});
```

**Using in client:**

```typescript
constructor({ connection }: { connection: Connection }) {
  const username = connection.fields.username as string;
  const password = connection.fields.password as string;
  const credentials = Buffer.from(`${username}:${password}`).toString("base64");

  this.client = createClient({
    baseUrl: "https://api.example.com",
    headers: {
      Authorization: `Basic ${credentials}`,
    },
  });
}
```

## Multiple Connection Types

If an API supports multiple auth methods, export them all:

```typescript
// connection.ts
import { connection, oauth2Connection, OAuth2Type, input } from "@prismatic-io/spectral";

export const apiKeyConnection = connection({
  key: "apiKey",
  // ... API Key config
});

export const oauth2Auth = oauth2Connection({
  key: "oauth2",
  // ... OAuth2 config
});

// Export all connections
export default [apiKeyConnection, oauth2Auth];
```

**Using in client (supporting both):**

```typescript
constructor({ connection }: { connection: Connection }) {
  // Prefer OAuth2 token if available, fall back to API key
  const token = connection.token?.access_token || connection.fields.api_key;

  if (!token) {
    throw new Error("No authentication credentials available");
  }

  this.client = createClient({
    baseUrl: "https://api.example.com",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
```

## Input Field Options

Common input field configurations:

| Option | Type | Description |
|--------|------|-------------|
| `label` | string | Display label |
| `type` | string | `string`, `password`, `boolean`, `number` |
| `required` | boolean | Whether field is required |
| `shown` | boolean | Whether to show in UI |
| `default` | any | Default value |
| `comments` | string | Help text |
| `example` | string | Example value |
| `placeholder` | string | Placeholder text |

## Templated Connection Inputs (Multi-Tenant OAuth)

When OAuth authorize/token URLs vary per customer (e.g., `{subdomain}.acme.com`), use `templateConnectionInputs` to let users provide a value that gets substituted into the URLs.

`templateConnectionInputs` takes **3 parameters**:

```typescript
import {
  OAuth2Type,
  oauth2Connection,
  templateConnectionInputs,
} from "@prismatic-io/spectral";

export const acmeOAuth = oauth2Connection({
  key: "acmeOauth",
  display: {
    label: "Acme OAuth 2.0",
    description: "Connect to Acme with OAuth 2.0 auth code flow",
  },
  oauth2Type: OAuth2Type.AuthorizationCode,
  inputs: templateConnectionInputs(
    // Parameter 1: User-defined inputs (shown in the config wizard)
    {
      domain: {
        label: "Acme Subdomain",
        example: "pied-piper",
        type: "string",
        required: true,
        shown: true,
        comments: "Your subdomain: the **pied-piper** portion of **pied-piper**.acme.com.",
      },
      clientId: {
        label: "Client ID",
        type: "string",
        required: true,
        shown: true,
        comments: "Obtain by creating an OAuth app at https://partners.acme.com/",
      },
      clientSecret: {
        label: "Client Secret",
        type: "password",
        required: true,
        shown: true,
        comments: "Obtain by creating an OAuth app at https://partners.acme.com/",
      },
      scopes: {
        label: "Scopes",
        example: "widgets.read widgets.write offline_access",
        default: "widgets.read widgets.write offline_access",
        type: "string",
        required: false,
        shown: true,
        comments: "Space-delimited scopes to request",
      },
    },
    // Parameter 2: Templated inputs (URLs with {{#fieldName}} substitution)
    {
      authorizeUrl: {
        label: "Authorize URL",
        placeholder: "Authorize URL",
        type: "template",
        comments: "The OAuth 2.0 Authorization URL",
        templateValue: "https://{{#domain}}.acme.com/oauth/authorize/",
      },
      tokenUrl: {
        label: "Token URL",
        placeholder: "Token URL",
        type: "template",
        comments: "The OAuth 2.0 Token URL",
        templateValue: "https://{{#domain}}.acme.com/oauth/token/",
      },
    },
    // Parameter 3: OAuth2 flow type
    OAuth2Type.AuthorizationCode,
  ),
});
```

Template syntax uses **`{{#fieldName}}`** (Handlebars-style with `#`) — NOT ES6 template literals.

## Token Refresh

OAuth2 connections handle token refresh automatically through Prismatic. The `connection.token.access_token` will always be a valid token when accessed in your component code.

## Security Best Practices

1. **Always use `password` type** for sensitive fields (API keys, secrets)
2. **Validate tokens** before making API calls
3. **Handle auth errors gracefully** with clear error messages
4. **Don't log sensitive data** like tokens or keys
