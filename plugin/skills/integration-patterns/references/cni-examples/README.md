# CNI Examples Directory

**Purpose**: Help agents quickly locate relevant Code Native Integration patterns and examples.

**Usage**: Search this file for keywords related to your task, then read the referenced file(s).

---

## Files by Topic

### Fundamental Concepts

**basic-api-to-slack.md** - Core CNI concepts and structure

- Flow structure (onTrigger, onExecution)
- Configuration variables (configPages)
- HTTP requests with axios
- Logging for debugging
- External SDKs (Slack WebClient)
- Basic error handling
- Return values and execution data
- **Use for**: First integration, understanding basics, simple API flows

**config-patterns-correct-vs-incorrect.md** - Correct config patterns

- Shows CORRECT vs INCORRECT patterns side-by-side
- Every config element MUST use wrapper functions (configVar, connectionConfigVar, dataSourceConfigVar)
- Valid property names for each config type
- Complete working examples with all config types
- Common mistakes to avoid
- **Use for**: EVERY integration - prevents common code generation errors

**oauth-connection.md** - OAuth2 authentication patterns

- OAuth2 connectionConfigVar setup
- Using Prismatic components for OAuth
- Token management (access, refresh, instance URL)
- Creating authenticated clients (jsforce, Salesforce)
- Permission and visibility types
- Environment variables for secrets
- OAuth error handling
- **Use for**: Any OAuth2 integration (Salesforce, Google, Slack, etc.), token lifecycle

**integration-agnostic-connections.md** - Reusable connections across integrations

- Three types: Customer-Activated, Org-Activated Customer, Org-Activated Global
- Decision flowchart for choosing the right type
- Code examples for all three types in configPages.ts and index.ts
- **Use for**: Any integration needing OAuth or API key connections
- **Search available**: `prismatic-tools search-connections [keyword]`

**multi-flow.md** - Multiple flows in one integration

- Defining multiple flows
- Sharing configuration across flows
- onTrigger vs onExecution split
- Scheduled flow patterns
- Webhook flows with XML parsing
- Lifecycle hooks (onInstanceDeploy, onInstanceDelete) - see lifecycle-events.md for comprehensive guide
- Sharing data between flows - see state-persistence.md for detailed patterns
- **Use for**: Bidirectional syncs, event + maintenance, webhook + scheduled ops

**lifecycle-events.md** - Instance management lifecycle events (COMPREHENSIVE)

- onInstanceDeploy and onInstanceDelete complete reference
- When and why to use lifecycle hooks
- Context object properties and methods
- Performance constraints and idempotency
- Common patterns: webhook registration, resource initialization, validation, state setup
- Multi-flow coordination with lifecycle events
- Best practices and troubleshooting
- **Use for**: Webhook management, resource setup/cleanup, configuration validation, initial state

**state-persistence.md** - Data persistence across executions (COMPREHENSIVE)

- All four state types: execution, flow, cross-flow, integration
- When to use each state type (decision tree)
- State methods and access patterns
- Critical limitations: size limits, race conditions, failure behavior
- Common patterns: incremental sync, caching, rate limiting, multi-flow coordination
- When to use external storage vs state
- Best practices for concurrent scenarios
- **Use for**: ANY integration that needs to remember data between executions

### User Experience

**data-sources.md** - Dynamic configuration dropdowns

- dataSourceConfigVar for dropdowns
- Fetching options from authenticated APIs
- Pagination for large result sets
- Dependencies on other config vars
- Element structure (key/label pairs)
- Error handling in data sources
- **Use for**: User selects from API data (channels, folders), multi-tenant scenarios, dynamic options

**json-forms.md** - Complex form-based configuration UIs

- dataSourceConfigVar with dataSourceType: "jsonForm"
- Practical examples and common patterns
- Accessing other config vars in perform function
- Field mapping forms, dynamic schemas, conditional fields
- Error handling and testing
- **Use for**: Field mapping UIs, complex multi-field configuration, structured data collection
- **CRITICAL**: Use dataSourceConfigVar NOT configVar, use dataSourceType NOT dataType, NEVER use "as any"

