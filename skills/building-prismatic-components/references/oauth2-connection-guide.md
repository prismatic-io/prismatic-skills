# OAuth2 Connection Guide

This guide provides a deep dive into implementing OAuth2 authentication in Prismatic components.

## Why OAuth2?

OAuth2 is the preferred authentication method because:

1. **User-friendly** - Users authorize via browser, no manual token management
2. **Secure** - Tokens are automatically refreshed, credentials not stored
3. **Standard** - Well-defined protocol supported by most modern APIs
4. **Scoped** - Granular permissions through scopes

## OAuth2 Flow Types

### Authorization Code (Most Common)

Used when integrations need access to user-specific data.

**Flow:**
1. User clicks "Connect" in Prismatic
2. Browser redirects to provider's authorize URL
3. User grants permission
4. Provider redirects back with authorization code
5. Prismatic exchanges code for access token
6. Token is stored and refreshed automatically

```typescript
import { oauth2Connection, OAuth2Type } from "@prismatic-io/spectral";

export const oauth = oauth2Connection({
  key: "oauth",
  display: {
    label: "OAuth 2.0 Authorization Code",
    description: "Connect using OAuth 2.0",
  },
  oauth2Type: OAuth2Type.AuthorizationCode,
  inputs: {
    authorizeUrl: {
      label: "Authorize URL",
      placeholder: "Authorize URL",
      type: "string",
      required: true,
      shown: true,
      comments: "The OAuth 2.0 Authorization URL",
      default: "https://app.example.com/oauth/authorize",
    },
    tokenUrl: {
      label: "Token URL",
      placeholder: "Token URL",
      type: "string",
      required: true,
      shown: true,
      comments: "The OAuth 2.0 Token URL",
      default: "https://app.example.com/oauth/token",
    },
    scopes: {
      label: "Scopes",
      placeholder: "Scopes",
      type: "string",
      required: false,
      shown: true,
      comments: "Space-separated list of OAuth scopes",
      default: "read write offline_access",
    },
    clientId: {
      label: "Client ID",
      placeholder: "Client ID",
      type: "string",
      required: true,
      shown: true,
    },
    clientSecret: {
      label: "Client Secret",
      placeholder: "Client Secret",
      type: "password",
      required: true,
      shown: true,
    },
  },
});
```

### Client Credentials

Used for server-to-server communication without user context.

**Flow:**
1. Application sends client ID + secret to token URL
2. Provider returns access token
3. Token is used for API calls

```typescript
import { oauth2Connection, OAuth2Type } from "@prismatic-io/spectral";

export const clientCredentials = oauth2Connection({
  key: "clientCredentials",
  display: {
    label: "OAuth 2.0 Client Credentials",
    description: "Server-to-server authentication",
  },
  oauth2Type: OAuth2Type.ClientCredentials,
  inputs: {
    tokenUrl: {
      label: "Token URL",
      type: "string",
      required: true,
      shown: true,
      default: "https://app.example.com/oauth/token",
    },
    scopes: {
      label: "Scopes",
      type: "string",
      required: false,
      shown: false,
      default: "https://app.example.com/.default",
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

## Accessing OAuth2 Tokens

In your component code, OAuth2 tokens are accessed via `connection.token`:

```typescript
import type { Connection } from "@prismatic-io/spectral";

export class MyClient {
  private client: HttpClient;

