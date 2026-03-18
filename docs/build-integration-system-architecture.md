# Build-Integration System Architecture

How the integration-building skill works end-to-end, from user request to deployed code.

---

## System Overview

The build-integration system is a multi-file architecture that turns a natural language request
("build a CRM-to-Slack webhook notification") into a deployed Prismatic Code Native Integration.
It has four layers:

```
┌─────────────────────────────────────────────────────────────────┐
│  COMMAND LAYER                                                  │
│  commands/build-integration.md                                  │
│  - Entry point: receives $ARGUMENTS from user                   │
│  - Express mode extraction (rich descriptions → pre-filled)     │
│  - Delegates everything to the agent                            │
└─────────────────────────┬───────────────────────────────────────┘
                          │ forks agent context
┌─────────────────────────▼───────────────────────────────────────┐
│  AGENT LAYER                                                    │
│  agents/cni-builder.md ("Orby")                                 │
│  - Personality, voice, narration rules                          │
│  - STOP block: 11 non-negotiable code rules                     │
│  - Workflow phases 1-8                                           │
│  - Progressive spec loading                                     │
│  - Script orchestration                                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │ reads skill references per phase
┌─────────────────────────▼───────────────────────────────────────┐
│  KNOWLEDGE LAYER                                                │
│  skills/integration-patterns/                                   │
│  - SKILL.md: index of all references, phase-gated loading       │
│  - answer-to-code-cookbook.md: THE code generation source        │
│  - 20+ reference files for specific patterns                    │
│  - templates/integration/: structural templates                  │
└─────────────────────────┬───────────────────────────────────────┘
                          │ executes scripts for platform ops
┌─────────────────────────▼───────────────────────────────────────┐
│  SCRIPT LAYER                                                   │
│  scripts/ + scripts/integrations/ + scripts/shared/             │
│  - prerequisites, scaffold, deploy, test, package               │
│  - Component/connection search (GraphQL queries)                │
│  - Requirements validation + batch writes (post-compaction)      │
│  - Phase validation, build diagnosis, auth diagnosis             │
└─────────────────────────────────────────────────────────────────┘
```

---

## How the Command Layer Works

**File:** `commands/build-integration.md`

When a user types `/build-integration CRM deal webhooks to Slack notifications`, the command:

1. **Checks for express mode**: If the arguments contain enough detail (systems + data flow +
   trigger type), it extracts answers directly and writes them to requirements.json in batch.
   A new fallback rule prevents express mode from firing on ambiguous input — if fewer than
   3 answers can be confidently extracted, it defaults to conversational mode.

2. **Delegates to the agent**: The command specifies `agent: cni-builder` in its frontmatter,
   so the cni-builder agent takes over with its full ruleset and personality.

The command layer is intentionally thin. Voice/narration rules, code generation rules, and
workflow logic all live in the agent. The command's job is entry-point parsing and delegation.

---

## How the Agent Layer Works

**File:** `agents/cni-builder.md`

The agent ("Orby") orchestrates the entire build through 8 phases. Each phase has specific
scripts it runs, references it loads, and validation gates it must pass.

### The STOP Block (Rules 1-11)

These are prioritized by severity. The top 3 are the most commonly violated:

| # | Rule | Why it's here |
|---|------|---------------|
| 1 | Never run raw build tools | Agents reflexively try `npx webpack` |
| 2 | Never write onTrigger for webhooks | TAllowsBranching type error is unsolvable |
| 3 | Never add "(Recommended)" to options | Agent bias toward labeling preferred choices |
| 4 | Never use flow generics | TypeScript inference handles this |
| 5 | Never import from dist/ paths | Internal paths break builds |
| 6 | Never type-annotate callbacks | Inferred by flow() |
| 7 | Never search codebase for examples | Cookbook is the source of truth |
| 8 | Never use raw scaffold MCP tools | scaffold-project.ts replaces individual init+manifest steps |
| 9 | Always run from plugin root | Use --prefix for npm, directory param for MCP |
| 10 | Always read cookbook before coding | Prevents improvisation |
| 11 | Build-only connections can't deploy | Must ask user, not silently switch |

### Workflow Phases

