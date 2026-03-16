---
name: prismatic-api
version: 1.0.0
description: Prismatic API access patterns and GraphQL reference. Covers the two-tier access hierarchy (MCP tools → Prism CLI), CLI usage rules, GraphQL query patterns, pagination, authentication, and managing platform resources programmatically.
user-invocable: false
---

# Prismatic API

Reference documentation for Prismatic platform operations and the standardized API access hierarchy.

## API Access Method Hierarchy

Prismatic API access follows a **two-tier priority system** for interactive agents (e.g., Orby). Builder agents (cni-builder, component-builder) use their own script-based pipelines and should not use MCP tools directly — see their agent docs for details.

### Priority 1: MCP Tools (Interactive Agents Only)

Use MCP tools when operating within an interactive agent conversation (e.g., Orby). These handle auth, retries, and output formatting automatically.

| MCP Tool | Operation |
|----------|-----------|
| `mcp__plugin_prismatic-skills_prism__prism_me` | Check auth / user profile |
| `mcp__plugin_prismatic-skills_prism__prism_components_list` | List / search components |
| `mcp__plugin_prismatic-skills_prism__prism_components_init` | Initialize new component |
| `mcp__plugin_prismatic-skills_prism__prism_components_publish` | Publish component |
| `mcp__plugin_prismatic-skills_prism__prism_components_generate_manifest` | Generate component manifest |
| `mcp__plugin_prismatic-skills_prism__prism_integrations_list` | List / search integrations |
| `mcp__plugin_prismatic-skills_prism__prism_integrations_init` | Initialize new CNI |
| `mcp__plugin_prismatic-skills_prism__prism_integrations_import` | Import / update CNI |
| `mcp__plugin_prismatic-skills_prism__prism_integrations_convert` | Convert YAML to CNI |
| `mcp__plugin_prismatic-skills_prism__prism_integrations_flows_list` | List flows for integration |
| `mcp__plugin_prismatic-skills_prism__prism_integrations_flows_test` | Test a flow |
| `mcp__plugin_prismatic-skills_prism__prism_integrations_flows_listen` | Listen for webhook payloads |
| `mcp__plugin_prismatic-skills_prism__prism_integrations_generate_flow` | Generate flow boilerplate |
| `mcp__plugin_prismatic-skills_prism__prism_integrations_generate_config_page` | Generate config page |
| `mcp__plugin_prismatic-skills_prism__prism_integrations_generate_config_var` | Generate config variable |
| `mcp__plugin_prismatic-skills_prism__prism_integrations_add_connection_config_var` | Add connection config var |
| `mcp__plugin_prismatic-skills_prism__prism_integrations_add_datasource_config_var` | Add datasource config var |
| `mcp__plugin_prismatic-skills_prism__prism_install_component_manifest` | Install component manifest in CNI |
| `mcp__plugin_prismatic-skills_prism__prism_install_legacy_component_manifest` | Legacy manifest install |

### Priority 2: Prism CLI (Scripts + Agents)

For scripts and operations not covered by MCP tools:

**Built-in commands** (via `prism-retry.ts`):
```bash
prism integrations:list --extended --output json
prism components:publish --directory ./my-component
prism integrations:import --directory ./my-integration
```

**Custom GraphQL queries** (via `shared/graphql.ts`):
```typescript
import { graphql, GraphQLError } from "./shared/graphql.js";

const data = graphql('query { customers { nodes { id name } } }');
```

Or directly via CLI:
```bash
prism graphql:query 'query { customers { nodes { id name } } }'
prism graphql:query 'query($id: ID!) { customer(id: $id) { name } }' \
  --variables '{"id": "Q3VzdG9tZXI6..."}'
```

### Decision Tree

```
Agent calling directly?  → Use MCP tool if available, else `prism` via Bash
Script?                  → Use shared/graphql.ts for custom queries,
                           prism-retry.ts for built-in CLI commands
```

**Rule: NEVER create inline GraphQL clients** — always use `shared/graphql.ts` imports.

## CLI Usage Rules

1. **`prism` must be installed globally** (`npm install -g @prismatic-io/prism`) — never use `npx prism`
2. **All list commands**: always use `--extended --output json`
3. **`--extended` and `--columns` are mutually exclusive** — always prefer `--extended`
4. **For `graphql:query`**: always use `--variables` flag, never string interpolation
5. **Auth is handled by the CLI** — no custom token exchange needed

## API Endpoint

- **URL**: `{PRISMATIC_URL}/api` (default: `https://app.prismatic.io/api`)
- **Method**: HTTP POST with JSON body `{"query": "...", "variables": {}}`
- **Auth**: Bearer token in `Authorization` header
- **Content-Type**: `application/json`

## Authentication

Obtain tokens via Prism CLI. See `references/authentication.md`.

**Quick reference**:

- `prism me:token` - Short-lived access token
- `prism me:token --type refresh` - Long-lived refresh token
- Access tokens valid for 7 days, auto-refreshed 5 minutes before expiry
- All authenticated requests return HTTP 200, even on errors - always check `errors` array

## Pagination

All collection queries use Relay cursor-based pagination. See `references/pagination-and-filtering.md`.

```graphql
query($after: String) {
  resources(after: $after, first: 100) {
    nodes { id name }
    pageInfo { hasNextPage endCursor }
  }
}
```

## Critical Patterns

1. **Enum values are lowercase strings**: `variableScope: "customer"` not `"CUSTOMER"`, `managedBy: "org"` not `"ORG"`
2. **Use `updateInstanceConfigVariables`** (partial, safe) not `updateInstance` (replaces ALL config vars)
3. **Always deploy after config changes**: Call `deployInstance` to activate
4. **Use parameterized variables**: Never string-concatenate into queries
5. **Check mutation errors**: Mutations return `errors { field messages }` alongside results

## Key References by Resource Type

### Core Resources

- `references/customers.md` - Customer CRUD, external IDs, labels
- `references/integrations.md` - Integration management, publishing, testing
- `references/instances.md` - Instance deployment, config variables, lifecycle
- `references/components.md` - Component queries, action introspection, search

### Connections & Config

- `references/connections.md` - Scoped config vars, customer config vars, connection management
- `references/config-variables.md` - Instance config updates, deployment patterns

### Operational

- `references/execution-and-logs.md` - Execution results, step results, log queries, replay
- `references/common-patterns.md` - Batch operations, nested queries, aliased mutations, error handling
- `references/api-access-methods.md` - Detailed MCP tool reference, CLI patterns, migration notes
