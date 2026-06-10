# Prismatic Skills

Claude Code plugin for building and managing [Prismatic](https://www.prismatic.io) integrations through conversation. Build custom components, generate Code Native Integrations, migrate integrations from other platforms, embed Prismatic in your app, explore your environment, and operate the platform — all from your editor.

## Prerequisites

- **Prism CLI**: Install via `npm install -g @prismatic-io/prism` (also provides the bundled MCP server)
- **Prismatic Account**: Active account with integration/component permissions
- **Node.js 18+**: Required for workflow scripts (run via `tsx`)
- **Claude Code**: CLI or extension with plugin support

## Installation

Add the marketplace and install the plugin in Claude Code:

```bash
/plugin marketplace add prismatic-io/prismatic-skills
/plugin install prismatic-skills@prismatic-skills
/reload-plugins
```

### Development / Testing

For local development, load the plugin directly:

```bash
export PRISMATIC_MARKETPLACE_CHECKOUT=/path/to/prismatic-skills
claude --plugin-dir ${PRISMATIC_MARKETPLACE_CHECKOUT}/plugin
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

### `/prismatic-skills:modify-integration`

Modify an existing Prismatic Code Native Integration.

```
/prismatic-skills:modify-integration Add error retry logic to the Salesforce sync
```

Workflow:

1. **Setup** - Create session and extract current integration state
2. **Requirements** - Gather modification details via questionnaire
3. **Code Changes** - Update TypeScript files following existing patterns
4. **Build, Deploy & Test** - Compile, deploy, and verify changes

### `/prismatic-skills:migrate-integration`

Migrate an integration from another platform (like Boomi or Cyclr) to a Prismatic Code Native Integration.

```
/prismatic-skills:migrate-integration ./exports/my-boomi-process
```

Workflow:

1. **Detect Platform** - Identify the source platform from export files
2. **Parse Export** - Extract processes, connectors, and data mappings
3. **Generate Schema** - Produce a standardized integration schema
4. **Map to Requirements** - Convert schema to Prismatic build requirements
5. **Build** - Hand off to the standard CNI build pipeline

Supported platforms: Boomi, Cyclr

### `/prismatic-skills:embedded`

Set up Prismatic embedding — marketplace, workflow builder, or custom UI — in your web application.

```
/prismatic-skills:embedded Add the integration marketplace to our Next.js app
/prismatic-skills:embedded Set up JWT signing for embedded Prismatic
```

Workflow:

1. **Stack Discovery** - Identify your framework and backend language
2. **Signing Keys** - Configure JWT signing key setup
3. **Backend** - Generate JWT token endpoint
4. **Frontend** - Integrate the embedded SDK with your framework

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

### `/prismatic-skills:version`

Check which plugin version is loaded and whether the session is stale.

## Agents

| Agent                     | Description                                                                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `component-builder`       | Builds custom components from requirements to deployment. Handles scaffolding, code generation, building, and publishing.                                                                                               |
| `cni-builder`             | Builds Code Native Integrations from requirements to deployment. Manages component manifests, OAuth configuration, TypeScript generation, deploy, and test cycles. Also handles modifications to existing integrations. |
| `external-api-researcher` | Researches external APIs by fetching and analyzing documentation. Extracts authentication methods, endpoints, data models, and webhook capabilities into a structured JSON spec.                                        |
| `embedded-advisor`        | Guides developers through embedding Prismatic's marketplace and workflow builder in their web application. Handles signing key setup, JWT backend generation, frontend SDK integration, theming, and i18n.              |
| `migration-analyzer`      | Parses integration exports from other platforms (Boomi, Cyclr) and produces a standardized integration schema for migration to Prismatic.                                                                               |
| `migration-reviewer`      | Reviews and validates migration analysis output before handing off to the CNI build pipeline.                                                                                                                           |
| `orby`                    | Interactive Prismatic platform guide. Explores your environment, executes platform operations, constructs GraphQL queries, searches documentation, and orchestrates multi-step workflows.                               |

## Skills

The plugin includes eight knowledge bases that agents draw on:

| Skill                  | Purpose                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `component-patterns`   | Reference docs, code generation patterns, and complete examples (utility, API key connector, OAuth2 connector) for building custom components                         |
| `integration-patterns` | Reference docs, CNI pattern library (webhooks, state persistence, error handling, OAuth, multi-flow, etc.), and code generation guide for Code Native Integrations    |
| `prismatic-api`        | GraphQL query reference, API access hierarchy (MCP tools / Prism CLI), query patterns for customers, instances, executions, logs, components, and integrations        |
| `prismatic-docs`       | Documentation search strategies for prismatic.io/docs and example code navigation from the Prismatic examples repo                                                    |
| `embedded`             | Reference documentation for embedding Prismatic's integration marketplace and workflow builder in a web application, including JWT auth, SDK setup, theming, and i18n |
| `migration-framework`  | Standardized integration schema, schema-to-requirements mapping, and migration code generation guide                                                                  |
| `boomi-migration`      | Boomi concept mapping and export parsing reference for migrating Boomi processes to Prismatic                                                                         |
| `cyclr-migration`      | Cyclr concept mapping and export parsing reference for migrating Cyclr workflows to Prismatic                                                                         |

## Scripts

Builder agents are driven by TypeScript scripts in `scripts/` that handle every phase of the workflow. Agents call these scripts via `npx tsx` rather than performing platform operations directly.

**Workflow scripts** (root level):

- `prerequisites.ts` - Verify Prism CLI, authentication, and create a session directory
- `validate-requirements.ts` - Validate that all required questions have been answered
- `write-answer.ts` - Write an answer to the requirements file for programmatic use
- `run.ts` - Dispatcher for running scripts by name

**Component scripts** (`scripts/components/`):

- `scaffold-component.ts` - Create component project structure via Prism CLI
- `build-component.ts` - Compile TypeScript with webpack
- `publish-component.ts` - Deploy component to Prismatic
- `validate-component.ts` - Validate the published component
- `create-organization-connection.ts` - Create a reusable connection in the Prismatic org

**Integration scripts** (`scripts/integrations/`):

- `scaffold-project.ts` - Create CNI project with component manifests
- `find-components.ts` - Find available Prismatic components
- `extract-connections.ts` - Extract connection options from components
- `get-credentials.ts` - Get credential fields for a connection
- `build-integration.ts` - Compile TypeScript
- `deploy-integration.ts` - Deploy to Prismatic
- `test-integration.ts` - Test flow execution
- `install-dependencies.ts` - Install npm packages
- `validate-typescript.ts` - TypeScript validation
- `troubleshoot.ts` - Quick diagnostics
- `package-for-download.ts` - Create downloadable package
- `extract-state.ts` - Read an existing integration's configuration
- `locate-project.ts` - Find where an integration project lives on disk
- `record-choices.ts` - Record design decisions for a session
- `update-tasks.ts` - Track answered questions and next steps
- `verify-code.ts` - Check that code matches requirements
- `search-connections.ts` - Find integration-agnostic connections

**Migration scripts** (`scripts/migration/`):

- `detect-platform.ts` - Identify the source platform from export files
- `parse-export.ts` - Parse integration exports (delegates to platform-specific parsers)
- `parse-boomi-export.ts` - Parse Boomi process exports
- `parse-cyclr-export.ts` - Parse Cyclr workflow exports
- `generate-mermaid-diagrams.ts` - Generate flow diagrams from parsed exports
- `schema-to-answers.ts` - Convert standardized schema to Prismatic build requirements

**Shared utilities** (`scripts/shared/`):

- `graphql.ts` - GraphQL query execution via Prism CLI
- `prism-retry.ts` - CLI command retry logic
- `project-directory.ts` - Session directory management
- `check-prism-access.ts` - Verify Prism CLI authentication
- `timing.ts` - Performance timing utilities
- `code-plan.ts` - Generate code-gen plans from requirements
- `diagnose-build.ts` - Diagnose build failures and suggest fixes
- `install-manifest.ts` - Install a component manifest into a CNI project
- `load-spec.ts` - Load YAML question specs
- `parse-yaml.ts` - YAML parsing utilities
- `validate-phase.ts` - Verify project readiness for each workflow phase

## Hooks

The plugin registers Claude Code hooks for enforcing workflow rules:

- `pretooluse-dispatch.mjs` - Dispatches pre-tool-use checks based on the tool manifest
- `check-destructive.mjs` - Pauses before destructive operations for agent confirmation
- `session-start-discovery.mjs` - Captures plugin version at session start

## Templates

Code generation templates in `templates/` define the required file structure for generated components and integrations. Each `.template` file contains structural boilerplate with typed slots (`{{SLOT_NAME}}`) that the agent fills from requirements.

- **Component templates**: `index.ts`, `actions.ts`, `connections.ts`, `client.ts`, `triggers.ts`, `inputs.ts`, `rawRequest.ts`
- **Integration templates**: `index.ts`, `componentRegistry.ts`, `configPages.ts`, `flows.ts`, `flows-index.ts`

## Repository Structure

```
prismatic-skills/
├── .claude-plugin/
│   ├── plugin.json                  # Plugin manifest
│   └── marketplace.json             # Marketplace catalog
├── .mcp.json                        # Bundled Prism MCP server config
├── CLAUDE.md                        # Agent orchestration instructions
├── commands/
│   ├── build-component.md           # /prismatic-skills:build-component
│   ├── build-integration.md         # /prismatic-skills:build-integration
│   ├── modify-integration.md        # /prismatic-skills:modify-integration
│   ├── migrate-integration.md       # /prismatic-skills:migrate-integration
│   ├── embedded.md                  # /prismatic-skills:embedded
│   ├── orby.md                      # /prismatic-skills:orby
│   └── version.md                   # /prismatic-skills:version
├── agents/
│   ├── component-builder.md
│   ├── cni-builder.md
│   ├── external-api-researcher.md
│   ├── embedded-advisor.md
│   ├── migration-analyzer.md
│   ├── migration-reviewer.md
│   └── orby.md
├── skills/
│   ├── component-patterns/          # Component reference docs & examples
│   ├── integration-patterns/        # CNI reference docs & pattern library
│   ├── prismatic-api/               # GraphQL & API reference
│   ├── prismatic-docs/              # Documentation search reference
│   ├── embedded-patterns/           # Embedded marketplace & workflow builder
│   ├── migration-framework/         # Standardized migration schema & mapping
│   ├── boomi-migration/             # Boomi-specific parsing & concept mapping
│   └── cyclr-migration/             # Cyclr-specific parsing & concept mapping
├── hooks/
│   ├── hooks.json                   # Hook registration
│   ├── pretooluse-dispatch.mjs      # Pre-tool-use check dispatcher
│   ├── check-destructive.mjs        # Destructive operation guard
│   ├── session-start-discovery.mjs  # Plugin version capture
│   └── tool-manifest.json           # Tool dispatch rules
├── templates/
│   ├── component/                   # Component code generation templates
│   └── integration/                 # Integration code generation templates
├── scripts/
│   ├── prerequisites.ts             # Environment setup
│   ├── validate-requirements.ts     # Requirements validation
│   ├── write-answer.ts              # Programmatic answer writing
│   ├── run.ts                       # Script dispatcher
│   ├── components/                  # Component lifecycle scripts
│   ├── integrations/                # Integration lifecycle scripts
│   ├── migration/                   # Platform migration scripts
│   ├── shared/                      # Shared utilities
│   └── questions/
│       ├── component.yaml           # Component questionnaire spec
│       ├── integration.yaml         # Integration questionnaire spec
│       ├── modify-integration.yaml  # Modification questionnaire spec
│       ├── component/               # Component question groups
│       └── integration/             # Integration question groups
└── README.md
```

## License

MIT