```
Phase 1: Setup          → prerequisites.ts (auth, name validation, session dir)
Phase 2: Requirements   → YAML spec + AskUserQuestion (progressive loading)
Phase 3: Credentials    → Conversational (agent knowledge)
Phase 4: Scaffold       → scaffold-project.ts (init + deps + manifests)
Phase 5: Code Gen       → Read cookbook → generate TypeScript files
Phase 6: Build/Deploy   → npm run build --prefix → deploy-integration.ts (retry logic)
Phase 7: Test           → MCP prism_integrations_flows_test or test-integration.ts (post-compaction)
Phase 8: Iterate        → Fix → rebuild → redeploy
```

### Progressive Spec Loading

The requirements spec is split across 12 YAML files. The agent loads them on demand:

```
integration.yaml (master — always loaded)
  ├── overview.yaml (always)
  ├── flow-planning.yaml (skip if single flow)
  ├── flow-config.yaml (endpoint type, routing)
  ├── source-system.yaml (always)
  ├── destination-system.yaml (always)
  ├── error-handling.yaml (always)
  ├── execution-retry.yaml (skip if sync)
  ├── queue-config.yaml (skip if defaults work)
  ├── lifecycle-hooks.yaml (skip if no deploy hooks)
  ├── state-management.yaml (skip if no persistent state)
  └── payload-and-behavior.yaml (always)
```

This prevents the agent from loading 15K+ tokens of question definitions when only 3-4
domain files are relevant to the current integration.

### Narration Depth Rules

The agent is an educator, not a task runner. Depth expectations:

- **Educational moments** (concepts, choices, errors, architecture): 3-6 sentences
- **Mechanical steps** (build, validate, deploy): 2-3 sentences are acceptable
- **Phase transitions**: Structured output at specific milestones (after component search,
  after requirements, before code gen, after deploy)
