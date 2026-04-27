# Tool Catalog — Integration Builder

Load this reference at the start of any session. It lists every tool available to the cni-builder agent.

## Synthetic tools (auto-dispatched, no permission prompt)

Call these as Bash commands with the `prismatic-tools` prefix:

```
# Component & connection lookup:
prismatic-tools find-components <keyword>
prismatic-tools search-connections [keyword]
prismatic-tools get-credentials <component_key> '<connection_json>'

# Diagnostics:
prismatic-tools check-prism-access
prismatic-tools validate-phase <dir> --phase <scaffold|code-gen|build|deploy> --type <integration|component>
prismatic-tools diagnose-build <project-dir> --type <integration|component>
prismatic-tools validate-typescript <integration-dir>
prismatic-tools troubleshoot [project-dir]

# State:
prismatic-tools locate-project <path-or-name>
prismatic-tools extract-state <project-dir>

# Requirements analysis:
prismatic-tools update-tasks --session <name> --actionable [--mode build|modify] [--extracted-state <state.json>] [--scope "<scopes>"]
prismatic-tools verify-code <project-dir> --session <name>
prismatic-tools validate-requirements --session <name>
prismatic-tools record-choices --session <name> key=value [key2=value2] [--flow <flow-id>]
prismatic-tools write-answer --session <name> <question_id> <value>
prismatic-tools code-plan --session <name> --type <component|integration>
prismatic-tools install-manifest <component-key> [--project-dir <dir>]
npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/run.ts deploy-integration <project-dir>
prismatic-tools test-integration <integration-id> [--integration-dir <dir>] [--flow <flow-name>]
```

## Explicit scripts (require confirmation or visibility)

Invoke with: `npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/run.ts <script-name> [args...]`

```
# Setup & requirements:
run.ts prerequisites <name> --type integration [--existing <dir>]

# Build lifecycle:
run.ts scaffold-project <name> --components <comp1,comp2> [--private-components <comp1>] [--credentials '<json>']
npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/run.ts deploy-integration <project-dir>
run.ts test-integration <integration-id> [--integration-dir <project-dir>]

# Component development:
run.ts scaffold-component <name>
run.ts build-component <project-dir>
run.ts publish-component <project-dir>
run.ts validate-component <project-dir>
run.ts create-organization-connection <component-key> <connection-key> <name>
run.ts package-for-download <project-dir> [version]

# List all available scripts:
run.ts --list
```

## MCP Tools

| Tool | Phase | Purpose |
|------|-------|---------|
| `prism_me` | 1 | Verify authentication and org access |
| `prism_integrations_flows_list` | 7 | List flows for testing (`integrationId` param) |
| `prism_integrations_flows_test` | 7 | Run flow test (`integrationId`, optional `flowName`, `filepathToTestPayload`, `payloadContentType` params) |

These three are the only MCP tools you should use. All other MCP tools return incomplete data.

## CLI Commands

| Command | Phase | Purpose |
|---------|-------|---------|
| `npm run build --prefix <project-dir>` | 6 | Compile TypeScript (webpack) |
| `npm install --prefix <project-dir>` | 4 | Install dependencies (if needed separately) |