  constructor({ connection }: { connection: Connection }) {
    // Access the OAuth2 token
    const accessToken = connection.token?.access_token;

    if (!accessToken) {
      throw new Error("No access token available");
    }

    this.client = createClient({
      baseUrl: "https://api.example.com",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }
}
```

## Token Object Structure

The `connection.token` object contains:

```typescript
{
  access_token: string;      // The access token for API calls
  refresh_token?: string;    // Used to get new access tokens
  token_type?: string;       // Usually "Bearer"
  expires_in?: number;       // Token lifetime in seconds
  scope?: string;            // Granted scopes
}
```

## Supporting Both API Key and OAuth2

Many APIs support multiple auth methods. Implement both:

```typescript
// connection.ts
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

export const oauth2Auth = oauth2Connection({
  key: "oauth2",
  display: {
    label: "OAuth 2.0",
    description: "Connect using OAuth 2.0",
  },
  oauth2Type: OAuth2Type.AuthorizationCode,
  inputs: {
    authorizeUrl: { /* ... */ },
    tokenUrl: { /* ... */ },
    scopes: { /* ... */ },
    clientId: { /* ... */ },
    clientSecret: { /* ... */ },
  },
});

export default [apiKeyConnection, oauth2Auth];
```

```typescript
// client.ts
constructor({ connection }: { connection: Connection }) {
  // Check for OAuth2 token first, then fall back to API key
  const token = connection.token?.access_token || connection.fields.api_key;

  if (!token) {
    throw new Error("No authentication credentials provided");
  }

  this.client = createClient({
    baseUrl: "https://api.example.com",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
```

## Advanced OAuth2 Configuration

### Additional Authorize Parameters

Some OAuth providers require extra parameters:

```typescript
export const oauth = oauth2Connection({
  key: "oauth",
  // ...
  inputs: {
    // ... standard inputs ...

    // Additional authorize URL parameters
    additionalAuthorizeParams: {
      label: "Additional Authorize Parameters",
      type: "string",
      required: false,
      shown: false,
      default: "response_type=code&access_type=offline",
      comments: "Extra query parameters for authorize URL",
    },
  },
});
```

### Token Request Body Format

Some APIs require form-encoded vs JSON:

```typescript
export const oauth = oauth2Connection({
  key: "oauth",
  oauth2Type: OAuth2Type.AuthorizationCode,
  // Token requests are form-encoded by default (standard OAuth2)
  // ...
});
```

## Common OAuth2 Providers

### Example: Slack

```typescript
export const slackOAuth = oauth2Connection({
  key: "slackOAuth",
  display: {
    label: "Slack OAuth 2.0",
    description: "Connect to Slack",
  },
  oauth2Type: OAuth2Type.AuthorizationCode,
  inputs: {
    authorizeUrl: {
      label: "Authorize URL",
      type: "string",
      required: true,
      default: "https://slack.com/oauth/v2/authorize",
    },
    tokenUrl: {
      label: "Token URL",
      type: "string",
      required: true,
      default: "https://slack.com/api/oauth.v2.access",
    },
    scopes: {
      label: "Scopes",
      type: "string",
      default: "channels:read channels:write chat:write",
    },
    clientId: { label: "Client ID", type: "string", required: true },
    clientSecret: { label: "Client Secret", type: "password", required: true },
  },
});
```

### Example: Google

```typescript
export const googleOAuth = oauth2Connection({
  key: "googleOAuth",
  display: {
    label: "Google OAuth 2.0",
    description: "Connect to Google",
  },
  oauth2Type: OAuth2Type.AuthorizationCode,
  inputs: {
    authorizeUrl: {
      label: "Authorize URL",
      type: "string",
      required: true,
      default: "https://accounts.google.com/o/oauth2/v2/auth",
    },
    tokenUrl: {
      label: "Token URL",
      type: "string",
      required: true,
      default: "https://oauth2.googleapis.com/token",
    },
    scopes: {
      label: "Scopes",
      type: "string",
      default: "https://www.googleapis.com/auth/spreadsheets",
    },
    clientId: { label: "Client ID", type: "string", required: true },
    clientSecret: { label: "Client Secret", type: "password", required: true },
  },
});
```

## Troubleshooting OAuth2

### "Invalid grant" Error
- Authorization code may have expired (typically valid for ~10 minutes)
- User needs to re-authorize

### "Invalid client" Error
- Check client ID and secret are correct
- Verify redirect URI is configured in OAuth app settings

### "Invalid scope" Error
- Requested scopes may not be enabled in OAuth app
- Check for typos in scope names

### Token Not Available
- Ensure `connection.token?.access_token` is checked (may be undefined)
- User may need to re-connect if refresh token expired

## Best Practices

1. **Always include `offline_access` scope** if available - ensures refresh tokens work
2. **Check for token before API calls** - handle missing token gracefully
3. **Don't store tokens manually** - Prismatic handles token storage and refresh
4. **Request minimal scopes** - only request what you need
5. **Test with real OAuth app** - use actual provider credentials for testing