- **Forbidden**: meta-references ("the spec says..."), process narration ("running a lookup
  script"), thin one-liners ("Found it. Moving on.")

---

## How the Knowledge Layer Works

### SKILL.md — The Reference Index

**File:** `skills/integration-patterns/SKILL.md`

Acts as a table of contents for all reference documentation. Organizes references by
workflow phase so the agent loads only what's relevant:

- Phase 2: no references (requirements are conversational)
- Phase 3: auth-setup.md
- Phase 4: manifest-pattern.md, spectral-quickstart.md, spectral-types.md
- Phase 5: cookbook (first!), spectral-types, code-gen guide, config patterns, etc.
- Phase 6-7: troubleshooting, testing-debugging, error-handling
- Phase 8: network-configuration (if connectivity issues)

Phase 5 also has **conditional references** loaded based on requirements answers:
- Webhook trigger → webhook-patterns.md, webhook-payload-access.md
- OAuth connection → oauth-connection.md
- No component exists → **direct-http-patterns.md** (new)
- Multi-flow → multi-flow.md
- etc.

The loading instructions for Phase 5 defer to the agent's `<spec-loading>` block to
avoid duplication between SKILL.md and cni-builder.md.

### Answer-to-Code Cookbook — The Code Generation Bible

**File:** `skills/integration-patterns/references/answer-to-code-cookbook.md`

This is the single most important file in the system. It maps every YAML spec answer ID
to an exact TypeScript snippet. The agent reads this file before writing ANY code, then
copies patterns directly.

**Key sections (in order):**

1. **Critical Import Rules** — What to import and from where
   - `{ flow, util, integration, configPage, configVar, ... }` from `@prismatic-io/spectral`
   - Three WRONG examples showing internal paths that break builds

2. **Default Omission Rule** — When an answer matches Prismatic's default, omit the property
   entirely rather than explicitly setting it. Covers errorConfig, isSynchronous, endpointType,
   endpointSecurityType, retryConfig.

3. **Critical Type Rules** — No type annotations on callbacks, no flow generics, use
   `as unknown as T` for casting. The TAllowsBranching explanation for why onTrigger is skipped.

4. **Flow Structure** — Complete working example showing the canonical pattern:
   flow() → no onTrigger → onExecution extracts from params.onTrigger.results

5. **Answer-to-Code Mappings** — One section per answer ID:
   - error_handler_type → flow.errorConfig
   - execution_retry_enabled → flow.retryConfig
   - queue config → flow.queueConfig
   - is_synchronous → flow.isSynchronous
   - endpoint_type → integration.endpointType
   - endpoint_security → flow.endpointSecurityType
   - trigger_type → flow structure (webhook/scheduled/polling)
   - organization_api_keys → flow.organizationApiKeys
   - preprocess_flow_routing → routing configuration
   - needs_deploy_hooks → lifecycle hooks
   - needs_state_management → state usage

6. **Connection Strategy** — Decision guide table (when to use each strategy) + code paths
   for organization-activated, customer-activated, manifest-based, and no-connection patterns.
   Includes the build-only connection prohibition with concrete WRONG/CORRECT examples.

7. **Config Pages** — Critical ordering rule (connections before data sources that depend on
   them), manifest helper pattern with full OAuth scopes, simple configVar patterns.

8. **Component Registry** — Import pattern using component key as variable name:
   `import slack from "./manifests/slack"` (not `slackManifest`)

9. **Multi-Flow** — Directory structure, per-flow file pattern, barrel export, mixed trigger
   types note, test data structure.

10. **Component Action Calls** — The .perform() pattern with configVar access, connection
    field access, and typed result casting.

### Direct HTTP Patterns (New)

**File:** `skills/integration-patterns/references/cni-examples/direct-http-patterns.md`

Covers the case when no Prismatic component exists for a system. Provides:
- Auth header patterns (Bearer, API key, Basic)
- Typed response pattern with axios generics
- Error handling (429 rate limits, 5xx retries, 4xx fail)
- Pagination with cursor pattern
- Complete flow example showing webhook → direct API POST
- Simple configVar-based connection config (no OAuth needed)

---

## How the Tool Layer Works

### MCP Tools (Primary Interface)

Most platform operations use MCP tools directly rather than wrapper scripts:

| Tool | Purpose |
|------|---------|
| `prism_me` | Verify Prismatic authentication |
| `prism_components_list` | Quick component existence check (flat results) |
| `prism_integrations_init` | Initialize integration project |
| `prism_install_component_manifest` | Install component manifest |
| `prism_integrations_import` | Deploy integration to Prismatic |
| `prism_integrations_flows_list` | List integration flows |
| `prism_integrations_flows_test` | Run test execution |

### Direct CLI Commands

| Command | Purpose |
|---------|---------|
| `npm run build --prefix <dir>` | Compile TypeScript via webpack |
| `npm install --prefix <dir>` | Install dependencies |
| `tar -czf <name>.tar.gz` | Package for download |

### Remaining Scripts

Scripts retained where they provide capabilities beyond MCP tools or CLI commands:

**Setup & Validation:**
- `prerequisites.ts` — Name validation, Prism CLI auto-install, auth check, project validation (`--existing` mode), session dir creation
- `check-prism-access.ts` — Structured network/auth diagnosis with exit codes (1=network, 2=auth, 3=other) and environment-specific remediation (Claude Settings allowlists, headless token flow, browser login). Use when prerequisites or any Prism CLI call fails mid-session.
- `validate-phase.ts` — Structural checks at phase boundaries
- `diagnose-build.ts` — Parses build failures into actionable diagnoses
- `validate-requirements.ts` — Loads the YAML spec (with `$include` resolution via `load-spec.ts`), diffs against `requirements.json` to find missing answers. Useful after context compaction when the agent can't reliably recall which groups were already covered.

**Data Scripts (deep lookups during Phase 2):**
- `find-components.ts` — Returns components with nested connection data (auth types, required inputs) via GraphQL. MCP `prism_components_list` returns flat results only.
- `search-connections.ts` — Queries org-level `scopedConfigVariables` (no MCP equivalent), enriches with component labels

**Requirements Persistence (multi-flow and validation):**
- `record-choices.ts` — Writes multiple answers in one atomic operation with flow-scoping (`--flow <id>`) and connection type validation. Catches the "string instead of object" foot-gun for `source_connection_type`/`destination_connection_type`. Supports stdin for large payloads.

**Project Analysis (modify-integration workflow):**
- `locate-project.ts` — Finds CNI project by path/name, extracts full architecture (flow structure, components, connections, config pages, lifecycle hooks) via source code parsing
- `extract-state.ts` — Extends locate-project with deep extraction: parses flow-level and integration-level properties (errorConfig, retryConfig, queueConfig, endpointType, schedule, lifecycle hooks, state management) back into spec-answer format. Produces a "before" snapshot for the modify workflow so the agent knows what exists without ad-hoc code reading

**Deploy & Package:**
- `deploy-integration.ts` — Deploys with retry logic (5 attempts, exponential backoff 2-20s with jitter). Raw MCP `prism_integrations_import` has no retry.
- `package-for-download.ts` — Smart exclusions (.env, node_modules, .git), zip-with-tar-fallback, versioned filenames, size formatting

**Testing:**
- `test-integration.ts` — Reconstructs test context from `test-data/trigger-config.json` and `test-data/<flow-key>/` payload files. Validates integration ID, lists flows, matches payloads to flows by trigger type, handles content-type routing. Essential after context compaction when the agent has lost track of which flows are webhooks vs scheduled and where test payloads live.

### Execution Model

Never `cd` into the project directory. Use `--prefix` for npm commands and
the `directory` parameter for MCP tools.

---

## Data Flow Through the System

```
User: "/build-integration CRM webhook to Slack"
  │
  ▼
build-integration.md (command)
  │ extracts: source=CRM, destination=Slack, trigger=webhook
  │
  ▼
cni-builder.md (agent)
  │
  ├─ Phase 1: prerequisites.ts → session_dir, requirements_file
  │    └─ On failure: check-prism-access.ts → structured diagnosis
  │
  ├─ Phase 2: Read integration.yaml → load domain files progressively
  │    ├─ find-components.ts "slack" → found: slack component + connections
  │    ├─ find-components.ts "crm" → not found (webhook source)
  │    ├─ AskUserQuestion (error handling, connection strategy, etc.)
  │    ├─ Read + Edit requirements.json (or record-choices.ts for multi-flow)
  │    └─ Agent verifies completeness (or validate-requirements.ts post-compaction)
  │
  ├─ Phase 3: Collect OAuth creds conversationally
  │
  ├─ Phase 4: scaffold-project.ts --components slack
  │    └─ Creates project dir, node_modules, src/manifests/slack/
  │
  ├─ Phase 5: Read answer-to-code-cookbook.md
  │    ├─ Read requirements.json
  │    ├─ Look up each answer → copy TypeScript snippet
  │    ├─ Generate: componentRegistry.ts, configPages.ts, flows.ts, index.ts
  │    ├─ Generate: documentation.md, test-data/
  │    └─ validate-phase.ts --phase code-gen
  │
  ├─ Phase 6: npm run build --prefix → deploy-integration.ts (retry)
  │    └─ validate-phase.ts --phase build
  │
  ├─ Phase 7: MCP prism_integrations_flows_test (or test-integration.ts post-compaction)
  │
  └─ Phase 8: Fix issues → rebuild → redeploy
```

---

## Key Design Decisions

### Why the cookbook exists (instead of inline code generation)

The agent doesn't "know" Prismatic's TypeScript API. Without the cookbook, it would hallucinate
import paths, invent type annotations, and use patterns from its training data that don't match
the Spectral SDK. The cookbook provides exact, copy-paste-ready snippets for every answer → code
mapping. This is the single highest-leverage document in the system.

### Why onTrigger is prohibited for webhooks

Prismatic's `flow()` function defaults `TAllowsBranching` to `boolean`, creating a
`true | false` union in `TriggerResult`. Custom `onTrigger` return types nearly always fail
to satisfy this union. The default trigger passes the full payload through, and `onExecution`
extracts data via `params.onTrigger.results`. This avoids the type error entirely.

### Why config pages must be ordered

Prismatic evaluates config pages sequentially during the customer setup wizard. A data source
(like Slack's `selectChannels`) calls the Slack API to populate a dropdown. If the OAuth
connection is on the same page, the data source fires before OAuth completes → auth error.
Connections go on page 1, dependent data sources on page 2+.

### Why component registry uses the key as the variable name

The docs use `import slack from "./manifests/slack"` and `componentManifests({ slack })`.
Using `slackManifest` instead creates a mismatch with docs examples and the shorthand
property syntax. The component key IS the variable name.

### Why the spec carries narration and doc links

Spec items include enrichment fields (`agent_context`, `implications`, `docs`,
`cookbook_section`, `references`) so the agent has everything it needs to narrate
accurately and find the right code patterns without loading large files upfront.

- **`agent_context`** provides the narration backbone for each question.
- **`implications`** maps each choice to its downstream consequences — the agent must
  explain tradeoffs, not just list options.
- **`docs`** are Prismatic doc URLs fetched on demand (not eagerly) per the doc-fetch protocol.
- **`cookbook_section`** points to the exact heading in the cookbook for code gen — survives
  context compaction because the agent can Grep for it.
- **`references`** are skill reference files loaded just-in-time by phase and condition.

### Why the Default Omission Rule exists

Setting `errorConfig: { errorHandlerType: "fail" }` is equivalent to omitting errorConfig
entirely — "fail" is the default. Explicit defaults add noise to generated code and make
it harder to spot actual configuration. The omission rule applies to errorConfig, isSynchronous,
endpointType, endpointSecurityType, and retryConfig.

### Why voice instructions are in the agent, not the command

Voice/narration rules were duplicated in both `build-integration.md` (~25 lines) and
`cni-builder.md` (~100 lines). The command's shorter version occasionally contradicted
the agent's longer version. Now the command has a single line: "Voice and narration style
are defined in the agent instructions. Follow them." One source of truth.

---

## Modify-Integration Workflow

The modify workflow is a separate entry point (`commands/modify-integration.md`) that reuses the
same agent, knowledge layer, and spec vocabulary as the build workflow — but inverts the flow.

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  locate-project  │────▶│  extract-state    │────▶│  requirements.json│
│  (find project)  │     │  (code → answers) │     │  (before snapshot)│
└─────────────────┘     └──────────────────┘     └────────┬─────────┘
                                                           │
                                                           ▼
                                                  ┌──────────────────┐
                                                  │  Agent reads      │
                                                  │  snapshot + user  │
                                                  │  modification     │──▶ Targeted edits
                                                  │  request          │    to existing files
                                                  └──────────────────┘
```

### Key Design Decisions

**Why extract-state.ts exists (instead of ad-hoc code reading)**

Without a structured "before" snapshot, the agent reads source code ad-hoc, asks vague questions,
and applies changes without a formal understanding of current state. This leads to inconsistencies
and missed architectural interactions (e.g., changing a trigger type without updating error handling
that depends on it). `extract-state.ts` parses existing TypeScript back into spec-answer format,
giving the agent a map in the same vocabulary used by `integration.yaml`.

**Why the modification spec is thin (2 items instead of 7)**

The old `modify-integration.yaml` (v2) had 7 items that captured generic modification intent
disconnected from the rich spec vocabulary. The new v3 spec captures just INTENT (`modification_scope`
+ `modification_description`). For details, the agent dynamically loads the relevant domain files
from `integration.yaml` — getting all the `agent_context`, `implications`, and `cookbook_section`
pointers for free. This means the modify workflow benefits from any future enrichment to the
build spec without parallel maintenance.

**Why requirements.json is a read-only reference in modify mode**

In build mode, requirements.json is a build input — the agent writes answers, then scaffold-project
and code generation read them. In modify mode, the populated state is a reference the agent reads
to know what exists so it can make compatible, targeted changes. It is NOT fed forward into a
build pipeline.

**Why targeted edits instead of file regeneration**

Regenerating an entire file (e.g., flows.ts) from state risks losing custom code, comments,
and patterns the agent doesn't understand. Targeted edits (inserting an errorConfig block,
adding an import, editing a config var) preserve everything the agent didn't change.

### Extraction and the Default Omission Rule

The cookbook's Default Omission Rule says "when an answer matches Prismatic's default, omit the
property." Extract-state.ts applies this in reverse: when a code property is absent, the extracted
state maps it to the Prismatic default. This is critical because the absence of `errorConfig`
IS information — it means `error_handler_type: "fail"`.

| Absent Property | Extracted Default |
|----------------|-------------------|
| No `errorConfig` | `error_handler_type: "fail"` |
| No `retryConfig` | `execution_retry_enabled: "No"` |
| No `queueConfig` | `queue_fifo_enabled: "No"` |
| No `isSynchronous` | `is_synchronous: "No"` |
| No `endpointType` | `endpoint_type: "flow_specific"` |
| No `endpointSecurityType` | `endpoint_security: "customer_optional"` |

### Items Not Extractable from Code

Some spec answers can't be reverse-engineered from TypeScript. These appear in `extraction_gaps`:
- Free-text descriptions (`systems`, `data_flow`, `transformations`)
- System names (`source_system`, `destination_system`)
- External URLs (`source_api_docs_url`, `destination_api_docs_url`)
- Payload shape (TypeScript interface extraction is fragile)

The agent knows not to present these as known state and won't assume values for them.

### Build, Deploy, Test in Modify Mode

Phase 4 (build, deploy, test) is identical to build mode — `npm run build --prefix`, deploy-integration.ts
with retry, MCP test tool. The only difference: there is no scaffolding step to re-run, and
requirements.json is not re-read as a build input. The agent goes straight from targeted edits to build.

### Task List Sync (Both Modes)

`sync-task-list.ts` bridges the spec's condition/dependency structure with Claude Code's Task system. It reads
the spec + current answers, evaluates all conditions/dependencies, and outputs a task manifest
describing what the task list should contain. The agent applies this via TaskCreate/TaskUpdate.

**Why a script instead of agent-side logic:** The condition evaluation logic is 80+ lines of tested
code in `validate-requirements.ts`. Reimplementing it as English prose in agent instructions would
be fragile and drift from the spec. The script reuses the same `evaluateCondition()` and
`isApplicable()` patterns, so the task list stays in sync with the spec as it evolves.

**Dynamic task creation:** When the user answers `error_handler_type: "retry"`, the next sync run
detects that `error_retry_max_attempts`, `error_retry_delay_seconds`, etc. are now applicable
(their conditions are met, dependencies are answered). It outputs them as `status: "pending"`,
and the agent creates new tasks. Items whose conditions are no longer met (e.g., the user changed
from "retry" to "fail") are output as `status: "not_applicable"` for deletion.

**Modify mode filtering:** The `--scope` flag maps modification_scope choices to spec group IDs,
so only relevant items appear. "Change error handling / retry config" filters to just the
`error_handling` and `execution_retry` groups — the user doesn't see tasks for source/destination
system setup.

---

## File Inventory

| File | Lines | Role |
|------|-------|------|
| `commands/build-integration.md` | ~90 | Entry point, express mode, delegation |
| `agents/cni-builder.md` | ~560 | Agent rules, workflow, voice, code gen checklist |
| `skills/integration-patterns/SKILL.md` | ~124 | Reference index, phase-gated loading |
| `references/answer-to-code-cookbook.md` | ~1055 | Answer-to-code mappings (THE source of truth) |
| `references/cni-examples/direct-http-patterns.md` | ~210 | Direct HTTP patterns (no component) |
| `scripts/questions/integration.yaml` | master | Requirements spec table of contents |
| `scripts/questions/integration/*.yaml` | 11 files | Domain-specific question definitions |
| `scripts/prerequisites.ts` | 1 file | Name validation, auth check, session dir, Prism auto-install |
| `scripts/integrations/find-components.ts` | 1 file | Deep component + connection lookup (GraphQL) |
| `scripts/integrations/search-connections.ts` | 1 file | Org-level connection lookup (GraphQL) |
| `scripts/shared/check-prism-access.ts` | 1 file | Structured network/auth diagnosis (exit codes + remediation) |
| `scripts/validate-requirements.ts` | 1 file | Spec-vs-answers completeness check (post-compaction safety net) |
| `scripts/integrations/record-choices.ts` | 1 file | Atomic multi-answer writes with flow scoping + connection validation |
| `scripts/integrations/locate-project.ts` | 1 file | Project finder + architecture extractor (modify workflow) |
| `scripts/integrations/extract-state.ts` | 1 file | Deep code-to-spec-answer extraction (modify workflow before snapshot) |
| `scripts/integrations/sync-task-list.ts` | 1 file | Spec → task manifest bridge (dynamic task creation from conditions) |
| `scripts/integrations/deploy-integration.ts` | 1 file | Deploy with retry logic (exponential backoff, 5 attempts) |
| `scripts/integrations/package-for-download.ts` | 1 file | Smart packaging (exclusions, versioning, zip/tar fallback) |
| `scripts/integrations/scaffold-project.ts` | 1 file | Project scaffolding (init + deps + manifests) |
| `scripts/integrations/test-integration.ts` | 1 file | Test execution with trigger metadata + payload matching (post-compaction) |
| `scripts/shared/validate-phase.ts` | 1 file | Structural checks at phase boundaries |
| `scripts/shared/diagnose-build.ts` | 1 file | Build failure diagnosis |
| `templates/integration/*.template` | 2+ files | Structural templates |
