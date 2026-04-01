# Structural Assessment — Prismatic Skills Plugin

**Date:** 2026-04-01
**Sources:** Internal team feedback (Jake, Ryan), V1/V2 comparison report, component builder evaluation, live test sessions

---

## Issue 1: Skill Loading / Progressive Disclosure

### Current State

Each agent loads exactly one skill via frontmatter (`skills: - integration-patterns` or `skills: - component-patterns`). The SKILL.md files are modest indexes (143 and 121 lines) that point to reference files totaling 22,788 lines across 56 files.

The SKILL.md says "Load only the references relevant to your current workflow phase." The `code-plan` script emits a manifest of which cookbook sections and reference files to read during code gen. The `update-tasks` script emits `<read-spec-before-asking>` with domain file paths during requirements.

### Problem

The cookbook (`answer-to-code-cookbook.md` — 507 lines for components, 1,407 lines for integrations) should be read progressively via the `code-plan` manifest, which tells the agent exactly which headings to Grep for. But in practice, the agent sometimes reads the entire cookbook at once during code gen, consuming significant context. The `code-plan` manifest says "Grep for each `<cookbook>` heading" but the agent may read the whole file instead of grepping individual sections.

There's no enforcement — progressive loading relies on prose instructions and script directives. The agent can ignore both.

### What's Working

- `code-plan` emits per-answer cookbook headings and reference file paths
- `<read-spec-before-asking>` tells the agent which domain YAML to read for pending items
- `<spec-loading>` block has `<skip-when>` conditions for domain files
- SKILL.md phase-specific references section acts as a table of contents

### What's Not Working

- Agent reads entire cookbook instead of grepping individual headings
- No enforcement mechanism — directives are suggestions, not gates
- After context compaction, the agent may re-read entire files it already consumed
- Reference files loaded during requirements stay in context during code gen (stale)

### Recommendations

1. **Cookbook section extraction:** The `code-plan` script could extract the actual cookbook snippets (not just headings) and emit them inline in the manifest. The agent wouldn't need to read the cookbook file at all — the relevant sections would be in the `code-plan` output. This trades larger script output for guaranteed progressive loading.

2. **Enforcement via hook:** A PostToolUse hook on Read could warn (not block) when the agent reads a file larger than ~200 lines during a phase where `code-plan` should be driving. This is complex and probably not worth it.

3. **Smaller reference files:** Break the 1,407-line integration cookbook into per-topic files. The `code-plan` manifest already knows which topics are needed — it could point to smaller files instead of headings in one large file.

---

## Issue 2: Source/Destination Binary Framing

### Current State

The integration spec has exactly two system slots: `source` and `destination`. Each has its own domain YAML file (`source-system.yaml`, `destination-system.yaml`) and hardcoded `source_*` / `destination_*` prefixed items. The `required.always` list hardcodes: `source_component`, `source_connection_type`, `source_connection`, `destination_component`, `destination_connection_type`, `destination_connection`.

### Problem

Prismatic integrations can use any number of components. An integration like "HTTP API → BigQuery → Slack" needs 3 connectors. The spec can only express 2. The third connector gets stuffed into `additional_requirements` as free text, losing all structure — component search, connection type selection, connection management, and existing connection lookup are all skipped for the third system.