**json-forms-schema-guide.md** - JSON Schema and UI Schema reference

- Complete field type reference (string, number, boolean, enum, date, array, object)
- Validation rules and patterns
- UI layout options (vertical, horizontal, group, tabs)
- Conditional display rules
- Array UI options (accordion, table)
- Advanced patterns and complete examples
- **Use for**: Looking up specific schema options, validation patterns, layout configurations

**templated-connections.md** - Dynamic connection configuration

- templateConnectionInputs() function usage
- Deriving OAuth URLs from user input
- Multi-tenant connection patterns
- Regional endpoint configuration
- Reducing configuration complexity
- **Use for**: Customer-specific subdomains, multi-region, custom domains, environment-based endpoints

### Using Component Manifests

**using-components.md** - Component manifest usage (RECOMMENDED)

- Installing component manifests with `prismatic-tools install-manifest`
- Registering components in `componentRegistry.ts`
- Using connection helpers from manifests
- Using data source helpers from manifests
- Accessing component actions via `context.components`
- Complete working example with Slack and Salesforce
- **Use for**: ALL integrations with external systems (Slack, Salesforce, etc.)

**component-auth-patterns.md** - Understanding authentication patterns

- Using manifest connection helpers (OAuth, API key, Basic auth)
- Permission and visibility configuration
- OAuth scope management
- Error handling for auth failures
- Troubleshooting authentication issues
- **Use for**: Configuring OAuth, API keys, debugging auth issues

### Production Patterns

**error-handling.md** - Error handling strategies

- Fatal vs non-fatal errors
- User-friendly error messages
- Retry logic with exponential backoff
- Partial failure handling
- Troubleshooting checklists
- **Use for**: Production-ready error handling, graceful degradation

**webhook-patterns.md** - Webhook parsing and validation

- XML parsing with fast-xml-parser
- JSON parsing with schema validation
- Webhook signature verification
- Immediate response patterns
- **Use for**: Receiving webhooks, parsing payloads, security

**data-transformation.md** - Data transformation patterns

- Field mapping between systems
- Type conversions (string→number, date formats)
- Nested data flattening
- Data enrichment (computed fields)
- **Use for**: Transforming data between different APIs, field mapping

**testing-debugging.md** - Testing and debugging guide

- prism CLI commands for testing
- Local development workflow
- Debugging common issues
- Unit and integration testing
- **Use for**: Testing integrations, debugging issues, development workflow

**github-examples-reference.md** - Official GitHub examples directory

- All 6 official examples with descriptions
- Direct links to specific files and patterns
- Comparison matrix of features
- Example selection guide
- Pattern quick reference
- **Use for**: Finding real-world examples, learning from production code

---

## Quick Lookup by Task

### Task: Authenticate with OAuth2

Files: `oauth-connection.md`, `integration-agnostic-connections.md`, `component-auth-patterns.md`
Sections: oauth-connection.md (complete setup), integration-agnostic-connections.md (connection types), component-auth-patterns.md (understanding patterns)

### Task: Choose the right connection type

Files: `integration-agnostic-connections.md`
Sections: All - decision flowchart, when to use each type, comparison table

### Task: Use existing platform connections (customer-activated)

Files: `integration-agnostic-connections.md`
Sections: Customer-Activated connections section

### Task: Configure organization-managed connections

Files: `integration-agnostic-connections.md`
Sections: Organization-Activated Global, Organization-Activated Customer sections

### Task: Handle webhooks

Files: `webhook-patterns.md`, `multi-flow.md`
Sections: webhook-patterns.md (parsing, validation), multi-flow.md (webhook flow example)

### Task: Transform data between systems

Files: `data-transformation.md`
Sections: All - field mapping, type conversion, flattening, enrichment

