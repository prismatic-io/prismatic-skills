---
name: component-patterns
version: 1.0.0
description: Architecture patterns, code generation guides, and reference documentation for building Prismatic custom components.
user-invocable: false
---

# Component Patterns

Reference documentation for building Prismatic custom components.

## Component Types

### Utility Components
- Provide helper actions (data transformation, formatting, etc.)
- No external connections needed

### Connector Components (Standard Pattern)
- Wrap external APIs (Salesforce, Canny, HubSpot, etc.)
- Support OAuth2, API Key, Bearer Token auth
- Installed via Prism CLI

## Phase: Inline API Research

When the DAG emits `status: "inline_task"` for API research, perform the research directly (no sub-agent). Key strategies:

- **Start broad**: First WebFetch fetches the entry-point URL with a comprehensive prompt extracting auth, base URL, endpoints, webhooks, and rate limits in one pass
- **Anchor deduplication**: Many APIs publish all docs on a single page with `#anchor` links. Strip fragments before fetching — `https://docs.example.com/api#posts` is the same page as `https://docs.example.com/api`
- **Follow-up fetches**: Only for genuinely different URL paths (e.g., `/api/authentication` vs `/api`)
- **Max 10 WebFetch calls**: If docs are insufficient after 10 fetches, note gaps and move on
- **Official docs only**: Stay on the documentation domain. No third-party sources (Zapier, Make, Stack Overflow)
- **Auth priority**: OAuth2 > API Key > Bearer Token > Basic Auth
- **Output format**: Structured JSON with `apiName`, `baseUrl`, `documentationUrl`, `authentication`, `resources`, `webhooks`, `rateLimiting`
- See `references/api-research-guide.md` for detailed format and examples

## Phase-Specific References

Load only the references relevant to your current workflow phase. This keeps context focused and avoids attention budget waste.

### Phase 2: Requirements Gathering
- `references/api-research-guide.md` - How to research external APIs

### Phase 3: Scaffold
- `references/component-architecture.md` - Component directory structure
- `references/spectral-component-quickstart.md` - Spectral SDK basics

### Phase 4: Code Generation
- `references/code-generation-guide.md` - File generation patterns
- `references/authentication-patterns.md` - API Key and OAuth2 patterns
- `references/oauth2-connection-guide.md` - Deep dive on OAuth2 connections (only if OAuth2)
- Templates: `${CLAUDE_PLUGIN_ROOT}/templates/component/` - Structural templates for all source files

### Phase 5: Build & Deploy
- `references/troubleshooting-errors.md` - Build/test failure solutions

### Examples (consult during code generation)
- `references/examples/utility-component/` - Complete utility example
- `references/examples/apikey-connector/` - Connector with API Key auth
- `references/examples/oauth2-connector/` - Connector with OAuth2 auth

## All References

Full reference list for manual lookup:
- `references/workflow-phases.md` - Complete phase-by-phase workflow
- `references/component-architecture.md` - Component directory structure
- `references/code-generation-guide.md` - File generation patterns
- `references/authentication-patterns.md` - API Key and OAuth2 patterns
- `references/oauth2-connection-guide.md` - Deep dive on OAuth2 connections
- `references/api-research-guide.md` - How to research external APIs
- `references/spectral-component-quickstart.md` - Spectral SDK basics
- `references/troubleshooting-errors.md` - Build/test failure solutions

## Component Key Patterns

1. **Connection Fields**: Include appropriate auth fields for the target API
2. **Webhook Lifecycle**: Always implement onInstanceDeploy and onInstanceDelete for triggers
3. **Component Key**: Component name in lowercase (e.g., `canny`)
