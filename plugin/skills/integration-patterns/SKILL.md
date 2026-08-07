---
name: integration-patterns
version: 1.0.0
description: Architecture patterns, manifest usage, code generation guides, and reference documentation for building Prismatic Code Native Integrations.
user-invocable: false
---

# Integration Patterns

Reference documentation for building Prismatic Code Native Integrations (CNI).

<disallowed-tools>
Do NOT use these MCP tools — they return incomplete data that causes broken scaffolds and missing connections downstream. A hook will deny them, but avoid the wasted round trip.

- `mcp__prism__prism_components_list` — Use `run.ts find-components <keyword>` instead
- `mcp__prism__prism_components_init` — Use `run.ts scaffold-component` instead
- `mcp__prism__prism_components_publish` — Use `run.ts publish-component` instead
- `mcp__prism__prism_components_generate_manifest` — Manifests are auto-generated during scaffolding
- `mcp__prism__prism_install_component_manifest` — Handled by `run.ts scaffold-project --components`
- `mcp__prism__prism_install_legacy_component_manifest` — Handled by `run.ts scaffold-project --components`
</disallowed-tools>

## Architecture Patterns

### Standard Integration Pattern
- Components accessed via manifests and componentRegistry
- Standard connection configuration
- Any component/manifest combination

## Component Manifest Pattern

All components are accessed via manifests:
1. Install: `prismatic-tools install-manifest <component-key>`
2. Register in componentRegistry.ts with `componentManifests()`
3. Import actions and call `.perform()`: `import slackActions from "./manifests/slack/actions"; await slackActions.postMessage.perform({...})`
- See `references/manifest-pattern.md`

## Config Mantra

Every config element MUST use wrapper functions:
- `configVar()` for simple values
- `connectionConfigVar()` for connections
- `dataSourceConfigVar()` for data sources
- See `references/cni-examples/config-patterns-correct-vs-incorrect.md`

## Phase: Inline API Research

When the DAG emits `status: "inline_task"` for API research, perform the research directly (no sub-agent). Key strategies:

- **Start broad**: First WebFetch fetches the entry-point URL with a comprehensive prompt extracting auth, base URL, endpoints, webhooks, and rate limits in one pass
- **Anchor deduplication**: Many APIs publish all docs on a single page with `#anchor` links. Strip fragments before fetching — `https://docs.example.com/api#posts` is the same page as `https://docs.example.com/api`
- **Follow-up fetches**: Only for genuinely different URL paths (e.g., `/api/authentication` vs `/api`)
- **Max 10 WebFetch calls**: If docs are insufficient after 10 fetches, note gaps and move on
- **Official docs only**: Stay on the documentation domain. No third-party sources (Zapier, Make, Stack Overflow)
- **Auth priority**: OAuth2 > API Key > Bearer Token > Basic Auth
- **Output format**: Structured JSON with `authentication`, `baseUrl`, `resources`, `webhooks`, `rateLimiting`
- See `references/cni-examples/component-auth-patterns.md` for connection setup patterns

## Phase-Specific References

Load only the references relevant to your current workflow phase. This keeps context focused and avoids attention budget waste.

### All Phases: Voice & Narration
- `references/narration-guide.md` - Orby's voice, personality traits, explanation depth rules, and phase milestone templates. Load at session start.

### Phase 2: Requirements Gathering
- Spec items carry `agent_context` (narration backbone), `implications` (per-option consequence maps), and `docs` (Prismatic doc URLs). The agent uses these inline — no external references needed for most questions. Docs are fetched on demand only when agent_context is insufficient or the user asks a follow-up beyond what the curated content covers.

### Phase 3: Credential Collection
- `references/auth-setup.md` - Authentication setup

### Phase 4: Scaffold
- `references/manifest-pattern.md` - Component manifest usage patterns
- `references/spectral-quickstart.md` - Spectral SDK basics
- `references/spectral-types.md` - **SDK type reference** — authoritative source for flow, errorConfig, retryConfig, queueConfig, configVar types. When the YAML spec and these types disagree, the types win.

### Phase 5: Code Generation (PRIMARY PHASE)
See the `<spec-loading>` block in cni-builder.md for progressive disclosure rules.
The references below are the full set available — load per the agent's guidance.

