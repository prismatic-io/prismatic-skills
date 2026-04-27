# Cyclr Export Parsing Guide

How to interpret the output of the Cyclr export parser to produce a standard integration schema.

## Summary Mode

For multi-cycle exports or quick scope assessment, use `--summary` first:

```bash
prismatic-tools parse-export <export-path> --platform cyclr --summary
```

The summary includes:
- **counts**: Total cycles, steps, connectors, edges, variables, field mappings, parameter mappings
- **cycles**: Per-cycle overview with step names, connector names, execution order, and counts
- **connectors**: Deduplicated connector names with auth types and versions
- **data_flow_overview**: Per-step counts of field and parameter mappings

Use this to understand the integration scope before reading the full output selectively.

## Identifying the Trigger Step

The trigger step is the cycle's entry point. Identify it by:

1. **First in execution_order** — The topological sort places steps with no incoming edges first
2. **ActionType=5 (Webhook)** — Explicitly a webhook-triggered step
3. **Interval > 0 (Polling)** — A step with an `interval` field is a polling trigger (value is seconds)
4. **No incoming edges** — Check the `edges` array; the trigger step has no edge where it appears as `head_step_id`

In the parser output:
```json
"execution_order": [
  {"step_id": "08dc42d7-...", "step_name": "List Surveys"},
  {"step_id": "08dc42d7-...", "step_name": "List Collectors by Survey ID"},
  ...
]
```

The first entry is the trigger/entry point. If it has `"interval": 60` in its step data, it's a polling trigger that runs every 60 seconds.

## Tracing the Step Graph

The step graph defines execution order. Use the `execution_order` array for the linear sequence, and `edges` for understanding branching:

```
List Surveys → List Collectors by Survey ID → List New Responses → Upsert Users
```

Each edge has:
- `tail_step_id`: The predecessor step (runs first)
- `head_step_id`: The successor step (runs after)
- `edge_type`: The type of connection (0=standard, 1=data-passing)

For cycles with decision steps (ActionType=2), there may be multiple edges from a single step — one for the true branch and one for the false branch.

### Reading the Graph from Parser Output

```json
"edges": [
  {"tail_step_id": "08dc42d7-b185-...", "head_step_id": "08dc42d7-c76a-...", "edge_type": 1},
  {"tail_step_id": "08dc42d7-c76a-...", "head_step_id": "08dc42d7-b966-...", "edge_type": 1},
  {"tail_step_id": "08dc42d7-b966-...", "head_step_id": "08dc33ed-77b6-...", "edge_type": 1}
]
```

Follow edges from tail to head to trace the flow. Match step IDs to names using the `steps` array.

## Interpreting Step Configurations

### Standard Actions (ActionType=1)

The most common step type. Represents an API call via a connector:

```json
{
  "id": "7efc8402-...",
  "name": "Get Lead",
  "action_type": 1,
  "method_id": "63c47bfe-...",
  "account_connector": {
    "name": "Salesforce",
    "version": "v43.0",
    "auth_type": "oauth2",
    "oauth2_type": "AuthorizationCode"
  },
  "response_fields": [
    {"id": 17462950, "connector_field": "Email"},
    {"id": 17462948, "connector_field": "LastName"}
  ]
}
```