Real-world consequence (from Jake's test): The agent found all 3 components correctly. But by the time it got to connections, it had forgotten about Slack because Slack wasn't represented as a first-class connector in the spec. The existing Slack connection in the org was never surfaced.

### What Prismatic Supports

- `componentManifests()` takes any number of components
- Config pages can have any number of connections
- No platform limit on connectors per integration
- Integration-templates repo has examples with 3+ components

### Recommendation: Connectors Array

Replace the binary `source`/`destination` with a `connectors` array. Each entry:

```yaml
connectors:
  - system: "Kyriba"
    role: source
    component: {key: "http", ...}
    connection_type: {key: "apiKey", ...}
    connection: customer_activated
    connection_existing: {stableKey: "customer-usage-api", ...}
  - system: "BigQuery"
    role: destination
    component: {key: "google-cloud-bigquery", ...}
    connection_type: {key: "serviceAccountPrivateKey", ...}
    connection: org_activated
    connection_existing: {stableKey: "28da612e...", ...}
  - system: "Slack"
    role: auxiliary
    component: {key: "slack", ...}
    connection_type: {key: "oauth2", ...}
    connection: customer_activated
    connection_existing: none
```

### Impact

This is the highest-impact structural change. It touches:
- `integration.yaml` (groups, required items, includes)
- Domain YAML files (replace source/destination with connector iteration)
- `update-tasks.ts` (iterate over connectors array)
- `record-choices.ts` (connection gates per connector)
- `validate-requirements.ts` (validate each connector)
- `code-plan.ts` (emit per-connector patterns)
- `scaffold-project.ts` (pass all component keys)
- `cni-builder.md` (connector workflow)
- `build-integration.md` (scaffold step)
- Code generation patterns (componentRegistry, configPages, flows)

**Recommend planning as a dedicated refactor, not a quick fix.**

---

## Issue 3: Question Flow — Sequential One-by-One

### Current State

The agent asks one question per message, waits for response, writes the answer, re-syncs. The command procedure enforces this: "Present exactly ONE question per message."

For connections, the flow is: find component → ask auth type → search connections → ask strategy → next system. This creates a tedious back-and-forth that compounds with Issue 2 (more systems = more sequential rounds).

### What Would Be Better

Find ALL components upfront (already happening — parallel `find-components` calls). Then search ALL existing connections in one batch. Then present the full picture:

"Here's what I found:
- HTTP has an existing API key connection (customer-usage-api) ✓
- BigQuery has an existing service account connection (28da612e) ✓
- Slack has no preconfigured connection — want to create one?

Want to use the existing connections and create one for Slack?"

This collapses 6-8 sequential questions into 1-2.

### What's Blocking This

1. **Binary framing (Issue 2)** — Only source/destination slots exist, so connections must be handled sequentially per-slot.
2. **One-at-a-time instruction** — The agent is explicitly told "ONE question per message."
3. **Spec item conditions** — Connection search depends on component being answered first, which depends on system being answered first. Each item has `depends_on` chains.

### Recommendation

Short-term: After all components are found, batch-search connections for all systems in parallel before asking any connection questions. The search results inform a combined presentation. Update the connection search spec items to depend on ALL components, not just their own system's component.

Long-term: The connectors array (Issue 2) enables this naturally — one batch search for all connectors.

---

## Issue 4: Config Pages as Free Text

### Current State

`config_page_elements` is `type: text` — a single free-form string. The user writes "Slack channel selector, polling frequency, API endpoint" and the agent interprets it during code gen. There is no structured representation of pages, elements, types, data source bindings, or ordering.

### Problem

The agent must infer: which page each element goes on, what type it is (configVar, dataSource, connection), what stable key to use, which data source to bind, which connection it depends on. This inference is unreliable — especially for data source bindings which depend on knowing which component provides the data source.

### What V1 Does

V1 doesn't use a spec for config pages. It generates them directly from the component's manifest — connections become `connectionConfigVar`, data sources become `dataSourceConfigVar`, and the agent adds `configVar` for anything else.

### Recommendation

Replace with a structured array. Each entry:

```yaml
config_page_elements:
  type: structured
  items:
    - label: "Slack Channel"
      element_type: dataSource
      data_source: slackSelectChannels
      connection: "Slack Connection"
      page: "Settings"
    - label: "Polling Frequency"
      element_type: configVar
      data_type: schedule
      page: "Settings"
```

The `update-tasks` script could auto-populate entries from component search results (every component with data sources gets entries). The agent would then ask the user to confirm/modify rather than interpret free text.

**Plan alongside Issue 2.**

---

## Issue 5: Testing Phase

### Current State

The build-integration command has a `<test-workflow>` with 5 substeps: check instance via Orby → surface designer URL → confirm configuration → run test → report results.

### Problem

In practice, the agent skips straight to "deployed, done!" or fires off a test without configuring the system instance first. Three causes:

1. **Orby dependency** — The test step relies on Orby to find the test instance and surface its URL. If Orby doesn't trigger or returns incomplete info, the agent has no fallback.
2. **No understanding of system instance** — The agent doesn't understand that `prism integrations:import` creates a system/test instance that needs connections configured before testing works. It treats deploy as "done" rather than "ready to configure."
3. **Deploy script output** — The `deploy-integration.ts` output says "Next steps: View and configure integration in the web app" as plain text. The agent may not parse this as "stop and guide the user."

### What the Agent Should Know

- After import, a system instance exists automatically
- It needs: connections configured (OAuth flows completed, API keys entered), config variables set
- The `--open` flag opens the designer where this happens
- Tests will FAIL if the system instance isn't configured
- The agent must NOT proceed to testing until the user confirms configuration

### Recommendations

1. **Post-deploy directive in script output:** Add XML to `deploy-integration.ts` output:
   ```xml
   <post-deploy>
     Integration imported. System instance needs configuration before testing.
     Guide the user to configure connections and config variables in the designer.
     Do NOT run tests until user confirms configuration is complete.
   </post-deploy>
   ```

2. **Reduce Orby dependency:** The deploy script could output the designer URL directly (it knows the integration ID from the import result). The agent doesn't need Orby for this.

3. **Test script pre-flight:** The `test-integration.ts` script already checks for unconfigured connections (lines 255-279). Surface this check result as a gate: if connections are unconfigured, output a directive instead of proceeding.

---

## Issue 6: Error Handling Pattern (V1/V2 Comparison)

### Current State

V2 uses a custom inline error hook:
```typescript
hooks: {
  error: (error: unknown) => {
    if (error instanceof ConnectionError) throw error;
    if (error && typeof error === "object" && "response" in error) { ... }
    throw new Error(msg);
  },
}
```

V1 uses `import { handleErrors } from "@prismatic-io/spectral/dist/clients/http"` which extracts Axios response data (status, body, headers).

### Assessment

V2's hook is functionally equivalent to V1's `handleErrors` — it re-throws ConnectionError and extracts Axios response data. The difference: V1 imports from an internal `dist/` path (not public API), V2 uses inline code (no internal imports). V2's approach is more portable but wasn't catching Axios data until we added the `"response" in error` check.

### Status

Fixed. V2's error hook now catches Axios errors and extracts response data. No internal imports.

---

## Issue 7: OAuth2 Connection API

### Current State

V2's connection template used `connection()` for OAuth2 connections. V1 uses `oauth2Connection()` from the spectral public API, which enforces required OAuth2 fields (authorizeUrl, tokenUrl, scopes, clientId, clientSecret) at the type level.

### Status

Fixed. V2's template now imports `oauth2Connection` and `OAuth2Type` from `@prismatic-io/spectral` and uses `OAuth2Type.AuthorizationCode` enum.

---

## Issue 8: Polling Triggers

### Current State

V2 had no polling trigger documentation or patterns. Only webhook triggers. The spectral SDK exports `pollingTrigger` as a separate function with `context.polling.getState()`/`setState()`/`invokeAction()`.

### Status

Fixed. `trigger-patterns.md` now documents the polling trigger pattern. The component spec's `polling_support` item is no longer gated behind "no webhooks" — components can have both.

---

## Issue 9: Component Display Category

### Current State

V2's `index.ts.template` was missing `display.category`. V1 always sets `"Application Connectors"`.

### Status

Fixed. Template now includes `category: "Application Connectors"`.

---

## Issue 10: Private Component Manifests

### Current State

The `cni-component-manifest` command needs `--private` for private (non-marketplace) components. The scaffold script now supports `--private-components`, and we added an `install-manifest` synthetic tool that auto-detects public/private.

### Remaining Risk

The spectral manifest generator may have bugs with private org-published components (reported in feedback as "appears to fail when targeting private/custom org components"). This is a spectral issue, not a plugin issue.

---

## Issue 11: AskUserQuestion Usage

### Current State

The `update-tasks` script emits `<use-ask-user-question>` with choices for ALL pending items with ≤4 options. The agent instructions say "prefer AskUserQuestion for any choice with ≤4 options, present conversationally for 5+ or multi_choice."

### Remaining Gap

The modify-integration spec's `modification_scope` has 8 multi_choice options — the agent tried to use AskUserQuestion for it and hit a schema validation error. Fixed by adding explicit instruction: multi_choice items with 5+ options must be conversational.

---

## Issue 12: Connection Stable Keys

### Current State

Default stable key format: `${sessionName}-${componentKey}-${connectionKey}`. More specific than the previous `${componentKey}-${connectionKey}` which produced generic keys like `http-apiKey`.

---

## Issue 13: Test Data Location

### Current State

Test payloads now write to `.spectral/flows/<flow-key>/payloads/` (VS Code extension format). The `test-integration.ts` script reads from `.spectral/` first, falls back to `test-data/`. Format: `{ headers, data, contentType }`.

---

## Issue 14: System Instance / Test Runner Understanding

### Problem

The agent doesn't distinguish between:
- **System instance** — auto-created on import, used for testing in the designer
- **Customer instances** — created for real customers, deployed to production

The agent treats deploy as the final step rather than the beginning of the test phase. After import, it should guide the user through configuring the system instance (connections, config vars) before running tests.

### Status

The command procedure has the right steps. Enforcement is via the `<test-workflow>` XML in the command and the planned post-deploy directive in script output. Not yet confirmed working in practice.

---

## Priority Ordering

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 1 | Connectors array (Issue 2) | High | Highest — enables Issues 3, 4 |
| 2 | Batch connection search (Issue 3) | Medium | High — reduces question count |
| 3 | Post-deploy test guidance (Issue 5) | Low | High — fixes "deployed, done!" gap |
| 4 | Config pages structure (Issue 4) | Medium | Medium — better code gen accuracy |
| 5 | Progressive cookbook loading (Issue 1) | Low | Medium — saves context |
| 6 | All other fixes | Done | — |
