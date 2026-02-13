# API Access Methods

Detailed reference for the two-tier Prismatic API access hierarchy.

## MCP Tools (Priority 1)

MCP tools are available **only in agent conversations** (not in Python scripts). They handle authentication, retries, and output formatting automatically.

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

Operations NOT covered by MCP tools (use Prism CLI or `graphql.py` instead):
- Customer CRUD
- Instance management (create, deploy, configure)
- Execution log queries
- Scoped config variable management
- Connection credential updates

## Prism CLI (Priority 2)

### Built-in Commands

For standard operations, use Prism CLI commands through `prism_retry.py`:

```python
from prism_retry import run_prism_query, run_prism_mutation

# List operations (read)
result = run_prism_query(
    ["prism", "integrations:list", "--extended", "--output", "json"],
    timeout=30,
)

# Mutation operations (write)
result = run_prism_mutation(
    ["prism", "integrations:import"],
    cwd=project_dir,
    timeout=60,
)
```

**CLI flag rules**:
- Always use `--extended --output json` for list commands
- `--extended` and `--columns` are mutually exclusive — prefer `--extended`
- Never use `npx prism` — `prism` must be installed globally

### Custom GraphQL via `shared/graphql.py`

For operations that need GraphQL queries (customer management, instance config, execution logs):

```python
from shared.graphql import graphql, ensure_authenticated, GraphQLError

# Pre-flight auth check
ensure_authenticated()

# Simple query
data = graphql('query { customers { nodes { id name externalId } } }')

# Query with variables
data = graphql(
    'query($customerId: ID!) { instances(customer: $customerId) { nodes { id name } } }',
    variables={"customerId": "Q3VzdG9tZXI6..."},
)

# Mutation with variables
data = graphql(
    '''mutation($name: String!, $externalId: String!) {
        createCustomer(input: { name: $name, externalId: $externalId }) {
            customer { id name }
            errors { field messages }
        }
    }''',
    variables={"name": "Acme Corp", "externalId": "acme-001"},
    timeout=60,
)
```

### Direct CLI GraphQL

When you need a one-off query from an agent conversation without a Python script:

```bash
# Simple query
prism graphql:query 'query { authenticatedUser { email } }'

# With variables
prism graphql:query \
  'query($id: ID!) { customer(id: $id) { name externalId } }' \
  --variables '{"id": "Q3VzdG9tZXI6..."}'
```

## Operations Coverage Matrix

| Operation | MCP Tool | CLI Command | graphql.py |
|-----------|----------|-------------|------------|
| List components | `prism_components_list` | `prism components:list` | - |
| Search components | `prism_components_list` | - | `search_components.py` |
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

## Migration Notes

### What Changed

The previous codebase had 4 inconsistent API access patterns:
1. MCP tools (agent conversations)
2. Prism CLI wrappers (via `prism_retry.py`)
3. Python GraphQL client (`prismatic_api.py` with custom Auth0 token exchange)
4. Inline GraphQL in `create_organization_connection.py`

These were consolidated to a two-tier system:
1. **MCP tools** (agent conversations — unchanged)
2. **Prism CLI** (scripts + agents), with `shared/graphql.py` as a thin wrapper around `prism graphql:query`

### What Was Removed

- `prismatic_api.py` — Custom Auth0 token exchange + HTTP client (~400 lines). Replaced by `graphql.py` (~80 lines) which delegates auth to Prism CLI.
- `prism_auth.py` — Credential extraction utilities (~160 lines). No longer needed since `prism` commands handle auth natively.
- Inline `get_prism_credentials()` and `graphql_request()` in `create_organization_connection.py` — Replaced by `shared/graphql.py` imports.

### Why

`prism graphql:query` handles authentication natively (including token refresh) and supports arbitrary queries with `--variables`. This eliminates the need for a custom Python GraphQL client and its Auth0 integration layer.
