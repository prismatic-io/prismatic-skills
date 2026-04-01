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

## Flow Patterns
- **Webhook with component trigger:** Check `src/manifests/<component>/triggers/` for a built-in trigger. If one exists, use it as `onTrigger` — it handles HMAC validation and webhook lifecycle automatically. Import: `import { triggerName } from "./manifests/<component>/triggers/<key>"`.
- **Webhook without component trigger, no lifecycle hooks:** Skip `onTrigger`. Extract data in `onExecution` via `params.onTrigger.results`.
- **Webhook without component trigger, with lifecycle hooks:** Must include `onTrigger: async (_context, payload) => ({ payload })`.
- **Webhook auto-registration (no component trigger):** Use `onInstanceDeploy`/`onInstanceDelete` for webhook create/delete. Requires pass-through `onTrigger`.
- `onExecution`: config via `context.configVars["varKey"]`, connection fields via `.fields.signingSecret`, `.token?.access_token`
- Component actions: Import from manifest, call `.perform()`. Do not use `context.components.<key>.<action>()`.
- Action result shapes: Check the manifest's `examplePayload` for the action before assuming the response type. If `examplePayload` is missing, cast the result as `unknown` and add `logger.info(JSON.stringify(result))` during testing to verify the actual shape. Common mistake: assuming a singleton return when the API returns an array.
- `flow({...})` without generics. Do not add type annotations to callback parameters.
- `instanceState` never in `onInstanceDeploy`/`onInstanceDelete` — use `crossFlowState`.
- State is written in its entirety — NOT concurrency-safe. For record ID mapping between systems (e.g., GitHub issue → Zendesk ticket), prefer using the destination system's externalId field instead of storing a mapping in state. This avoids race conditions and survives failed executions.
- Import only from `@prismatic-io/spectral`.
- QueueConfig: flat shape (`usesFifoQueue`, `concurrencyLimit`, `singletonExecutions`, `dedupeIdField`).
- Cast patterns: `as unknown as MyType` for payloads, `as Record<string, unknown>` for component results.

## Component Registry
- Import: `import slack from "./manifests/slack"` (component key as variable name)
- Export: `export const componentRegistry = componentManifests({ slack })`
- Manifests are auto-generated during scaffolding — never create manually
- If a component doesn't exist in the registry (find-components returns nothing), use direct HTTP calls with axios from the Spectral SDK — do NOT fabricate a component key like "http"
