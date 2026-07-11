# API Access Methods

Detailed reference for the two-tier Prismatic API access hierarchy.

## MCP Tools (Priority 1)

MCP tools are available **only in agent conversations** (not in scripts). They handle authentication, retries, and output formatting automatically.

### When to Use MCP Tools

- You are in an agent conversation (Orby, cni-builder, component-builder, lowcode-builder)
- The operation maps to an available MCP tool
- You need interactive results displayed to the user

### MCP Tool Reference

| Tool | Parameters | Description |
|------|-----------|-------------|
| `prism_me` | none | Check login status and user profile |
| `prism_components_list` | `search?`, `columns?` | List/search components |
| `prism_components_init` | `name` | Initialize new component |
| `prism_components_publish` | `directory`, `comment?` | Publish component |
| `prism_components_generate_manifest` | `componentDir`, `name?`, `version?` | Generate manifest |
| `prism_integrations_list` | `search?`, `columns?` | List/search integrations |
| `prism_integrations_init` | `name` | Initialize new CNI |
| `prism_integrations_import` | `directory`, `integrationId?` | Import/update CNI |
| `prism_integrations_convert` | `yamlFile`, `folder?` | Convert YAML to CNI |
| `prism_integrations_flows_list` | `integrationId`, `columns?` | List flows |
| `prism_integrations_flows_test` | `integrationId`, `flowName?`, `sync?` | Test a flow |
| `prism_integrations_flows_listen` | `integrationId`, `flowName?`, `timeout?` | Listen for webhooks |
| `prism_integrations_generate_flow` | `name` | Generate flow boilerplate |
| `prism_integrations_generate_config_page` | `name` | Generate config page |
| `prism_integrations_generate_config_var` | `name`, `dataType` | Generate config var |
| `prism_integrations_add_connection_config_var` | `name`, `componentRef?` | Add connection |
| `prism_integrations_add_datasource_config_var` | `name`, `dataType` | Add datasource |
| `prism_install_component_manifest` | `componentKey`, `directory?` | Install manifest in CNI |
| `prism_install_legacy_component_manifest` | `componentKey` | Legacy manifest install |

**Full tool name format**: `mcp__plugin_prismatic-skills_prism__prism_{tool_name}`

### MCP vs Prism CLI Boundary

MCP tools are wrappers around `prism` CLI commands. The key difference:

- **MCP tools**: Agent-only, structured output, tool approval UI
- **Prism CLI**: Available everywhere (agents, scripts, terminal), raw output

Operations NOT covered by MCP tools (use Prism CLI or `graphql.ts` instead):
- Customer CRUD
- Instance management (create, deploy, configure)
- Execution log queries
- Scoped config variable management
- Connection credential updates

## Prism CLI (Priority 2)

### Built-in Commands

For standard operations, use Prism CLI commands through `prism-retry.ts`:

```typescript
import { runPrismQuery, runPrismMutation } from "./shared/prism-retry.js";

// List operations (read)
const result = runPrismQuery(
    ["prism", "integrations:list", "--extended", "--output", "json"],
    { timeout: 30000 },
);

// Mutation operations (write)
const result = runPrismMutation(
    ["prism", "integrations:import"],
    { cwd: projectDir, timeout: 60000 },
);
```

**CLI flag rules**:
- Always use `--extended --output json` for list commands
- `--extended` and `--columns` are mutually exclusive — prefer `--extended`
- Never use `npx prism` — `prism` must be installed globally

### Custom GraphQL via `shared/graphql.ts`

For operations that need GraphQL queries (customer management, instance config, execution logs):

```typescript
import { graphql, ensureAuthenticated, GraphQLError } from "./shared/graphql.js";

// Pre-flight auth check
ensureAuthenticated();

// Simple query
const data = graphql('query { customers { nodes { id name externalId } } }');

// Query with variables
const data = graphql(
    'query($customerId: ID!) { instances(customer: $customerId) { nodes { id name } } }',
    { customerId: "Q3VzdG9tZXI6..." },
);

// Mutation with variables
const data = graphql(
    `mutation($name: String!, $externalId: String!) {
        createCustomer(input: { name: $name, externalId: $externalId }) {
            customer { id name }
            errors { field messages }
        }
    }`,
    { name: "Acme Corp", externalId: "acme-001" },
    60000,
);
```

### Direct CLI GraphQL

When you need a one-off query from an agent conversation without a script:

```bash
# Simple query
prism graphql:query 'query { authenticatedUser { email } }'

# With variables
prism graphql:query \
  'query($id: ID!) { customer(id: $id) { name externalId } }' \
  --variables '{"id": "Q3VzdG9tZXI6..."}'
```

## Operations Coverage Matrix

| Operation | MCP Tool | CLI Command | graphql.ts |
|-----------|----------|-------------|------------|
| List components | `prism_components_list` | `prism components:list` | - |
| Search components | `prism_components_list` | - | `prismatic-tools find-components` |
| Publish component | `prism_components_publish` | `prism components:publish` | - |
| List integrations | `prism_integrations_list` | `prism integrations:list` | - |
| Import integration | `prism_integrations_import` | `prism integrations:import` | - |
| Test flow | `prism_integrations_flows_test` | `prism integrations:flows:test` | - |
| List customers | - | - | `graphql()` |
| Create customer | - | - | `graphql()` |
| Deploy instance | - | - | `graphql()` |
| Update config vars | - | - | `graphql()` |
| Query executions | - | - | `graphql()` |
| Query logs | - | - | `graphql()` |
| Manage connections | - | - | `graphql()` |

## Architecture Rationale

API access uses a two-tier system:
1. **MCP tools** — for agent conversations.
2. **Prism CLI** — for scripts and agents, with `shared/graphql.ts` as a thin wrapper around `prism graphql:query`.

`prism graphql:query` handles authentication natively (including token refresh) and supports arbitrary queries with `--variables`, so `shared/graphql.ts` delegates auth to the Prism CLI rather than maintaining a custom token-exchange client.

**Rule:** Use `shared/graphql.ts` imports for custom queries — never inline GraphQL clients or custom token exchange in individual scripts.
