---
name: component-patterns
version: 2.0.0
description: Architecture patterns, code generation guides, and reference documentation for building Prismatic custom components.
user-invocable: false
---

# Component Patterns

Reference documentation for building Prismatic custom components.

<disallowed-tools>
Do NOT use these MCP tools — they return incomplete data that causes broken scaffolds and missing connections downstream. A hook will deny them, but avoid the wasted round trip.

- `mcp__prism__prism_components_list` — Use `run.ts find-components <keyword>` instead
- `mcp__prism__prism_components_init` — Use `run.ts scaffold-component` instead
- `mcp__prism__prism_components_publish` — Use `run.ts publish-component` instead
- `mcp__prism__prism_components_generate_manifest` — Manifests are auto-generated during scaffolding
- `mcp__prism__prism_install_component_manifest` — Handled by `run.ts scaffold-project --components`
- `mcp__prism__prism_install_legacy_component_manifest` — Handled by `run.ts scaffold-project --components`
</disallowed-tools>

## Architecture Patterns

### Connector Components
- Wrap external APIs (Salesforce, Canny, HubSpot, etc.)
- Support OAuth2, API Key, Bearer Token, Basic Auth
- Define connections, actions, triggers, and data sources
- Installed via Prism CLI

### Utility Components
- Provide helper actions (data transformation, formatting, etc.)
- No external connections needed
- Define only actions with typed inputs

## Config Mantra

Components define their own inputs — not `configVar()` wrappers. Each action uses `input()` definitions directly:
- `input()` for typed action inputs (label, type, required, comments, default)
- `connection()` for auth field definitions (key, label, inputs)
- Use `util.types` for input type constants
- See `references/authentication-patterns.md` for connection field patterns

## Phase: Existing Component Check

Before scaffolding any connector component, check whether Prismatic already ships one:

```
https://github.com/prismatic-io/components
```

Browse or search (`repo:prismatic-io/components <service-name>`) to see if a subdirectory exists for the target service. If it does:
1. Tell the user an official component exists and link to it
2. Ask whether they want to build a custom variant anyway (e.g., extended actions, different auth) or stop here
3. If proceeding, use the production component as a reference for auth patterns, action structure, and error handling — it reflects current SDK best practices

This check only applies to connector components (those wrapping external APIs), not utility components.

## Phase: API Research

When the `on_answer` trigger fires for `api_docs_url`, the agent spawns the `external-api-researcher`
agent with the URL. The researcher fetches and analyzes the API docs, producing a structured JSON
spec at `{session_dir}/api-research.json`. The component builder waits for results before proceeding.

- See `references/api-research-guide.md` for the output format and research strategies
- Research results inform `auth_type`, `confirm_resources`, `webhook_support`, `base_url`

## Phase-Specific References

Load only the references relevant to your current workflow phase. This keeps context focused and avoids attention budget waste.

### Phase 2: Requirements Gathering
- Spec items carry `agent_context` (narration backbone), `implications` (per-option consequence maps), and `docs` (Prismatic doc URLs). The agent uses these inline — no external references needed for most questions. Docs are fetched on demand only when agent_context is insufficient or the user asks a follow-up beyond what the curated content covers.
- `references/api-research-guide.md` - How to research external APIs (load when `api_docs_url` is answered)

### Phase 3: Scaffold
- `references/component-architecture.md` - Component directory structure
- `references/spectral-component-quickstart.md` - Spectral SDK basics

### Phase 4: Code Generation (PRIMARY PHASE)
See the `<spec-loading>` block in component-builder.md for progressive disclosure rules.
The references below are the full set available — load per the agent's guidance.

