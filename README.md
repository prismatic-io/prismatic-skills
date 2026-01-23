# Prismatic Skills

Claude Code skills and agents for building Prismatic integrations and custom components through conversation.

## Contents

| Type | Name | Description |
|------|------|-------------|
| Skill | `building-prismatic-integrations` | Build and deploy Prismatic Code Native Integrations, Automations, and Workflows. Handles TypeScript generation, component discovery, OAuth, deployment, testing, and iteration through a 7-phase workflow. |
| Skill | `building-prismatic-components` | Build and deploy Prismatic custom components. Handles utility components and application connectors with API research, OAuth2 authentication, TypeScript generation, and deployment through a 6-phase workflow. |
| Agent | `external-api-researcher` | Research external APIs to gather authentication methods, endpoints, data models, and webhook capabilities needed for component generation. |

## Prerequisites

- **Prism CLI**: Install via `npm install -g @prismatic-io/prism`
- **Prismatic Account**: Active account with integration/component permissions
- **Python 3**: Required for workflow scripts
- **Claude Code**: CLI or extension with skill support

## Installation

### Option 1: Project Skills (Symlinks)

Clone this repository and create symlinks to register skills for a specific project:

```bash
# Clone the repository
git clone https://github.com/prismatic-io/prismatic-skills.git

# In your project directory, create symlinks
mkdir -p .claude/skills .claude/agents
ln -s /path/to/prismatic-skills/skills/building-prismatic-integrations .claude/skills/
ln -s /path/to/prismatic-skills/skills/building-prismatic-components .claude/skills/
ln -s /path/to/prismatic-skills/agents/external-api-researcher.md .claude/agents/
```

### Option 2: Personal Skills

Copy skills to your personal Claude directory for global access:

```bash
# Copy skills to personal directory
cp -r skills/building-prismatic-integrations ~/.claude/skills/
cp -r skills/building-prismatic-components ~/.claude/skills/
cp agents/external-api-researcher.md ~/.claude/agents/
```

### Option 3: ZIP Installation

Download pre-built packages from the `dist/` directory or build them yourself:

```bash
# Build distribution packages
./scripts/build-dist.sh

# Install a skill from ZIP (extract to ~/.claude/skills/)
unzip dist/building-prismatic-integrations.zip -d ~/.claude/skills/
```

## Usage

### Building Integrations

Start a conversation with Claude and invoke the skill:

```
User: /building-prismatic-integrations
User: Build an integration that syncs Salesforce contacts to HubSpot
```

The skill guides you through:
1. **Setup** - Verify Prism CLI and create session directory
2. **Requirements** - Interactive questionnaire to capture needs
3. **Scaffold** - Generate project structure with component manifests
4. **Code Generation** - Create TypeScript files (flows, config pages, etc.)
5. **Build/Deploy/Test** - Compile, deploy to Prismatic, and test
6. **Iterate** - Fix issues and refine
7. **Deliver** - Package for distribution

### Building Components

```
User: /building-prismatic-components
User: Build a custom component for the Canny API
```

The skill guides you through:
1. **Setup** - Verify Prism CLI and create session directory
2. **Requirements** - Determine component type (utility vs connector)
3. **API Research** - For connectors, spawn agent to research the API
4. **Scaffold** - Generate component structure
5. **Code Generation** - Implement actions, triggers, connections
6. **Build/Publish/Test** - Compile and deploy to Prismatic
7. **Iterate** - Fix issues and refine

### Researching APIs

The `external-api-researcher` agent is automatically invoked when building connectors, but can also be used directly:

```
User: Research the Stripe API for building a Prismatic component
```

## Distribution

Build ZIP packages for distribution:

```bash
# Build all distribution packages
./scripts/build-dist.sh

# Output in dist/
# ├── building-prismatic-integrations.zip
# ├── building-prismatic-components.zip
# ├── external-api-researcher.zip
# └── prismatic-skills-all.zip
```

Each skill ZIP contains the skill folder at the root level, following Anthropic's packaging guidelines.

## Repository Structure

```
prismatic-skills/
├── skills/
│   ├── building-prismatic-integrations/
│   │   ├── SKILL.md              # Skill definition and workflow
│   │   ├── references/           # Documentation and patterns
│   │   └── scripts/              # Python workflow scripts
│   └── building-prismatic-components/
│       ├── SKILL.md              # Skill definition and workflow
│       ├── references/           # Documentation and examples
│       └── scripts/              # Python workflow scripts
├── agents/
│   └── external-api-researcher.md  # Agent definition
├── .claude/
│   ├── skills/                   # Symlinks to skills/
│   └── agents/                   # Symlinks to agents/
├── scripts/
│   └── build-dist.sh             # Distribution build script
└── README.md
```

## License

MIT
