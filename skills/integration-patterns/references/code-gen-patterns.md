# Code Generation Patterns — Integration Builder

Load this reference at the start of the code generation phase.

## Required Files
| File | Must contain |
|------|-------------|
| `src/componentRegistry.ts` | Import from manifests, export `componentManifests()` array |
| `src/configPages.ts` | Use `configVar()`, `connectionConfigVar()`, `dataSourceConfigVar()` wrappers — not plain objects |
| `src/flows.ts` or `src/flows/index.ts` | `onExecution` with config access via `context.configVars`. Multi-flow uses directory with barrel export. |
| `src/index.ts` | Export `integration()` with display, flows, configPages, componentRegistry |
| `src/documentation.md` | Document all config variables, connections, flow logic |
| `.spectral/flows/<flow-key>/payloads/sample-payload.json` | Test payload in VS Code extension format: `{ headers, data, contentType }` |

<connection-code-rules>
  <rule name="follow-code-plan">
    <always>The `code-plan` output includes a `<connection-patterns>` block for each connector</always>
    <always>Follow the pattern it specifies — customerActivatedConnection, manifest_helper, connectionConfigVar_inline, or organizationActivatedConnection</always>
    <never>Guess which connection pattern to use — the code-plan determines it based on whether an SCV exists</never>
  </rule>
  <rule name="scv-prerequisite">
    <always>`customerActivatedConnection()` and `organizationActivatedConnection()` require a pre-existing SCV</always>
    <always>If no SCV exists, use the manifest helper pattern (component exists) or connectionConfigVar (no component)</always>
    <forbidden>Using customerActivatedConnection() with a stableKey that doesn't match an existing SCV — deploy will fail</forbidden>
  </rule>
  <rule name="org-activated-placement">
    <always>`organizationActivatedConnection()` goes in `scopedConfigVars` on integration() — NOT in configPages</always>
    <always>Access in onExecution requires a typed cast since scopedConfigVars aren't in the ConfigVars type</always>
  </rule>
</connection-code-rules>

<webhook-patterns>
  <rule name="component-trigger">
    <always>Check `src/manifests/<component>/triggers/` for a built-in trigger first</always>
    <always>If one exists, use it as `onTrigger` — it handles HMAC validation and webhook lifecycle automatically</always>
    <always>Import: `import { triggerName } from "./manifests/<component>/triggers/<key>"`</always>
  </rule>
  <rule name="no-component-trigger-no-lifecycle">
    <always>Skip `onTrigger` entirely — extract data in `onExecution` via `params.onTrigger.results`</always>
  </rule>
  <rule name="no-component-trigger-with-lifecycle">
    <required>`onTrigger: async (_context, payload) => ({ payload })` passthrough</required>
    <why>Lifecycle handlers require onTrigger to exist</why>
  </rule>
  <rule name="webhook-lifecycle-with-component">
    <always>The component trigger's `webhookLifecycleHandlers.create/.delete` handle registration automatically</always>
    <always>These also fire in listening mode (test runner), which `onInstanceDeploy`/`onInstanceDelete` do not</always>
  </rule>
  <rule name="webhook-lifecycle-without-component">
    <always>Use `webhookLifecycleHandlers: { create: async (context, params) => {...}, delete: async (context, params) => {...} }` on the flow</always>
    <required>Use `crossFlowState` (not `instanceState`) in lifecycle handlers</required>
    <required>Handlers must be idempotent</required>
  </rule>
  <rule name="general-setup-teardown">
    <always>Use `onInstanceDeploy`/`onInstanceDelete` for non-webhook resources (folders, record types)</always>
  </rule>
</webhook-patterns>

<code-rules>
  <rule name="component-actions">
    <always>Import actions from manifest and call `.perform()`</always>
    <forbidden>Using `context.components.<key>.<action>()` — not available in integrations</forbidden>
  </rule>
  <rule name="action-results">
    <always>Check the manifest's `examplePayload` for the action before assuming the response type</always>
    <always>If `examplePayload` is missing, cast as `unknown` and add `logger.info(JSON.stringify(result))` to verify shape</always>
  </rule>
  <rule name="flow-generics">
    <always>`flow({...})` without generics</always>
    <never>Add type annotations to callback parameters</never>
  </rule>
  <rule name="lifecycle-state">
    <forbidden>Using `instanceState` in `onInstanceDeploy`/`onInstanceDelete`</forbidden>
    <required>Use `crossFlowState` in lifecycle handlers</required>
  </rule>
  <rule name="state-concurrency">
    <always>State is written in its entirety — NOT concurrency-safe</always>
    <always>For record ID mapping between systems, prefer the destination system's externalId field over state</always>
    <why>Avoids race conditions and survives failed executions</why>
  </rule>
  <rule name="imports">
    <always>Import only from `@prismatic-io/spectral`</always>
    <never>Import from internal paths like `@prismatic-io/spectral/dist/...`</never>
  </rule>
  <rule name="queue-config">
    <always>QueueConfig uses flat shape: `usesFifoQueue`, `concurrencyLimit`, `singletonExecutions`, `dedupeIdField`</always>
  </rule>
  <rule name="cast-patterns">
    <always>`as unknown as MyType` for payloads, `as Record<string, unknown>` for component results</always>
  </rule>
</code-rules>

<integration-rules>
  <rule name="no-client-ts">
    <forbidden>Generating `src/client.ts` for integrations that use component manifests</forbidden>
    <required>All HTTP calls go through the component's `.perform()` method</required>
    <why>`client.ts` is a component-only pattern — CNIs use manifest actions or direct SDK clients</why>
  </rule>
  <rule name="icon-path">
    <always>`iconPath` in `integration()` must be `"icon.png"`</always>
    <never>Use `"assets/icon.png"` — webpack copies assets/ contents to dist/ root, so the built path is just `icon.png`</never>
  </rule>
  <rule name="trigger-config">
    <always>Generate `.spectral/trigger-config.json` during code gen for webhook flows</always>
    <always>Format: `{ "flows": { "<flow-key>": { "payload": ".spectral/flows/<flow-key>/payloads/sample-payload.json" } } }`</always>
  </rule>
</integration-rules>

<polling-rules>
  <rule name="polling-with-registry">
    <always>`PollingFlow.onTrigger` accepts ONLY an inline `PollingTriggerPerformFunction`</always>
    <forbidden>Using a component trigger reference (`TriggerReference`) as `onTrigger` on a polling flow</forbidden>
    <why>The types are incompatible — `PollingFlow` requires inline function, not `TriggerReference`</why>
  </rule>
  <rule name="polling-inline">
    <always>Polling flow's `onTrigger` must be an inline function using `context.polling.getState()`/`setState()`</always>
    <always>Component actions remain available in `onExecution` even in polling flows</always>
  </rule>
</polling-rules>

<registry-rules>
  <rule name="manifest-imports">
    <always>Import: `import slack from "./manifests/slack"` (component key as variable name)</always>
    <always>Export: `export const componentRegistry = componentManifests({ slack })`</always>
  </rule>
  <rule name="manifest-generation">
    <forbidden>Creating manifests manually — they are auto-generated during scaffolding</forbidden>
  </rule>
  <rule name="no-component-fallback">
    <always>If no component exists in the registry, use direct HTTP calls with axios from Spectral SDK</always>
    <forbidden>Fabricating a component key like "http"</forbidden>
  </rule>
</registry-rules>
