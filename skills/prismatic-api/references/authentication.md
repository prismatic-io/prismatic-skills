# Authentication

## Token Types

| Token         | Lifetime   | Obtained via                    | Use case              |
|---------------|------------|---------------------------------|-----------------------|
| Access token  | 7 days     | `prism me:token`                | API requests          |
| Refresh token | Long-lived | `prism me:token --type refresh` | Token exchange, CI/CD |

## Obtaining Tokens

### Via Prism CLI (preferred)

```bash
# Short-lived access token
prism me:token

# Long-lived refresh token
prism me:token --type refresh
```

### Via Environment Variables

```bash
export PRISM_REFRESH_TOKEN="your-refresh-token"
export PRISMATIC_URL="https://app.prismatic.io"  # optional, defaults to this
```

### Via Auth Meta + Token Exchange

1. Fetch auth config:

   ```bash
   curl https://app.prismatic.io/auth/meta
   # Returns: {"domain": "...", "clientId": "..."}
   ```

2. Exchange refresh token for access token:

   ```bash
   curl "https://{domain}/oauth/token" \
     --request POST \
     --header "Content-Type: application/x-www-form-urlencoded" \
     --data "grant_type=refresh_token&client_id={clientId}&refresh_token={refreshToken}"
   ```

### Via Manual Token Refresh

```bash
curl "https://app.prismatic.io/auth/refresh" \
  --request POST \
  --header "Content-Type: application/json" \
  --data '{"refresh_token": "YOUR_REFRESH_TOKEN"}'
```

For multi-tenant setups, include `tenant_id` in the request body.

## Making Authenticated Requests

```bash
export PRISMATIC_API_TOKEN=$(prism me:token)

curl https://app.prismatic.io/api \
  --request POST \
  --header "Authorization: Bearer ${PRISMATIC_API_TOKEN}" \
  --header "Content-Type: application/json" \
  --header "Prismatic-Client: prism" \
  --data '{"query": "query { authenticatedUser { id email name org { id name } } }"}'
```

## Verify Authentication

```graphql
query me {
  authenticatedUser {
    id
    email
    name
    org {
      id
      name
    }
  }
}
```

## Token Revocation

```bash
# Revokes ALL refresh tokens for the user
prism me:token:revoke
```

Or via API:

```bash
curl "https://app.prismatic.io/auth/revoke" --request POST \
  --header "Content-Type: application/json" \
  --data '{"refresh_token": "YOUR_REFRESH_TOKEN"}'
```

## Scripts (Plugin)

For GraphQL queries in scripts, use `shared/graphql.ts`:

```typescript
import { graphql, ensureAuthenticated, GraphQLError } from "./shared/graphql.js";

ensureAuthenticated();  // Pre-flight check
const data = graphql('query { authenticatedUser { email } }');
```

Authentication is handled entirely by the Prism CLI. The user must be logged in via `prism login`. The `graphql()` function delegates to `prism graphql:query`, which manages tokens automatically.

**Retry behavior** (via `prism-retry.ts`):

- Network errors: 5 attempts, exponential backoff (1-10s)
- Auth errors: Fail fast (no retry)
- Rate limits: Retry with backoff
