---
name: building-prismatic-integrations
description: Build and deploy Prismatic Code Native Integrations, Automations, and Workflows through conversation. Handles TypeScript generation, component discovery, OAuth, deployment, testing, and iteration.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task
---

# Prismatic Code Native Integration Builder

Build Prismatic integrations through conversation - from requirements to deployment.

## Agent Quick Reference Card

**Your first response to user:** "Let me set up prerequisites" → Run `scripts/setup_prerequisites.py`

**Every integration workflow:**

1. Phase 1: Setup (once per session) → `setup_prerequisites.py`
2. Phase 2: Requirements → `gather_requirements.py` **(exit 42 = STOP and ask user)**
3. Scaffold Project → `scaffold_project.py <name> --components <component1,component2>`
4. Phase 3: Generate code → Create componentRegistry.ts, configPages.ts, flows.ts, index.ts, documentation.md, test-data/
5. Phase 4-5: Build → Deploy → Test
6. Phase 6: Iterate (fix issues, rebuild, retest)
7. Phase 7: Deliver → Package

**Component manifest pattern:** Install manifest → Register in componentRegistry → Access via `context.components.<componentKey>`

**Config mantra:** Every element uses wrapper function (configVar/connectionConfigVar/dataSourceConfigVar)

**Common mistake:** Assuming webhooks exist without checking component triggers first

**When stuck:** references/troubleshooting-errors.md

---

## Quick Start

**You are the integration builder.** The user describes what they want, you build it.

### Prerequisites Check

Before starting ANY integration work:

1. **First time in session:** Run Phase 1 Setup (see below)
2. **Prism CLI:** User must have Prism CLI installed and be logged in
3. **Prismatic account:** User needs active account with integration permissions

## Core Workflow

### Phase 1: Setup & Verification [ALWAYS REQUIRED]

**Start every session by:**

1. Inferring an integration name from the user's request (e.g., "sync Salesforce to Slack" → `salesforce-slack-sync`)
2. Running setup to verify environment:

```bash
scripts/setup_prerequisites.py <INTEGRATION_NAME>
```

Wait for "PHASE 1 SETUP COMPLETE" before proceeding.

### Phase 2-7: Build Integration

After setup, follow the integration workflow:

```text
Phase 1: Setup → Phase 2: Requirements → Scaffold → Phase 3: Generate Code
                                                            ↓
                            Phase 7: Deliver ← Phase 6: Iterate ← Phase 4-5: Build/Deploy/Test
```

**For detailed phase instructions:** See [references/workflow-phases.md](references/workflow-phases.md)

**Phase 2 is REQUIRED for all integrations** - use interactive requirements gathering to capture user needs.

**After Phase 2, scaffold the project with component manifests:**

```bash
scripts/scaffold_project.py <INTEGRATION_NAME> --components <component1,component2>
```

## Phase 2: Requirements Gathering (REQUIRED)

**Run for ALL integrations.** Use the session directory and requirements file path output by setup_prerequisites.py:

```bash
python scripts/gather_requirements.py \
  references/requirements-questions.json \
  <SESSION_DIR>/requirements.json
```

**Exit code 42 = STOP AND WAIT FOR USER**

The script controls the workflow:

- **Exit 0** → Proceed (inference allowed or phase complete)
- **Exit 42** → STOP. Ask user the question. Wait for their response. Do not continue.

**After component discovery, identify which manifests to install:**

Use `scripts/search_components.py <keyword>` to find available components, then pass them to scaffold_project.py.

## Component Manifest Pattern

**All 3rd party components are accessed via manifests.** This provides type-safe access to component actions, connections, and data sources.

### Installing Manifests

Manifests are installed during scaffolding:

```bash
scripts/scaffold_project.py <name> --components slack,salesforce
```

Or manually after scaffolding:

```bash
cd <project-dir>
npx cni-component-manifest <component-key>
```

### Using Manifests in Code

**1. Register components in componentRegistry.ts:**

