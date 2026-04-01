# API Research Guide

This guide explains how to effectively research external APIs when building application connectors.

## Why API Research Matters

Building an application connector requires understanding the external API's:

1. **Authentication** - How to authenticate requests
2. **Endpoints** - What operations are available
3. **Data Models** - Request/response schemas
4. **Webhooks** - Event-driven capabilities

Without proper research, you'll generate code that doesn't work with the real API.

## Research Process

### Step 1: Locate Documentation

Start with the API documentation URL provided during requirements gathering.

Common documentation locations:
- `developers.{company}.com`
- `docs.{company}.com/api`
- `{company}.com/api/docs`
- `api.{company}.com/docs`

### Step 2: Research Authentication

**Priority: OAuth2 > API Key > Bearer Token > Basic Auth**

Questions to answer:

1. What authentication methods are supported?
2. For OAuth2:
   - Authorization URL (where users grant access)
   - Token URL (where tokens are exchanged)
   - Required scopes
   - Does it support refresh tokens?
3. For API Key:
   - Where is the key placed? (Header, query param)
   - What header name? (Authorization, X-API-Key)
   - What format? (Bearer {key}, {key})

**Example findings:**

```json
{
  "authentication": {
    "methods": [
      {
        "type": "oauth2_authorization_code",
        "authorizeUrl": "https://app.canny.io/oauth/authorize",
        "tokenUrl": "https://app.canny.io/oauth/token",
        "scopes": "read write",
        "comments": "Recommended for user-facing integrations"
      },
      {
        "type": "api_key",
        "headerName": "Authorization",
        "headerFormat": "Bearer {apiKey}",
        "comments": "For server-to-server integrations"
      }
    ],
    "recommended": "oauth2_authorization_code"
  }
}
```

### Step 3: Identify Base URL

Find the API base URL:
- Look for "Base URL" or "API Endpoint" in docs
- Check API versioning (v1, v2, etc.)
- Note any environment differences (sandbox vs production)

**Example:**
```json
{
  "baseUrl": "https://canny.io/api/v1",
  "environments": {
    "production": "https://canny.io/api/v1",
    "sandbox": "https://sandbox.canny.io/api/v1"
  }
}
```

### Step 4: Document Resources

For each resource/entity the API manages:

1. **List endpoints** (GET /resources)
2. **Get single** (GET /resources/{id})
3. **Create** (POST /resources)
4. **Update** (PUT/PATCH /resources/{id})
5. **Delete** (DELETE /resources/{id})

Document request/response schemas and required fields.

**Example:**

```json
{
  "resources": [
    {
      "name": "posts",
      "endpoints": [
        {
          "method": "GET",
          "path": "/posts",
          "description": "List all posts",
          "parameters": [
            {"name": "limit", "type": "number", "required": false},
            {"name": "skip", "type": "number", "required": false}
          ]
        },
        {
          "method": "POST",
          "path": "/posts",
          "description": "Create a post",
          "body": {
            "title": {"type": "string", "required": true},
            "details": {"type": "string", "required": false},
            "boardID": {"type": "string", "required": true}
          }
        },
        {
          "method": "GET",
          "path": "/posts/{id}",
          "description": "Get a post by ID"
        }
      ],
      "fields": [
        {"name": "id", "type": "string"},
        {"name": "title", "type": "string"},
        {"name": "details", "type": "string"},
        {"name": "status", "type": "string"},
        {"name": "score", "type": "number"},
        {"name": "created", "type": "date"}
      ]
    }
  ]
}
```

### Step 5: Research Webhooks

If the API supports webhooks:

1. **Registration** - How to register a webhook URL
2. **Events** - What events can trigger webhooks
3. **Payload** - What data is included in webhook calls
4. **Security** - How to verify webhook authenticity (signatures)

**Example:**

```json
{
  "webhooks": {
    "supported": true,
    "registrationEndpoint": "POST /webhooks",
    "registrationBody": {
      "url": "string (required)",
      "events": "array of event names"
    },
    "events": [
      "post.created",
      "post.updated",
      "post.deleted",
      "comment.created",
      "vote.created"
    ],
    "payloadFormat": "JSON",
    "examplePayload": {
      "event": "post.created",
      "timestamp": "2024-01-15T10:30:00Z",
      "data": {
        "id": "123",
        "title": "New feature request"
      }
    },
    "security": {
      "type": "signature",
      "header": "X-Webhook-Signature",
      "algorithm": "HMAC-SHA256"
    }
  }
}
```

## How API Research is Triggered

During requirements gathering, when `gather-requirements.ts` outputs `status: "inline_task"`, the builder agent performs API research directly using WebFetch/WebSearch (no sub-agent needed).

Use WebFetch to read documentation pages and follow links to:

- Authentication/Authorization pages
- Individual endpoint references
- Webhook documentation
- SDK examples (can reveal patterns)

### WebFetch Best Practices

- **Start with a single comprehensive fetch** of the entry-point URL extracting auth, base URL, endpoints, webhooks, and rate limits in one pass
- **Anchor deduplication**: Many APIs (e.g., Canny, Linear) publish all docs on one page with `#anchor` links. Strip fragments before fetching — same base URL = same page content
- **Max 10 WebFetch calls** per research session
- **Official docs only** — stay on the documentation domain, no third-party sources
- If information is missing after thorough reading, note it in the `"notes"` field

After research completes, mark the step as answered and continue gathering remaining requirements.

## Output Format

Save research findings to `api-research.json`:

```json
{
  "apiName": "Canny",
  "baseUrl": "https://canny.io/api/v1",
  "documentationUrl": "https://developers.canny.io/api-reference",
  "authentication": {
    "methods": [...],
    "recommended": "oauth2_authorization_code"
  },
  "resources": [...],
  "webhooks": {
    "supported": true,
    ...
  },
  "notes": "Any special considerations or quirks discovered"
}
```

## Common API Patterns

### REST APIs
- Resources mapped to URL paths
- HTTP methods indicate operations
- JSON request/response bodies

### GraphQL APIs
- Single endpoint (typically /graphql)
- Queries and mutations
- Consider using a GraphQL client library

### Pagination
- **Offset-based**: ?limit=10&offset=20
- **Cursor-based**: ?cursor=abc123
- **Page-based**: ?page=2&per_page=10

### Rate Limiting
- Note rate limits in documentation
- Implement backoff/retry logic if needed