- **Production components** (`https://github.com/prismatic-io/components`) — When building a connector, browse the repo for a component that uses the same auth type or a similar API. These are production-grade and show current SDK idioms for client setup, error handling, pagination, and action structure. Fetch raw source with `https://raw.githubusercontent.com/prismatic-io/components/main/<name>/src/index.ts`.
- `references/answer-to-code-cookbook.md` - **LOAD FIRST** — Maps component.yaml answers directly to TypeScript code snippets. Spec items with `cookbook_section` fields point to specific headings in this file — Grep for those headings to find exact patterns, especially after context compaction.
- `references/code-generation-guide.md` - File generation patterns and component structure
- `references/authentication-patterns.md` - API Key, OAuth2, Bearer Token, Basic Auth patterns
- Templates: `${CLAUDE_PLUGIN_ROOT}/templates/component/` - Structural templates for all source files

**Conditional references for Phase 4 (load based on requirements):**
- If webhook triggers: `references/trigger-patterns.md` - Webhook trigger lifecycle and implementation
- If polling triggers: `references/trigger-patterns.md` - Polling trigger with `pollingTrigger()`, `context.polling` state management
- If OAuth2 auth: `references/oauth2-connection-guide.md` - Deep dive on OAuth2 connections (use `oauth2Connection()` from spectral, NOT `connection()`)
- If data sources: `references/data-source-patterns.md` - Data source implementation patterns
- Always for connectors: `references/client-patterns.md` - HTTP client helper patterns

### Phase 5: Build & Publish
- `references/troubleshooting-errors.md` - Build/publish failure solutions

### Examples (consult during code generation)
- `references/examples/utility-component/` - Complete utility example
- `references/examples/apikey-connector/` - Connector with API Key auth
- `references/examples/oauth2-connector/` - Connector with OAuth2 auth

## All References

Full reference list for manual lookup:
- `references/answer-to-code-cookbook.md` - Maps component.yaml answers to TypeScript code
- `references/api-research-guide.md` - How to research external APIs
- `references/component-architecture.md` - Component directory structure
- `references/code-generation-guide.md` - File generation patterns
- `references/authentication-patterns.md` - API Key and OAuth2 patterns
- `references/oauth2-connection-guide.md` - Deep dive on OAuth2 connections
- `references/spectral-component-quickstart.md` - Spectral SDK basics
- `references/trigger-patterns.md` - Webhook trigger lifecycle
- `references/data-source-patterns.md` - Data source patterns
- `references/client-patterns.md` - HTTP client helper patterns
- `references/troubleshooting-errors.md` - Build/publish failure solutions
- `references/examples/utility-component/` - Complete utility example
- `references/examples/apikey-connector/` - Connector with API Key auth
- `references/examples/oauth2-connector/` - Connector with OAuth2 auth

## Component Key Patterns

1. **Function-based client**: `createClient(connection, debug)` returning `HttpClient` from spectral — NOT class-based
2. **Error hook**: Every component MUST include `hooks: { error: (error) => { ... } }` — re-throw `ConnectionError` as-is, wrap others in `new Error()`
3. **rawRequest action**: REQUIRED in every component at `actions/misc/rawRequest.ts`
4. **Folder-based structure**: `actions/<resource>/`, `inputs/`, `examplePayloads/`, `dataSources/`, `triggers/`
5. **examplePayload**: Every action must have one, imported from `src/examplePayloads/`, verified against API
6. **Clean functions**: Every non-connection input needs `clean: util.types.toString` (or toBool, toNumber, etc.)
7. **Input requirements**: `comments`, `placeholder`, `example` on every string input
8. **Data source elements**: `{ label, key }` format (NOT `{ label, value }`) — type is `Element` from spectral
9. **Debug wiring**: `context.debug.enabled` → `createClient(connection, debug)` in actions, `false` in lifecycle hooks
10. **ConnectionError**: Thrown in client.ts for connection type mismatches, NOT in actions
11. **Webhook URL**: `context.webhookUrls[context.flow.name]` in lifecycle hooks
12. **Connection keys**: Simple names (`"apiKey"`, `"oauth2"`) — NOT `"component-api-key"`
13. **Action return**: Always `{ data: <result> }`. DataSource return: `{ result: Element[] }`
