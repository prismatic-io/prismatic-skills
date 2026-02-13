# Prismatic Skills

Claude Code plugin for building and managing Prismatic integrations through conversation. Build custom components, generate Code Native Integrations, explore your Prismatic environment, and operate the platform — all from your editor.

## Prerequisites

- **Prism CLI**: Install via `npm install -g @prismatic-io/prism` (also provides the bundled MCP server)
- **Prismatic Account**: Active account with integration/component permissions
- **Python 3**: Required for workflow scripts
- **Claude Code**: CLI or extension with plugin support

## Installation

Add the marketplace and install the plugin in Claude Code:

```bash
/plugin marketplace add prismatic-io/prismatic-skills
/plugin install prismatic-skills@prismatic-skills
```

### Development / Testing

For local development, load the plugin directly:

```bash
claude --plugin-dir /path/to/prismatic-skills
```

## Available Commands

### `/prismatic-skills:build-component`

Build and deploy a Prismatic custom component.

```
/prismatic-skills:build-component Canny API connector
```

Workflow:
1. **Setup** - Verify Prism CLI and authentication
2. **Requirements** - Interactive questionnaire (component type, API details)
3. **API Research** - For connectors, research the external API
4. **Scaffold** - Generate component structure via Prism CLI
5. **Code Generation** - Implement actions, triggers, connections
6. **Build & Publish** - Compile and deploy to Prismatic

### `/prismatic-skills:build-integration`

Build and deploy a Prismatic Code Native Integration (CNI).

```
/prismatic-skills:build-integration Salesforce to Slack sync
```

Workflow:
1. **Setup** - Verify Prism CLI and authentication
2. **Requirements** - Interactive questionnaire (systems, triggers, data flow)
3. **Credential Collection** - Gather OAuth/API credentials if needed
4. **Scaffold** - Generate project structure with component manifests
5. **Code Generation** - Create TypeScript files (flows, config pages, etc.)
6. **Build, Deploy & Test** - Compile, deploy, and test flows
7. **Iterate** - Fix issues, rebuild, redeploy

### `/prismatic-skills:orby`

Ask Orby, the Prismatic platform guide, about your environment or have it perform platform operations.

```
/prismatic-skills:orby What integrations do I have?
/prismatic-skills:orby Deploy the Slack integration to Acme Corp
/prismatic-skills:orby How do I query execution logs in GraphQL?
/prismatic-skills:orby Show me the last 10 failed executions
```

Capabilities:

- **Environment exploration** - List components, integrations, instances, customers, and executions
- **Platform operations** - Deploy integrations, manage instances, create customers
- **GraphQL query construction** - Build and execute queries against the Prismatic API
- **Documentation search** - Search and retrieve content from prismatic.io/docs
- **Workflow orchestration** - Multi-step operations like end-to-end deployment
- **Troubleshooting** - Investigate failed executions, check logs, diagnose issues

## Agents

| Agent | Description |
| ----- | ----------- |
| `component-builder` | Builds custom components from requirements to deployment. Uses a DAG-driven questionnaire, optional API research, and per-phase scripts for scaffolding, building, and publishing. |
| `cni-builder` | Builds Code Native Integrations from requirements to deployment. Manages component manifests, OAuth configuration, TypeScript generation, deploy, and test cycles. |
| `external-api-researcher` | Researches external APIs by fetching and analyzing documentation. Extracts authentication methods, endpoints, data models, and webhook capabilities into a structured JSON spec. Only spawned when the requirements DAG determines research is needed. |
| `orby` | Interactive Prismatic platform guide. Explores your environment, executes platform operations, constructs GraphQL queries, searches documentation, and orchestrates multi-step workflows. |

## Skills

The plugin includes four knowledge bases that agents draw on:

| Skill | Purpose |
| ----- | ------- |
| `component-patterns` | Reference docs, code generation patterns, and complete examples (utility, API key connector, OAuth2 connector) for building custom components |
| `integration-patterns` | Reference docs, CNI pattern library (webhooks, state persistence, error handling, OAuth, multi-flow, etc.), and code generation guide for Code Native Integrations |
| `prismatic-api` | GraphQL query reference, API access hierarchy (MCP tools / Prism CLI), query patterns for customers, instances, executions, logs, components, and integrations |
| `prismatic-docs` | Documentation search strategies for prismatic.io/docs and example code navigation from the Prismatic examples repo |

## Scripts

Builder agents are driven by Python scripts in `scripts/` that handle every phase of the workflow. Agents call these scripts rather than performing platform operations directly.

**Workflow scripts** (root level):

- `prerequisites.py` - Verify Prism CLI, authentication, and create a session directory
- `gather_requirements.py` - DAG-based interactive questionnaire that walks through requirements in dependency order, skipping irrelevant questions automatically
- `write_answer.py` - Write an answer to the requirements file for programmatic use

**Component scripts** (`scripts/components/`):

- `scaffold_component.py` - Create component project structure via Prism CLI
- `build_component.py` - Compile TypeScript with webpack
- `publish_component.py` - Deploy component to Prismatic
- `validate_component.py` - Validate the published component

**Integration scripts** (`scripts/integrations/`):

- `scaffold_project.py` - Create CNI project with component manifests
- `search_components.py` - Find available Prismatic components
- `extract_connections.py` - Extract connection options from components
- `get_credential_prompts.py` - Get credential fields for a connection
- `build_integration.py` - Compile TypeScript
- `deploy_integration.py` - Deploy to Prismatic
- `test_integration.py` - Test flow execution
- `install_dependencies.py` - Install npm packages
- `validate_typescript.py` - TypeScript validation
- `troubleshoot.py` - Quick diagnostics
- `package_for_download.py` - Create downloadable package

**Shared utilities** (`scripts/shared/`):

- `graphql.py` - GraphQL query execution via Prism CLI
- `prism_retry.py` - CLI command retry logic
- `project_directory.py` - Session directory management
- `search_connections.py` - Find integration-agnostic connections
- `check_prism_access.py` - Verify Prism CLI authentication
- `timing.py` - Performance timing utilities

## Repository Structure

```
prismatic-skills/
├── .claude-plugin/
│   ├── plugin.json                  # Plugin manifest
│   └── marketplace.json             # Marketplace catalog
├── .mcp.json                        # Bundled Prism MCP server config
├── commands/
│   ├── build-component.md           # /prismatic-skills:build-component
│   ├── build-integration.md         # /prismatic-skills:build-integration
│   └── orby.md                      # /prismatic-skills:orby
├── agents/
│   ├── component-builder.md
│   ├── cni-builder.md
│   ├── external-api-researcher.md
│   └── orby.md
├── skills/
│   ├── component-patterns/          # Component reference docs & examples
│   ├── integration-patterns/        # CNI reference docs & pattern library
│   ├── prismatic-api/               # GraphQL & API reference
│   └── prismatic-docs/              # Documentation search reference
├── scripts/
│   ├── prerequisites.py             # Environment setup
│   ├── gather_requirements.py       # DAG-based questionnaire
│   ├── write_answer.py              # Programmatic answer writing
│   ├── components/                  # Component lifecycle scripts
│   ├── integrations/                # Integration lifecycle scripts
│   ├── shared/                      # Shared utilities
│   └── questions/
│       ├── component.json           # Component questionnaire DAG
│       └── integration.json         # Integration questionnaire DAG
└── README.md
```

## License

MIT