### Task: Create dynamic dropdowns

Files: `data-sources.md`
Sections: All - dataSourceConfigVar, pagination, dependencies

### Task: Create complex configuration forms

Files: `json-forms.md`, `json-forms-schema-guide.md`
Sections: json-forms.md (practical patterns), json-forms-schema-guide.md (schema reference)

### Task: Handle errors properly

Files: `error-handling.md`
Sections: All - fatal vs non-fatal, user-friendly messages, retry logic, troubleshooting

### Task: Use pre-built components

Files: `using-components.md`, `component-auth-patterns.md`
Sections: using-components.md (complete manifest workflow), component-auth-patterns.md (understanding auth)

### Task: Use component manifests

Files: `using-components.md`
Sections: All - manifest installation, registration, connection helpers, data sources, accessing actions

### Task: Handle initial baseline data collection

Files: `lifecycle-events.md`
Sections: "When to Use onInstanceDeploy vs onExecution" section with baseline data collection pattern

### Task: Build multiple flows

Files: `multi-flow.md`, `lifecycle-events.md`, `state-persistence.md`
Sections: multi-flow.md (structure), lifecycle-events.md (deployment hooks), state-persistence.md (sharing data)

### Task: Use lifecycle events (onInstanceDeploy, onInstanceDelete)

Files: `lifecycle-events.md`, `multi-flow.md`
Sections: lifecycle-events.md (complete reference), multi-flow.md (basic examples)

### Task: Persist data between executions

Files: `state-persistence.md`
Sections: All - state types, access patterns, limitations, common patterns, when to use external storage

### Task: Share data between flows

Files: `state-persistence.md`, `multi-flow.md`
Sections: state-persistence.md (cross-flow state), multi-flow.md (coordination examples)

### Task: Register/unregister webhooks

Files: `lifecycle-events.md`, `webhook-patterns.md`
Sections: lifecycle-events.md (webhook pattern), webhook-patterns.md (parsing and validation)

### Task: Handle multi-tenant / custom domains

Files: `templated-connections.md`
Sections: All - templateConnectionInputs, deriving URLs, patterns

### Task: Test and debug

Files: `testing-debugging.md`
Sections: All - prism CLI, local workflow, debugging issues, unit tests

### Task: Understand authentication for third-party API

Files: `component-auth-patterns.md`
Sections: All - inspecting clients, token refresh, common patterns

### Task: Build first integration

Files: `config-patterns-correct-vs-incorrect.md`, `basic-api-to-slack.md`, `oauth-connection.md`
Sections: config-patterns-correct-vs-incorrect.md (MUST READ FIRST), basic-api-to-slack.md (fundamentals), oauth-connection.md (if auth needed)

### Task: Generate configuration code

Files: `config-patterns-correct-vs-incorrect.md`
Sections: All - shows exact correct vs incorrect patterns for every config type

### Task: Find real-world examples

Files: `github-examples-reference.md`
Sections: All - links to 6 official examples with pattern breakdowns

---

## Keyword Index

