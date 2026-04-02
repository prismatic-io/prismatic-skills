# Code Generation Patterns — Component Builder

Load this reference at the start of the code generation phase.

## Required Structure (ALL connectors)

| Path | Purpose |
|------|---------|
| `src/client.ts` | Function-based `createClient` returning `HttpClient` |
| `src/inputs/` | Folder with all input definitions |
| `src/actions/<resource>/<verb><Resource>.ts` | One action per file |
| `src/actions/misc/rawRequest.ts` | Raw HTTP request action (required in every component) |
| `src/examplePayloads/` | Verified payloads imported by each action |
| `src/connections.ts` | Connection definitions |
| `src/dataSources/` | Data source definitions |
| `src/triggers/` | Trigger definitions |
| `src/types.ts` | API resource type definitions |
| `src/index.ts` | Component definition with error hook, `category`, dataSources import |
| `index.ts` at every folder level | Barrel exports using spread pattern |

<connector-rules>
  <rule name="client-pattern">
    <always>`createClient(connection, context.debug.enabled)` in every action perform</always>
    <always>Function-based, returns `HttpClient`</always>
    <forbidden>Class-based client pattern</forbidden>
  </rule>
  <rule name="connection-errors">
    <always>Throw `ConnectionError` in client.ts for connection type mismatches</always>
    <forbidden>Throwing ConnectionError in action files</forbidden>
  </rule>
  <rule name="error-hook">
    <required>Error hook on component: re-throw ConnectionError, extract Axios response data (status, body), wrap others</required>
  </rule>
  <rule name="display-category">
    <required>`display.category: "Application Connectors"` on all connector components</required>
  </rule>
  <rule name="oauth2-connections">
    <always>Use `oauth2Connection()` from spectral with `OAuth2Type.AuthorizationCode` enum</always>
    <always>Include `scopes` input</always>
    <forbidden>Using `connection()` for OAuth2 — use `oauth2Connection()`</forbidden>
  </rule>
  <rule name="connection-keys">
    <always>Reference via imported constant: `apiKeyConnection.key`</always>
    <always>Simple key names: `"apiKey"`, `"oauth2"`</always>
    <forbidden>Hardcoded string keys like `"component-api-key"`</forbidden>
  </rule>
  <rule name="example-payloads">
    <required>`examplePayload` on every action — imported from `src/examplePayloads/`, verified against API</required>
  </rule>
  <rule name="input-requirements">
    <required>`clean` function on every non-connection input: `util.types.toString`, `util.types.toBool`, `util.types.toNumber`</required>
    <required>`placeholder` and `example` on every string/text input</required>
    <required>`comments` on every input</required>
    <forbidden>Inline input definitions in action files — all inputs go in `src/inputs/`</forbidden>
  </rule>
  <rule name="http-calls">
    <always>All HTTP calls through the client helper from `createClient()`</always>
    <forbidden>Raw `fetch` or `axios` calls in actions — bypasses error handling and connection validation</forbidden>
  </rule>
  <rule name="return-shapes">
    <always>Action return: `{ data: <result> }`</always>
    <always>Data source return: `{ result: Element[] }` with `{ label, key }` format</always>
    <forbidden>`{ label, value }` in data source elements — use `{ label, key }`</forbidden>
  </rule>
  <rule name="trigger-patterns">
    <always>Webhook triggers: `onInstanceDeploy` + `onInstanceDelete`, webhook URL via `context.webhookUrls[context.flow.name]`</always>
    <always>Trigger perform return: `Promise.resolve({ payload: { headers, body, rawBody, contentType } })`</always>
  </rule>
</connector-rules>

<utility-rules>
  <rule name="utility-same-as-connector">
    <required>Same input requirements: `clean`, `comments`, `placeholder`, `example`</required>
    <required>Same `examplePayload` on every action</required>
    <required>Same `{ data }` return wrapper</required>
    <required>Same folder structure for actions and inputs</required>
    <required>`hooks: { error: (error) => { ... } }` on component definition</required>
  </rule>
</utility-rules>

<common-rules>
  <rule name="imports">
    <always>Import from `@prismatic-io/spectral`</always>
    <always>Exception: `@prismatic-io/spectral/dist/clients/http` for `createClient` and `HttpClient` only</always>
  </rule>
  <rule name="clean-functions">
    <always>Use `util.types` for clean functions</always>
  </rule>
  <rule name="perform-signature">
    <always>Inputs destructured in perform: `async (context, { connection, fieldName }) => { ... }`</always>
  </rule>
  <rule name="debug-wiring">
    <always>`context.debug.enabled` → `createClient(connection, debug)`</always>
  </rule>
</common-rules>