```typescript
import { componentManifests } from "@prismatic-io/spectral";
import slack from "./manifests/slack";
import salesforce from "./manifests/salesforce";

export const componentRegistry = componentManifests({ slack, salesforce });
```

**2. Use connection helpers in configPages.ts:**

```typescript
import { slackOauth2 } from "./manifests/slack/connections/oauth2";
import { slackSelectChannels } from "./manifests/slack/dataSources/selectChannels";

export const configPages = {
  Connections: configPage({
    elements: {
      "Slack Connection": slackOauth2("slack-connection", {
        // OAuth configuration
      }),
    },
  }),
  "Slack Config": configPage({
    elements: {
      "Slack Channel": slackSelectChannels("slack-channel", {
        connection: { configVar: "Slack Connection" },
      }),
    },
  }),
};
```

**3. Access components in flows.ts:**

```typescript
onExecution: async (context, params) => {
  // Component action returns unknown - cast to expected type
  const result = await context.components.slack.postMessage({
    connection: context.configVars["Slack Connection"],
    channelName: context.configVars["Slack Channel"],
    message: "Hello from integration!",
  }) as SlackPostMessageResponse;

  return { data: result };
};
```

**Complete guide:** See [references/manifest-pattern.md](references/manifest-pattern.md)

## Code Generation

Generate these files for every integration:

1. **src/componentRegistry.ts** - Register all 3rd party component manifests
   - Import manifests from `./manifests/<component>/`
   - Export `componentRegistry` using `componentManifests()`
   - See [references/manifest-pattern.md](references/manifest-pattern.md) for patterns
2. **src/configPages.ts** - User configuration UI
   - **CRITICAL**: EVERY config element MUST use wrapper functions (`configVar`, `connectionConfigVar`, `dataSourceConfigVar`) - NEVER plain objects!
   - **MUST READ**: [references/cni-examples/config-patterns-correct-vs-incorrect.md](references/cni-examples/config-patterns-correct-vs-incorrect.md) - Shows exact correct vs incorrect patterns
   - Use connection helpers from manifests for OAuth (e.g., `slackOauth2`)
   - Use data source helpers from manifests for dropdowns (e.g., `slackSelectChannels`)
   - Use `dataSourceConfigVar` with `dataSourceType: "jsonForm"` for complex forms - see [references/cni-examples/json-forms.md](references/cni-examples/json-forms.md)
3. **src/flows.ts** - Integration logic
   - **Check requirements answers** for lifecycle needs (initial_data_sync, webhook_lifecycle, resource_initialization, teardown_cleanup)
   - Include `onInstanceDeploy` when: initial baseline sync, webhook registration, or resource initialization needed
   - Include `onInstanceDelete` when: cleanup, webhook unregistration, or resource deletion needed
   - Access component actions via `context.components.<componentKey>.<action>()`
   - Use state persistence for data across executions - see [references/cni-examples/state-persistence.md](references/cni-examples/state-persistence.md)
   - **Complete guide**: [references/cni-examples/lifecycle-events.md](references/cni-examples/lifecycle-events.md)
4. **src/index.ts** - Integration metadata (includes `description`, imports `documentation`, imports `componentRegistry`)
5. **src/documentation.md** - User-facing Markdown documentation
6. **test-data/trigger-config.json** - Trigger metadata (REQUIRED)
7. **test-data/\<flow-key\>/sample-payload.\<ext\>** - Test payloads (for webhook flows)

**CRITICAL:** Create `test-data/` directory with:

- `trigger-config.json` describing all flow triggers
- For webhook flows: `<flow-key>/sample-payload.<ext>` with actual test data

The test script looks for these files during Phase 4-5. Without them, webhook testing will fail.

**Templates and patterns:** [references/code-generation-guide.md](references/code-generation-guide.md)
**Trigger metadata spec:** [references/trigger-metadata-spec.md](references/trigger-metadata-spec.md)
**Working examples:** [references/cni-examples/](references/cni-examples/)

## Key Scripts Reference

### Setup & Prerequisites

