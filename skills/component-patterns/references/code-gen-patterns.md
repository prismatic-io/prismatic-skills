# Code Generation Patterns — Component Builder

Load this reference at the start of the code generation phase.

## Required Structure (ALL connectors)
- `src/client.ts` — function-based `createClient` returning `HttpClient` (NOT class-based)
- `src/inputs/` — folder with all input definitions (NEVER inline in actions)
- `src/actions/` — folder tree: `actions/<resource>/<verb><Resource>.ts`, one action per file
- `src/actions/misc/rawRequest.ts` — REQUIRED raw HTTP request action in every component
- `src/examplePayloads/` — folder with verified payloads imported by each action
- `src/connections.ts` — connection definitions
- `src/dataSources/` — folder with data source definitions
- `src/triggers/` — folder with trigger definitions
- `src/types.ts` — API resource type definitions
- `src/index.ts` — component definition with error hook, `category: "Application Connectors"`, dataSources import
- Barrel exports (`index.ts`) at every folder level using spread pattern

## Connector Components — Required Patterns
- `createClient(connection, context.debug.enabled)` in every action perform — function-based, returns HttpClient
- `ConnectionError` thrown in client.ts for connection type mismatches (NOT in actions)
- Error hook: re-throw ConnectionError, extract Axios response data (status, body), wrap others
- `display.category: "Application Connectors"` on all connector components
- OAuth2 connections: use `oauth2Connection()` from spectral (NOT `connection()`), use `OAuth2Type.AuthorizationCode` enum, include `scopes` input
- Connection keys: reference via imported constant (`apiKeyConnection.key`), NOT hardcoded strings
- `examplePayload` on every action — imported from `src/examplePayloads/`, verified against API
- `clean` function on every non-connection input: `util.types.toString`, `util.types.toBool`, `util.types.toNumber`
- `placeholder` and `example` on every string/text input
- `comments` on every input
- All HTTP calls through the client helper — NEVER raw `fetch` or `axios` in actions
- Action return values: always `{ data: <result> }` format
- Data source return: `{ result: Element[] }` with `{ label, key }` format (NOT `{ label, value }`)
- Webhook triggers: `onInstanceDeploy` + `onInstanceDelete`, webhook URL via `context.webhookUrls[context.flow.name]`
- Trigger perform return: `Promise.resolve({ payload: { headers, body, rawBody, contentType } })`
- Connection keys: simple names (`"apiKey"`, `"oauth2"`) — NOT `"component-api-key"`

## Utility Components — Required Patterns
- Same input requirements: `clean`, `comments`, `placeholder`, `example`
- Same `examplePayload` on every action
- Same `{ data }` return wrapper
- Same folder structure for actions and inputs
- `hooks: { error: (error) => { ... } }` on component definition

## Common Patterns
- Import from `@prismatic-io/spectral` (exception: `@prismatic-io/spectral/dist/clients/http` for `createClient` and `HttpClient` only)
- Use `util.types` for clean functions
- Inputs destructured in perform: `async (context, { connection, fieldName }) => { ... }`
- Debug wiring: `context.debug.enabled` → `createClient(connection, debug)`