**Configuration**: config-patterns-correct-vs-incorrect.md (MUST READ FIRST)
**configVar**: config-patterns-correct-vs-incorrect.md, basic-api-to-slack.md
**connectionConfigVar**: config-patterns-correct-vs-incorrect.md, oauth-connection.md
**dataSourceConfigVar**: config-patterns-correct-vs-incorrect.md, data-sources.md, json-forms.md
**Config mistakes**: config-patterns-correct-vs-incorrect.md
**Authentication**: oauth-connection.md, integration-agnostic-connections.md, component-auth-patterns.md
**Integration-agnostic connections**: integration-agnostic-connections.md
**Connection types**: integration-agnostic-connections.md
**customerActivatedConnection**: integration-agnostic-connections.md
**organizationActivatedConnection**: integration-agnostic-connections.md
**Webhooks**: webhook-patterns.md, multi-flow.md
**Data transformation**: data-transformation.md
**Dropdowns**: data-sources.md
**JSON Forms**: json-forms.md, json-forms-schema-guide.md
**Configuration forms**: json-forms.md, json-forms-schema-guide.md
**Field mapping**: data-transformation.md, json-forms.md
**Validation**: json-forms.md, json-forms-schema-guide.md
**Schema reference**: json-forms-schema-guide.md
**UI layouts**: json-forms-schema-guide.md
**Error handling**: error-handling.md
**Testing**: testing-debugging.md
**Component manifests**: using-components.md
**componentRegistry**: using-components.md
**context.components**: using-components.md
**Baseline data collection**: lifecycle-events.md
**Initial sync**: lifecycle-events.md
**onInstanceDeploy vs onExecution**: lifecycle-events.md
**State availability**: lifecycle-events.md, code-generation-guide.md, state-persistence.md
**Components**: using-components.md, component-auth-patterns.md
**Multi-flow**: multi-flow.md
**Multi-tenant**: templated-connections.md, data-sources.md
**Debugging**: testing-debugging.md, error-handling.md
**OAuth**: oauth-connection.md, integration-agnostic-connections.md, component-auth-patterns.md
**connectionConfigVar**: oauth-connection.md, templated-connections.md
**Security**: webhook-patterns.md, component-auth-patterns.md
**Pagination**: data-sources.md
**Retries**: error-handling.md
**Logging**: basic-api-to-slack.md, testing-debugging.md
**TypeScript**: All files use TypeScript
**Salesforce**: oauth-connection.md, data-transformation.md, github-examples-reference.md
**Slack**: basic-api-to-slack.md, data-sources.md, github-examples-reference.md
**XML**: webhook-patterns.md, multi-flow.md
**JSON**: webhook-patterns.md
**JSON Schema**: json-forms-schema-guide.md
**UI Schema**: json-forms-schema-guide.md
**Conditional display**: json-forms.md, json-forms-schema-guide.md
**Signatures**: webhook-patterns.md
**Tokens**: oauth-connection.md, component-auth-patterns.md
**Refresh tokens**: oauth-connection.md, component-auth-patterns.md
**Dynamic config**: data-sources.md, templated-connections.md
**Custom domains**: templated-connections.md
**Regional endpoints**: templated-connections.md
**Lifecycle hooks**: lifecycle-events.md, multi-flow.md
**onInstanceDeploy**: lifecycle-events.md
**onInstanceDelete**: lifecycle-events.md
**State persistence**: state-persistence.md
**instanceState**: state-persistence.md
**crossFlowState**: state-persistence.md
**integrationState**: state-persistence.md
**executionState**: state-persistence.md
**Incremental sync**: state-persistence.md
**Sync cursor**: state-persistence.md
**Sharing data between flows**: state-persistence.md, multi-flow.md
**Scheduled flows**: multi-flow.md
**Rate limiting**: component-auth-patterns.md
**Exponential backoff**: error-handling.md
**Partial failures**: error-handling.md
**Unit testing**: testing-debugging.md
**Integration testing**: testing-debugging.md
**prism CLI**: testing-debugging.md
**Field mapping**: data-transformation.md, json-forms.md
**Type conversion**: data-transformation.md
**Data flattening**: data-transformation.md
**Data enrichment**: data-transformation.md
**Form layout**: json-forms.md
**Conditional display**: json-forms.md
**Schema validation**: json-forms.md
**dataSourceConfigVar**: data-sources.md, json-forms.md
**configVar**: All files (basic config vars)
**HTTP requests**: basic-api-to-slack.md
**axios**: basic-api-to-slack.md
**jsforce**: oauth-connection.md
**HubSpot**: data-transformation.md
**API Key auth**: component-auth-patterns.md
**Bearer token**: component-auth-patterns.md
**HMAC**: component-auth-patterns.md
**Basic auth**: component-auth-patterns.md
**GitHub examples**: github-examples-reference.md
