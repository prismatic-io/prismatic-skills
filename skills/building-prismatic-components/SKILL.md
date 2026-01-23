---
name: building-prismatic-components
description: Build and deploy Prismatic custom components through conversation. Handles utility components and application connectors with API research, OAuth2 authentication, TypeScript generation, and deployment.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, WebFetch, WebSearch
---

# Prismatic Component Builder

Build Prismatic custom components through conversation - from requirements to deployment.

## Agent Quick Reference Card

**Your first response to user:** "Let me set up prerequisites" → Run `scripts/setup_prerequisites.py`

**Every component workflow:**

1. Phase 1: Setup (once per session) → `setup_prerequisites.py <name>`
2. Phase 2: Requirements → `gather_requirements.py` **(exit 42 = STOP and ask user)**
3. Phase 3: Scaffold → `scaffold_component.py <name>` (uses prism CLI)
4. Phase 4: Generate code → For utilities, remove unused files first; then implement
5. Phase 5: Build → Publish → Test
6. Phase 6: Iterate (fix issues, rebuild, retest)

**Component types:**
- **Utility**: Actions only, no external API connection (remove connector files in Phase 4)
- **Connector**: Full component with client, auth, triggers, dataSources

**Authentication emphasis:** For connectors, always check if OAuth2 is supported. See `references/oauth2-connection-guide.md`

**When stuck:** `references/troubleshooting-errors.md`

---

## Quick Start

**You are the component builder.** The user describes what they want, you build it.

### Prerequisites Check

Before starting ANY component work:

1. **First time in session:** Run Phase 1 Setup (see below)
2. **Prism CLI:** User must have Prism CLI installed and be logged in
3. **Prismatic account:** User needs active account with component permissions

## Core Workflow

```text
Phase 1: Setup ─→ Phase 2: Requirements ─┬─→ [Utility] ─────────────────→ Phase 3: Scaffold
                                         │
                                         └─→ [Connector] ─→ Phase 2b: API Research
                                                                       ↓
                                                              Phase 3: Scaffold
                                                                       ↓
                          Phase 6: Iterate ← Phase 5: Publish/Validate ← Phase 4: Build
```

### Phase 1: Setup & Verification [ALWAYS REQUIRED]

**Start every session by:**

1. Inferring a component name from the user's request (e.g., "build a Canny connector" → `canny`)
2. Running setup to verify environment:

```bash
python scripts/setup_prerequisites.py <COMPONENT_NAME>
```

Wait for "PHASE 1 SETUP COMPLETE" before proceeding.

### Phase 2: Requirements Gathering [REQUIRED]

**Run for ALL components.** Use the session directory and requirements file path output by setup_prerequisites.py:

```bash
python scripts/gather_requirements.py \
  references/requirements-questions.json \
  <SESSION_DIR>/requirements.json
```

### Workflow Control

The requirements gathering script (`gather_requirements.py`) controls the entire workflow through its output:

| Exit Code | Meaning | Action |
|-----------|---------|--------|
| **0** | Proceed | Inference allowed, agent task to execute, or phase complete |
| **42** | **STOP** | **User input required. Ask the question. Wait for response. Do not continue.** |
| 2 | Error | Fix the issue and retry |

**Follow the script's output instructions exactly.** The DAG determines:

- **Questions** - Script outputs the question to ask the user
- **Agent tasks** - Script outputs Task tool instructions (e.g., spawn API researcher for connectors)
- **Completion** - Script outputs next action (e.g., run scaffold script)

When the script outputs an `agent_task`, spawn the specified agent, mark the task as answered, then re-run the script.

### Phase 3: Scaffold Component

After requirements (and API research for connectors), scaffold the component:

```bash
python scripts/scaffold_component.py <COMPONENT_NAME>
```

This uses `prism components:init` to create a connector-style scaffold with API Key and OAuth2 connections. For utility components, Phase 4 removes unused connector files.

### Phase 4: Generate Code

Implement the component based on requirements and API research:

**For Utility Components - First remove unused files:**
- Delete: `src/client.ts`, `src/connections.ts`, `src/triggers.ts`, `src/dataSources.ts`
- Update `src/index.ts` to only import/export actions (remove connections, triggers, dataSources)

Then implement:
- `src/actions/index.ts` - Implement the utility actions
- `src/inputs.ts` - Define input fields
- `src/index.ts` - Register the component

