# Prismatic Skills

Claude Code plugin for building Prismatic custom components and Code Native Integrations through conversation.

## Prerequisites

- **Prism CLI**: Install via `npm install -g @prismatic-io/prism`
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

## Agents

| Agent | Description |
|-------|-------------|
| `component-builder` | Builds custom components from requirements to deployment |
| `cni-builder` | Builds Code Native Integrations from requirements to deployment |
| `external-api-researcher` | Researches external APIs for component generation |

## Repository Structure

```
prismatic-skills/
├── .claude-plugin/
│   ├── plugin.json                # Plugin manifest
│   └── marketplace.json           # Marketplace catalog
├── commands/
│   ├── build-component.md         # /prismatic-skills:build-component
│   └── build-integration.md       # /prismatic-skills:build-integration
├── agents/
│   ├── component-builder.md
│   ├── cni-builder.md
│   └── external-api-researcher.md
├── skills/
│   ├── component-patterns/        # Component reference docs
│   └── integration-patterns/      # CNI reference docs
├── scripts/                       # Python workflow scripts
└── README.md
```

## License

MIT