- `scripts/setup_prerequisites.py <name>` - Verify Prism installed and logged in, creates session directory
- `scripts/scaffold_project.py <name> [--components <comp1,comp2>]` - Create project structure and install manifests

### Requirements Gathering

- `scripts/gather_requirements.py <questions.json> <answers.json>` - Interactive DAG-based questionnaire
- `scripts/write_answer.py <answers.json> <question-id> <answer>` - Helper to write answers

### Development

- `scripts/install_dependencies.py <dir>` - Install npm packages
- `scripts/search_components.py <keyword>` - Find available components
- `scripts/search_connections.py <keyword>` - Find available integration-agnostic connections

### Build & Deploy

- `scripts/build_integration.py <dir>` - Compile TypeScript
- `scripts/deploy_integration.py <dir>` - Deploy to Prismatic
- `scripts/test_integration.py <id> [flow] [--integration-dir <dir>]` - Run test execution with auto-payload detection

### Delivery

- `scripts/package_for_download.py <dir> <version>` - Create downloadable package

## Troubleshooting

**Common issues:** [references/troubleshooting-errors.md](references/troubleshooting-errors.md)

**Quick diagnostics:** `scripts/troubleshoot.py <project-dir>`

**Auth failures:** Verify login with `prism me`

## Resuming Existing Work

When working in a directory with an existing integration:

1. Run `scripts/install_dependencies.py <dir>` if node_modules is missing
2. Ask what changes are needed
3. Resume from Phase 3 (Code Generation)

## Reference Documentation Guide

**Read BEFORE starting any integration:**

- references/workflow-phases.md - Complete phase-by-phase workflow

**Read DURING Phase 2 (Requirements):**

- references/workflow-phases.md Phase 2 - Answer inference rules with examples

**Read DURING Phase 3 (Code Generation):**

- references/manifest-pattern.md - Component manifest usage patterns
- references/code-generation-guide.md - File generation patterns and context object
- references/cni-examples/config-patterns-correct-vs-incorrect.md - Config wrapper functions
- references/cni-examples/webhook-payload-access.md - Accessing trigger payloads in onExecution

**Read DURING Phase 4-5 (Build/Deploy/Test):**

- references/trigger-metadata-spec.md - Test data structure requirements
- references/troubleshooting-errors.md - When tests fail or errors occur

**Read AS NEEDED for specific patterns:**

- references/cni-examples/lifecycle-events.md - onInstanceDeploy, onInstanceDelete, baseline data collection
- references/cni-examples/state-persistence.md - State types and when to use each
- references/cni-examples/ - Specific pattern examples (OAuth, JSON forms, multi-flow, etc.)

---

## Remember

### Session & Workflow

- Start EVERY new session with Phase 1 setup (`scripts/setup_prerequisites.py`)
- Run Phase 2 requirements gathering for ALL integrations (`scripts/gather_requirements.py`)
- **Exit code 42 = STOP.** Ask user the question. Wait. Do not proceed.
- After Phase 2, scaffold the project with manifests (`scripts/scaffold_project.py <name> --components <comp1,comp2>`)
- Work autonomously in all other phases

### Component Manifest Pattern (MOST CRITICAL)

- All 3rd party components are accessed via manifests installed with `npx cni-component-manifest`
- Register manifests in `componentRegistry.ts` using `componentManifests()`
- Access component actions via `context.components.<componentKey>.<action>()`
- Component action results are `unknown` - cast to appropriate types based on manifest type definitions
- Use connection/datasource helpers from manifests in configPages

### Code Generation

- Config elements MUST use wrapper functions: `configVar()`, `connectionConfigVar()`, `dataSourceConfigVar()`
- Create `test-data/` directory with `trigger-config.json` for ALL integrations in Phase 3
- Generate `componentRegistry.ts` when using 3rd party components

### State Management

- `instanceState` NOT available in `onInstanceDeploy`/`onInstanceDelete` - use `crossFlowState` instead
- Use `onInstanceDeploy` for initial baseline data; use `onExecution` for incremental/ongoing operations