**For Application Connectors:**
- `src/client.ts` - HTTP client that calls the real API
- `src/connection.ts` - Auth configuration (API Key AND/OR OAuth2)
- `src/actions.ts` - CRUD actions using the client
- `src/triggers.ts` - Webhook triggers (if API supports webhooks)
- `src/dataSources.ts` - Picklist data sources
- `src/types.ts` - TypeScript interfaces
- `src/inputs.ts` - Input field definitions
- `src/index.ts` - Register all pieces

**CRITICAL: OAuth2 Authentication**

If the API supports OAuth2, implement it! See `references/oauth2-connection-guide.md` for complete patterns.

### Phase 5: Build, Publish, Test

```bash
# Build the component
python scripts/build_component.py components/<name>

# Publish to Prismatic
python scripts/publish_component.py components/<name>

# Validate the component
python scripts/validate_component.py components/<name>
```

### Phase 6: Iterate

If tests fail or issues arise:
1. Read error messages carefully
2. Fix the code
3. Rebuild and re-publish
4. Test again

## Key Scripts Reference

### Setup & Prerequisites

- `scripts/setup_prerequisites.py <name>` - Verify Prism installed and logged in, creates session directory

### Requirements Gathering

- `scripts/gather_requirements.py <questions.json> <answers.json>` - Interactive DAG-based questionnaire
- `scripts/write_answer.py <answers.json> <question-id> <answer>` - Helper to write answers

### Scaffold & Development

- `scripts/scaffold_component.py <name>` - Create component directory structure using prism CLI

### Build & Deploy

- `scripts/build_component.py <dir>` - Compile TypeScript with webpack
- `scripts/publish_component.py <dir>` - Deploy to Prismatic
- `scripts/validate_component.py <dir>` - Validate component structure

## Reference Documentation Guide

**Read BEFORE starting any component:**

- `references/workflow-phases.md` - Complete phase-by-phase workflow
- `references/component-architecture.md` - Component directory structure

**Read DURING Phase 4 (Code Generation):**

- `references/code-generation-guide.md` - File generation patterns
- `references/authentication-patterns.md` - API Key and OAuth2 patterns
- `references/oauth2-connection-guide.md` - **Deep dive on OAuth2 connections**
- `references/spectral-component-quickstart.md` - Spectral SDK basics

**Read DURING Phase 5 (Build/Deploy/Test):**

- `references/troubleshooting-errors.md` - When builds or tests fail

**Example Components:**

- `references/examples/utility-component/` - Complete utility example
- `references/examples/apikey-connector/` - Connector with API Key auth
- `references/examples/oauth2-connector/` - Connector with OAuth2 auth

---

## Remember

### Session & Workflow

- Start EVERY new session with Phase 1 setup (`scripts/setup_prerequisites.py`)
- Run Phase 2 requirements gathering for ALL components (`scripts/gather_requirements.py`)
- **Exit code 42 = STOP.** Ask user the question. Wait for their answer. Do not proceed.
- **Follow script output instructions exactly** - the DAG controls workflow branching
- Work autonomously in all other phases

### Authentication (CRITICAL for Connectors)

- **Always check if OAuth2 is supported** - it's the preferred auth method
- Implement BOTH API Key AND OAuth2 if the API supports both
- Use `oauth2Connection()` from Spectral for OAuth2 flows
- Access tokens via `connection.token?.access_token`
- See `references/oauth2-connection-guide.md` for complete patterns

### Code Generation

- Generate `client.ts` that calls the REAL external API
- Use Spectral's `createClient()` for HTTP requests
- Include proper TypeScript types in `types.ts`
- Implement webhook lifecycle (onInstanceDeploy/onInstanceDelete) for trigger registration

### Component Structure

All components use a single-directory structure (created by prism CLI):
```
components/{name}/
├── src/
│   ├── client.ts       # HTTP client (connectors)
│   ├── types.ts        # TypeScript interfaces (added by scaffold script)
│   ├── connections.ts  # Auth (connectors) - note: plural from CLI
│   ├── actions/        # Actions directory
│   │   └── index.ts
│   ├── triggers.ts     # Webhooks (connectors)
│   ├── dataSources.ts  # Picklists (connectors)
│   ├── inputs.ts       # Input definitions (added by scaffold script)
│   └── index.ts        # Component registration
├── assets/icon.png
├── package.json
├── tsconfig.json
└── webpack.config.js
```
