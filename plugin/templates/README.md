# Code Generation Templates

Structural templates for Prismatic component and integration code generation. These define the required file structure with typed slots for the agent to fill.

## How Templates Work

Each `.template` file contains the structural boilerplate for a source file with **slots** marked by `{{SLOT_NAME}}` syntax. The agent reads the template, fills the slots with values from requirements, and writes the resulting TypeScript file.

Templates guarantee:
- Correct import structure
- Required wrapper functions (configVar, connectionConfigVar, etc.)
- Proper lifecycle hooks (onInstanceDeploy/onInstanceDelete)
- Correct export patterns

## Template Syntax

- `{{SLOT_NAME}}` — Required slot, agent must fill
- `{{SLOT_NAME:default}}` — Slot with default value
- `{{#if CONDITION}}...{{/if}}` — Conditional block
- `{{#each ARRAY}}...{{/each}}` — Repeated block

Templates are NOT processed by a template engine — they are **reference patterns** for the agent. The agent reads the template to understand the expected structure and writes the actual TypeScript file following the pattern.

## Integration Templates

| Template | Purpose |
|----------|---------|
| `integration/index.ts.template` | Integration entry point with metadata |
| `integration/componentRegistry.ts.template` | Component manifest registration |
| `integration/configPages.ts.template` | Config wizard with wrapper functions |
| `integration/flows.ts.template` | Flow logic with trigger + execution |

## Component Templates

| Template | Purpose |
|----------|---------|
| `component/index.ts.template` | Component entry point with exports |
| `component/actions.ts.template` | Action definitions with typed inputs |
| `component/connections.ts.template` | Connection definitions (OAuth2/API Key/Bearer) |
| `component/client.ts.template` | HTTP client helper |
| `component/triggers.ts.template` | Webhook triggers with lifecycle hooks |
