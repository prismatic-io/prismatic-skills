# Component Builder Workflow Phases

This document describes each phase of the component building process in detail.

## Phase Overview

```
Phase 1: Setup ─→ Phase 2: Requirements ─┬─→ [Utility] ─→ Phase 3: Scaffold
                                         │
                                         └─→ [Connector] ─→ Phase 3b: Research API
                                                                    ↓
                                                           Phase 3c: Scaffold
                                                                    ↓
                        Phase 6: Iterate ← Phase 5: Publish/Validate ← Phase 4: Build
```

---

## Phase 1: Setup & Verification

**Purpose:** Verify the development environment is ready.

**Script:** `scripts/prerequisites.ts <COMPONENT_NAME> --type component`

**What it does:**
1. Checks if Prism CLI is installed
2. Offers to install Prism if missing
3. Verifies user is logged in to Prismatic
4. Creates session directory for this build

**Success output:**
```
PHASE 1 SETUP COMPLETE

Component: canny
Component directory: /path/to/components/canny
Session directory: /path/to/components/canny/.prismatic
```

**Next:** Phase 2 (Requirements)

---

## Phase 2: Requirements Gathering

**Purpose:** Capture user requirements through structured questions.

**Tools:**
- `prismatic-tools update-tasks --session <name> --type component --actionable` — discover what needs answering
- `prismatic-tools record-choices --session <name> --type component key=value` — write answers

**Question flow:**

1. **component_type** - Utility or Application Connector
2. **component_name** - Lowercase with hyphens
3. **component_description** - Brief description

**Utility path:**
- **utility_actions** - What actions to provide
- **utility_inputs** - Input types

**Connector path:**
- **api_name** - External API name
- **api_docs_url** - **Required** URL to API docs
- **confirm_auth_type** - Auth methods to support
- **confirm_resources** - Resources/entities to support
- **webhook_support** - Include webhook triggers?

**After Phase 2:**
- Utility → Phase 3 (Scaffold)
- Connector → Phase 3b (API Research)

---

## Phase 3b: API Research (Connectors Only)

**Purpose:** Gather information about the external API before generating code.

**How it works:** The `/build-component` orchestrating command spawns the `external-api-researcher` sub-agent from the main conversation context. This follows the [chain subagents pattern](https://code.claude.com/docs/en/sub-agents#chain-subagents) — the orchestrator handles setup/requirements in the main context, then delegates research and building to separate sub-agents.

**Trigger:** During requirements gathering, `gather-requirements.ts` outputs `status: "agent_task"` when it reaches the `spawn_api_researcher` step. The orchestrating command then spawns the researcher.

**What the agent researches:**

1. **Authentication** - Methods, OAuth2 URLs/scopes, header formats
2. **Base URL** - API endpoint and versioning
3. **Resources** - Entities with CRUD endpoints and schemas
4. **Webhooks** - Registration, events, payload format, security

**Output:** `{SESSION_DIR}/api-research.json` with structured findings

**Next:** Remaining requirements questions (auth confirmation, resources, webhooks), then Phase 3 (Scaffold)

---

## Phase 3: Scaffold Component

**Purpose:** Create the component directory structure using prism CLI.

**Script:** `scripts/components/scaffold-component.ts <NAME>`

**What it does:**
1. Runs `prism components:init <name>` to create connector-style scaffold
2. Removes test files (jest.config.js, *.test.ts)
3. Adds skeleton files (types.ts, inputs.ts)
4. Runs `npm install` automatically

**Creates:**
```
components/{name}/
├── src/
│   ├── client.ts       # HTTP client (from CLI)
│   ├── connections.ts  # API Key + OAuth2 connections (from CLI)
│   ├── actions/        # Actions directory (from CLI)
│   │   └── index.ts
│   ├── triggers.ts     # Webhook triggers (from CLI)
│   ├── dataSources.ts  # Data sources (from CLI)
│   ├── types.ts        # TypeScript interfaces (added by script)
│   ├── inputs.ts       # Input definitions (added by script)
│   └── index.ts        # Component registration (from CLI)
├── assets/icon.png
├── package.json
├── tsconfig.json
├── webpack.config.js
└── node_modules/       # npm install runs automatically
```

**Note:** CLI creates `connections.ts` (plural), not `connection.ts` (singular).

**Next:** Phase 4 (Generate Code)

---

## Phase 4: Generate Code

**Purpose:** Implement the component based on requirements.

### For Utility Components

**First, remove unused connector files:**
- Delete: `src/client.ts`, `src/connections.ts`, `src/triggers.ts`, `src/dataSources.ts`
- Update `src/index.ts` to remove imports/exports for connections, triggers, dataSources

**Then edit these files:**

| File | Purpose |
|------|---------|
| `src/actions/index.ts` | Implement utility actions |
| `src/inputs.ts` | Define input fields |
| `src/index.ts` | Register component (actions only) |

### For Application Connectors

Edit these files:

| File | Purpose |
|------|---------|
| `src/client.ts` | HTTP client calling real API |
| `src/types.ts` | TypeScript interfaces |
| `src/connection.ts` | Auth configuration |
| `src/actions.ts` | CRUD actions using client |
| `src/triggers.ts` | Webhook triggers |
| `src/dataSources.ts` | Picklist data sources |
| `src/inputs.ts` | Input field definitions |
| `src/index.ts` | Register all pieces |

**Key patterns:**
- Use API research to inform endpoint paths
- Implement OAuth2 if supported (see oauth2-connection-guide.md)
- Handle webhook lifecycle in triggers

**Next:** Phase 5 (Build/Publish/Test)

---

## Phase 5: Build, Publish, Validate

### Build

**Script:** `scripts/components/build-component.ts <COMPONENT_DIR>`

**What it does:**
1. Installs npm dependencies if needed
2. Runs webpack build
3. Outputs `dist/index.js`

### Publish

**Script:** `scripts/components/publish-component.ts <COMPONENT_DIR>`

**What it does:**
1. Runs `prism components:publish`
2. Uploads component to Prismatic

### Validate

**Script:** `scripts/components/validate-component.ts <COMPONENT_DIR>`

**What it does:**
1. Validates component structure (required files exist)
2. Verifies build output exists (`dist/index.js`)

**Functional testing** should be performed by the user in the Prismatic platform by adding the component to an integration and testing with real credentials and data.

**Next:** Phase 6 if issues, or done!

---

## Phase 6: Iterate

**Purpose:** Fix issues and improve the component.

**Process:**
1. Identify issue from test output or user feedback
2. Edit source files to fix
3. Rebuild: `scripts/components/build-component.ts`
4. Re-publish: `scripts/components/publish-component.ts`
5. Re-validate: `scripts/components/validate-component.ts`

**Common iteration patterns:**
- Fix TypeScript errors
- Update endpoint paths based on actual API
- Add missing actions/triggers
- Improve error handling
