# Tool Catalog — Component Builder

Load this reference at the start of any session. It lists every tool available to the component-builder agent.

## Synthetic tools (auto-dispatched, no permission prompt)

Call these as Bash commands with the `prismatic-tools` prefix:

```
# Diagnostics:
prismatic-tools check-prism-access
prismatic-tools validate-phase <dir> --phase <scaffold|code-gen|build> --type component
prismatic-tools diagnose-build <project-dir> --type component

# Requirements analysis:
prismatic-tools update-tasks --session <name> --type component --actionable
prismatic-tools validate-requirements --session <name> --type component
prismatic-tools record-choices --session <name> --type component key=value [key2=value2]
prismatic-tools write-answer --session <name> --type component <question_id> <value>
prismatic-tools code-plan --session <name> --type component
```

## Explicit scripts (require confirmation or visibility)

Invoke with: `npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/run.ts <script-name> [args...]`

```
# Setup & requirements:
run.ts prerequisites <name> --type component

# Component development:
run.ts scaffold-component <name>
run.ts build-component <project-dir>
run.ts publish-component <project-dir>
run.ts validate-component <project-dir>

# List all available scripts:
run.ts --list
```

## CLI Commands

| Command | Phase | Purpose |
|---------|-------|---------|
| `npm run build --prefix <project-dir>` | 5 | Compile TypeScript (webpack) |
| `npm install --prefix <project-dir>` | 4 | Install dependencies (if needed separately) |

## Important: Tools NOT used for component building

- `prismatic-tools find-components` — searches the integration component registry. Components are what you're building, not consuming.
- `prismatic-tools search-connections` — components define connections, they don't consume existing ones.
- Do not use MCP tools for component operations. MCP component tools return incomplete data.