- `account_connector` identifies the external system and auth method
- `method_id` identifies the specific API method (opaque reference to Cyclr's method catalog)
- `response_fields` define what data this step produces (available for downstream mapping)
- `request_fields` define what data this step accepts (populated from upstream mappings)

### Decision Steps (ActionType=2)

Conditional branching based on comparison logic:
- `LeftOperandType` and comparison fields define the condition
- Multiple outgoing edges represent true/false branches
- Maps to `if/else` logic in TypeScript

### Delay Steps (ActionType=3)

Pauses execution for a specified duration:
- `ActionData` contains delay configuration
- Maps to `setTimeout` or a scheduled pause in CNI

### Script Steps (ActionType=4)

Inline JavaScript execution:
- `ActionData` contains the script code as a JSON-encoded string
- Must be translated to TypeScript for CNI
- Check `ActionData` for the actual script content

### Webhook Triggers (ActionType=5)

External webhook entry points:
- Always the first step in webhook-triggered cycles
- The step receives inbound webhook payload data
- Maps to a Prismatic webhook trigger

## Interpreting Field Mappings

Field mappings connect output fields from one step to input fields of another. The parser resolves the raw `"stepId,fieldId"` references to human-readable names.

### Resolved Field Mapping Example

From the SurveyMonkey → Insider export:

```json
{
  "step_id": "08dc33ed-77b6-...",
  "step_name": "Upsert Users",
  "field_mappings": [
    {
      "target_field": "[users].identifiers.email",
      "source_reference": "08dc42d7-b966-427a-845d-e341a203a2fe,15310431",
      "mapping_type": 0,
      "resolved": true,
      "source_step_id": "08dc42d7-b966-...",
      "source_step_name": "List New Responses by Collector ID",
      "source_field": "[data].href"
    }
  ]
}
```

Reading this:
1. **Target step**: "Upsert Users" receives data
2. **Target field**: `[users].identifiers.email` — the email field in the users array
3. **Source step**: "List New Responses by Collector ID" provides data
4. **Source field**: `[data].href` — the href field from the response data array
5. **Mapping type**: 0 = dynamic (from previous step output)

### Unresolved References

If `"resolved": false`, the reference could not be matched to a known step or field. This may indicate:
- A step ID that references a step in a different cycle
- A field ID that doesn't appear in the source step's ResponseFormat
- A static value (mapping_type=1) without a step reference

## Interpreting Parameter Mappings

Parameter mappings configure step-level parameters from upstream outputs:

```json
{
  "step_name": "List Collectors by Survey ID",
  "parameter_mappings": [
    {
      "parameter_id": 1348205,
      "source_reference": "08dc42d7-b185-4b57-8610-c0873a8b4143,15310469",
      "mapping_type": 0,
      "resolved": true,
      "source_step_id": "08dc42d7-b185-...",
      "source_step_name": "List Surveys",
      "source_field": "[data].id"
    }
  ]
}
```

Reading this: The "List Collectors by Survey ID" step receives the survey ID parameter from the "List Surveys" step's `[data].id` output field.

### Static vs Dynamic Parameters

- **CycleEntityMappingType 0** = Dynamic — value comes from a previous step's output (the `"stepId,fieldId"` format)
- **CycleEntityMappingType 1** = Static — value is a literal constant (e.g., empty string, hardcoded value)

Static parameter example:
```json
{
  "parameter_id": 1469712,
  "source_reference": "",
  "mapping_type": 1,
  "is_launch_visible": false,
  "resolved": false
}
```
This is a static parameter with an empty default value — may need customer configuration.

## Extracting Connector and Auth Details

The parser deduplicates connectors across all steps. Each connector entry provides:

```json
{
  "Salesforce": {
    "name": "Salesforce",
    "connector_id": 65294,
    "version": "v43.0",
    "auth_type": "oauth2",
    "oauth2_type": "AuthorizationCode",
    "authorize_url": "https://login.salesforce.com/services/oauth2/authorize?prompt=login",
    "token_url": "https://login.salesforce.com/services/oauth2/token",
    "parameters": [
      {"id": 1469672, "target_type": "endpoint_url", "target_name": "ObjectName"},
      {"id": 1469678, "target_type": "endpoint_url", "target_name": "InstanceUrl"}
    ]
  }
}
```

**For schema building:**
- `auth_type` + `oauth2_type` → determine the Prismatic connection type
- `authorize_url` + `token_url` → populate OAuth2 config if building custom connection
- `parameters` → connector-level config that may become configVars (especially `endpoint_url` types like `InstanceUrl`)

## Extracting API Profiles

Build `api_profiles` from the request/response format fields on each step:

### Response Profile (from a source step)

```json
"response_fields": [
  {"id": 17462950, "connector_field": "Email"},
  {"id": 17462948, "connector_field": "LastName"},
  {"id": 17462946, "connector_field": "Title"}
]
```

Maps to an api_profile with role "response":
```json
{
  "name": "Salesforce Get Lead Response",
  "role": "response",
  "system": "Salesforce",
  "fields": ["Email", "LastName", "Title"]
}
```

### Request Profile (from a target step)

```json
"request_fields": [
  {"id": 12345, "connector_field": "[users].identifiers.email"},
  {"id": 12346, "connector_field": "[users].attributes.email"}
]
```

Maps to an api_profile with role "request":
```json
{
  "name": "Insider Upsert Users Request",
  "role": "request",
  "system": "Insider",
  "fields": ["[users].identifiers.email", "[users].attributes.email"],
  "body_structure": {
    "top_level_fields": ["users"],
    "nesting": {
      "users": ["identifiers", "attributes"]
    }
  }
}
```

### ConnectorField Path Notation

Cyclr uses bracket notation for arrays. When building api_profiles:
- `[arrayName].field` → the profile contains an array; note this in `body_structure`
- `parent.child` → nested object access
- Simple `fieldName` → flat top-level field

## Extracting Config Variables

Config variables come from three sources:

### 1. Cycle Variables

From the `variables` array in each cycle:
```json
"variables": [
  {"id": "...", "name": "API_BASE_URL", "value": "https://api.example.com"}
]
```

### 2. ShareFields and Launch-Visible Parameters

Parameters with `is_launch_visible: true` are customer-configurable:
```json
{
  "parameter_id": 1348205,
  "is_launch_visible": true,
  "value": ""
}
```

These map to configVars that customers set during deployment.

### 3. Connector Parameters (endpoint_url type)

Connector parameters with `target_type: "endpoint_url"` often represent environment-specific URLs:
```json
{"target_type": "endpoint_url", "target_name": "InstanceUrl"}
```

Maps to a configVar for the customer's specific instance URL.

## Interpreting Business Logic Flags

### ContinueOnNull Flags

- `continue_on_null_source: false` — Step fails if input data is null (add input validation)
- `continue_on_null_source: true` — Step proceeds even with null input (use optional chaining)
- `continue_on_null_result: false` — Step fails if output is null (add output validation)
- `continue_on_null_result: true` — Step proceeds even with null output (downstream steps handle null)

### StepCollectionSplitType

- `0` — No splitting; pass the full array/collection through
- `1` — First item only; take `array[0]`
- `2` — All items individually; iterate with `.forEach()` or `.map()`

### ActionData

JSON-encoded string containing step-specific configuration. Parse it to extract:
- Script code (for ActionType=4 script steps)
- Custom configuration for specific connector methods
- Error handling overrides

## Building the Standard Schema from Parser Output

Step-by-step assembly guide mapping parser output sections to schema sections:

### 1. Systems (from `connectors`)

Each unique connector becomes a system entry:
```json
{
  "name": "Salesforce",
  "role": "source",
  "auth_type": "oauth2",
  "auth_details": {
    "oauth2_type": "AuthorizationCode",
    "authorize_url": "https://login.salesforce.com/services/oauth2/authorize",
    "token_url": "https://login.salesforce.com/services/oauth2/token"
  }
}
```

Determine role (source/destination) by tracing data flow: the connector providing initial data is the source; the connector receiving final transformed data is the destination.

### 2. Flows (from `cycles` and `execution_order`)

Each cycle becomes a flow. Steps in execution_order become flow steps:
```json
{
  "name": "List New Responses by Collector ID",
  "steps": [
    {
      "name": "List Surveys",
      "type": "api_call",
      "system": "SurveyMonkey",
      "description": "Fetch list of surveys",
      "confidence": 0.8
    }
  ]
}
```

### 3. Data Transformations (from `data_flow`)

Resolved field mappings become transformation entries:
```json
{
  "name": "Map SurveyMonkey Response to Insider User",
  "source_step": "List New Responses by Collector ID",
  "target_step": "Upsert Users",
  "mappings": [
    {
      "from_path": "[data].href",
      "to_path": "[users].identifiers.email",
      "type": "direct"
    }
  ]
}
```

### 4. API Profiles (from step `request_fields` and `response_fields`)

Build profiles for each step's request and response formats as described in "Extracting API Profiles" above.

### 5. Config Variables (from `variables`, launch-visible params, connector params)

Combine all config variable sources into the schema's `config_variables` array.

### 6. Endpoints

For each step, the method_id references a Cyclr API method. Since Cyclr method catalogs are not included in exports, endpoints should be documented with the connector name, step name, and method_id for reference. The CNI builder will need to research actual API endpoints from connector documentation.

## Edge Cases

### Encrypted ExportedConnectors

The `ExportedConnectors` array in Cyclr exports contains encrypted connector data. **Do not attempt to parse this.** All usable connector and auth information is extracted from the `AccountConnector` blocks within each step.

### Multi-Connector Cycles

Cycles often involve multiple connectors (e.g., SurveyMonkey → Insider, Salesforce → Insider). The parser deduplicates connectors by name. When building the schema, ensure each unique connector becomes a separate system entry with its own connection configuration.

### CustomMethodReleases

If `custom_method_releases` is non-empty, the cycle uses custom-defined API methods. These contain method definitions not in Cyclr's standard connector catalog. Include them in the schema for reference — the CNI builder will need to implement these as custom HTTP calls.

### Cycles with No Edges

Very simple cycles (single-step) may have no edges. The execution_order will still contain the single step. These typically represent standalone webhook handlers or single API calls.

### Field ID Resolution Failures

If the parser reports `"resolved": false` for a field mapping, the source field ID was not found in the source step's ResponseFormat.Fields. This can happen when:
- The field comes from a connector parameter rather than a response field
- The source step's method definition was updated after the mapping was created
- The mapping references a computed/virtual field

In these cases, document the unresolved reference in `manual_review_required` and include the raw `source_reference` value for manual investigation.