- `references/answer-to-code-cookbook.md` - **LOAD FIRST** — Maps integration.yaml answers directly to TypeScript code snippets. Spec items with `cookbook_section` fields point to specific headings in this file — Grep for those headings to find exact patterns, especially after context compaction.
- `references/spectral-types.md` - **SDK type reference** — validate generated code against actual types
- `references/code-generation-guide.md` - File generation patterns and context object
- `references/code-anti-patterns.md` - **Common mistakes** — wrong/right examples for config pages, flow callbacks, imports, component usage, trigger configuration. Consult when prismatic-tools validate-phase returns guidance items.
- `references/documentation-style.md` - Writing style rules for generated `documentation.md` files (no second-person pronouns, no product name, active voice)
- `references/cni-examples/config-patterns-correct-vs-incorrect.md` - Config wrapper functions (CRITICAL)
- `references/cni-examples/using-components.md` - Component usage patterns
- `references/trigger-metadata-spec.md` - Test data structure requirements
- Templates: `${CLAUDE_PLUGIN_ROOT}/templates/integration/` - Structural templates for all source files

**Conditional references for Phase 5 (load based on requirements):**
- If webhook trigger: `references/cni-examples/webhook-patterns.md`, `references/cni-examples/webhook-payload-access.md`
- If batched flow (one fetch → many per-batch executions): `references/cni-examples/batch-flows.md`
- If lifecycle hooks needed: `references/cni-examples/lifecycle-events.md`
- If state persistence needed: `references/cni-examples/state-persistence.md`
- If OAuth connection: `references/cni-examples/oauth-connection.md`
- If multi-flow: `references/cni-examples/multi-flow.md`
- If data sources: `references/cni-examples/data-sources.md`
- If JSON forms: `references/cni-examples/json-forms.md`
- If integration-agnostic connections: `references/cni-examples/integration-agnostic-connections.md`
- If templated connections: `references/cni-examples/templated-connections.md`
- If no component exists for source/destination: `references/cni-examples/direct-http-patterns.md`
- After code generation, run `prismatic-tools verify-code` to confirm requirements were transcribed into generated code

### Phase 6-7: Build, Deploy & Test
- `references/troubleshooting-errors.md` - Common errors and fixes
- `references/cni-examples/testing-debugging.md` - Test and debug patterns
- `references/cni-examples/error-handling.md` - Error handling patterns

### Phase 8: Iterate
- `references/network-configuration.md` - Network setup (if connectivity issues)

## All References

Full reference list for manual lookup:
- `references/narration-guide.md` - Orby voice, personality, explanation depth, phase milestones
- `references/answer-to-code-cookbook.md` - Maps integration.yaml answers → TypeScript code
- `references/code-anti-patterns.md` - Common code generation mistakes with wrong/right examples
- `references/documentation-style.md` - Writing style rules for generated documentation.md
- `references/workflow-phases.md` - Complete phase-by-phase workflow
- `references/workflow-guide.md` - Workflow overview
- `references/code-generation-guide.md` - File generation patterns and context object
- `references/manifest-pattern.md` - Component manifest usage patterns
- `references/auth-setup.md` - Authentication setup
- `references/network-configuration.md` - Network setup
- `references/spectral-quickstart.md` - Spectral SDK basics
- `references/trigger-metadata-spec.md` - Test data structure requirements
- `references/troubleshooting-errors.md` - Common errors and fixes
- `references/cni-examples/basic-api-to-slack.md` - Simple integration
- `references/cni-examples/webhook-patterns.md` - Webhook handling
- `references/cni-examples/webhook-payload-access.md` - Accessing trigger payloads
- `references/cni-examples/lifecycle-events.md` - onInstanceDeploy, onInstanceDelete
- `references/cni-examples/state-persistence.md` - State types and usage
- `references/cni-examples/config-patterns-correct-vs-incorrect.md` - Config wrapper functions
- `references/cni-examples/data-sources.md` - Data source patterns
- `references/cni-examples/json-forms.md` - JSON Forms for complex config
- `references/cni-examples/multi-flow.md` - Multi-flow integrations
- `references/cni-examples/batch-flows.md` - Batched flows (batchConfig + batchFlowTrigger)
- `references/cni-examples/oauth-connection.md` - OAuth connection setup
- `references/cni-examples/using-components.md` - Component usage patterns
- `references/cni-examples/error-handling.md` - Error handling patterns
- `references/cni-examples/integration-agnostic-connections.md` - Shared connections
- `references/cni-examples/templated-connections.md` - Templated connection patterns
- `references/cni-examples/testing-debugging.md` - Test and debug patterns
- `references/cni-examples/direct-http-patterns.md` - Direct HTTP/axios patterns when no component exists
