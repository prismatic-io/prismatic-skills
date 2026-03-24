---
name: embedded
description: Reference documentation for embedding Prismatic's integration marketplace and workflow builder in a web application. Covers JWT authentication, the embedded SDK, marketplace and workflow embedding, theming, i18n, additional screens, and custom marketplace UI.
user-invocable: false
---

# Prismatic Embedded

Reference documentation for embedding Prismatic's integration marketplace and workflow builder inside a customer-facing web application.

## Core Concepts

Embedding Prismatic means your customers never leave your app to manage integrations. The flow is:

1. **Your backend** generates a short-lived signed JWT (10 min) authenticating the customer user
2. **Your frontend** calls `prismatic.authenticate({ token })` with that JWT — **never sign JWTs on the frontend**
3. The frontend calls `prismatic.showMarketplace()`, `prismatic.showWorkflows()`, or another screen method to render an embedded iframe

Before the JWT expires, the frontend re-fetches a fresh JWT from your backend and calls `prismatic.authenticate({ token })` again. Existing iframes update automatically.

## Critical Security Rule

**JWT tokens MUST be signed on your backend using your private key.**
Never expose the private signing key to the frontend. The frontend only receives the signed JWT string from a backend API endpoint.

## Signing Keys

Before any embedding can work, your organization needs a signing key. To check or create one:

```bash
# Check existing signing keys
prism organization:signing-keys:list --extended --output json

# Generate a new signing key (Prismatic creates the key pair)
prism organization:signing-keys:generate

# OR: import your own key generated with OpenSSL
openssl genrsa -out my-private-key.pem 4096
openssl rsa -in my-private-key.pem -pubout > my-public-key.pub
prism organization:signing-keys:import -p my-public-key.pub
```

The private key is only shown once at generation time — store it securely (e.g., environment variable or secrets manager). Prismatic only stores the last 8 characters of the public key for identification.

## SDK Quick Start

```bash
npm install @prismatic-io/embedded
```

```typescript
import prismatic from "@prismatic-io/embedded";

// 1. Initialize once on app startup (before authentication)
prismatic.init();

// 2. Authenticate with a JWT fetched from YOUR backend
const { token } = await fetch("/api/integration-token").then(r => r.json());
await prismatic.authenticate({ token });

// 3. Show an embedded screen
prismatic.showMarketplace({ selector: "#integrations-div", usePopover: false });
```

## JWT Required Claims

Every JWT must include these Prismatic-specific fields — standard JWT libraries won't add them automatically:

| Claim | Required | Description |
|-------|----------|-------------|
| `sub` | Yes | Unique user ID (UUID or similar) |
| `organization` | Yes | Prismatic organization ID (from org settings → Embedded tab) |
| `customer` | Yes | Your internal customer/tenant ID — identifies which customer this user belongs to |
| `iat` | Yes | Issued-at Unix timestamp. Use `currentTime - 5` to buffer for clock skew |
| `exp` | Yes | Expiry Unix timestamp. Use `currentTime + 600` (10 minutes) |
| `external_id` | No | External ID for this user in Prismatic; typically matches `sub` |
| `name` | No | User's display name |
| `customer_name` | No | If no customer with this `customer` ID exists yet, creates one with this name |
| `role` | No | ULC only: `"admin"` (can deploy) or `"user"` (supplies user config). Defaults to `"admin"`. |

`organization` and `customer` are the most commonly missed fields — they are not standard JWT claims and must be set explicitly.

Minimum valid payload:

```json
{
  "sub": "user-uuid",
  "organization": "T3JnYW5pemF0aW9uOi...",
  "customer": "your-customer-id",
  "iat": 1700000000,
  "exp": 1700000600
}
```

## JWT Token Lifecycle

- Keep token lifetime short: **10 minutes** (`exp: currentTime + 600`)
- Add a small clock-skew buffer: `iat: currentTime - 5`
- **Re-authenticate before expiry**: set a timer to fetch a new JWT and call `prismatic.authenticate({ token })` again ~1 minute before the token expires
- Existing iframes are updated automatically when `prismatic.authenticate` is called with a new token

## SDK Methods Reference

| Method | Purpose |
|--------|---------|
| `prismatic.init(options?)` | Initialize the SDK (call once at app startup) |
| `prismatic.authenticate({ token })` | Authenticate with a signed JWT |
| `prismatic.showMarketplace(options?)` | Embed the integration marketplace |
| `prismatic.showWorkflows(options?)` | Embed the workflow builder list |
| `prismatic.showWorkflow({ workflowId, ...options })` | Open a specific workflow in the builder |
| `prismatic.showDashboard(options?)` | Embed the customer dashboard |
| `prismatic.showConnections(options?)` | Embed the connections management screen |
| `prismatic.showLogs(options?)` | Embed the logs screen |
| `prismatic.showComponents(options?)` | Embed the component browser |
| `prismatic.showComponent({ componentId, ...options })` | Show a specific component |
| `prismatic.configureInstance(props)` | Open a config wizard for an integration |
| `prismatic.setConfigVars({ iframe, configVars })` | Programmatically set config variables |
| `prismatic.graphqlRequest({ query, variables? })` | Execute authenticated GraphQL queries |

## All References

Load these on demand based on the task at hand:

- `references/authentication.md` — JWT claims, signing examples for Node.js, Python, Ruby, Go, C#, and re-authentication pattern
- `references/sdk-api.md` — Full SDK type definitions, ScreenConfiguration, Filters, PrismaticMessageEvent enum
- `references/marketplace.md` — showMarketplace, filters (simple and advanced), configureInstance, events, setConfigVars
- `references/workflow-builder.md` — showWorkflows, showWorkflow, key differences from the low-code designer
- `references/theming-and-i18n.md` — Light/dark mode, custom fonts, loading screen, custom terms, translations
- `references/additional-screens.md` — showDashboard, showConnections, showComponents, showLogs, common options
- `references/custom-marketplace-ui.md` — Building a fully custom marketplace with GraphQL, TypeScript types, avatar images
- `references/framework-examples.md` — React, Next.js, Vue, and Svelte integration patterns with full code examples
