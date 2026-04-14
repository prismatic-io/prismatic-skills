# Boomi Export Parsing Guide

How to interpret the output of the Boomi export parser to produce a standard integration schema.

## Summary Mode

For large exports, use `--summary` first to get a quick scope assessment:

```bash
prismatic-tools parse-export <export-directory> --platform boomi --summary
```

The summary includes:
- **counts**: Component counts by type
- **processes**: Process names, shape counts, shape type distribution, monitoring flags
- **systems**: Connector settings with names, auth types, URL patterns
- **endpoints**: Connector actions with methods, paths, profile references
- **profiles_overview**: Profile names and field counts (not full field lists)
- **transform_maps_overview**: Transform map names, mapping counts, function types
- **config_sources**: Process property names and counts
- **scripts_overview**: Script and transform.function names, types, and step counts
- **document_caches_overview**: Cache names and index key names

Use this to understand the integration scope before reading the full output selectively.

## Identifying the MAIN Process

Look for processes with naming patterns indicating the entry point:
- `MAIN` or `[MAIN]` in the process name (e.g., `[0010] MAIN - Dacra Interface`)
- The process that is NOT called by any other process (no incoming `processcall` references)
- The process with the most shapes and complexity

In the parser output, check `processes` keys and match names:
```json
"processes": {
  "8b67b542-...": {
    "name": "[0010] MAIN - Dacra Interface",
    "shapes": [...]
  }
}
```

## Separating Business Logic from Monitoring

Exclude processes with these prefixes from the migration:
- `[OTEL]` - OpenTelemetry instrumentation
- `[Monitoring]` or `[MONITORING]` - Monitoring and metrics
- Any process called only from OTEL/Monitoring processes

These are Boomi-specific observability patterns. Prismatic has its own built-in logging and monitoring.

Also exclude associated components:
- `[OTEL] Connection` (connector-settings)
- `[OTEL] Send Metrics` (connector-action)
- `[MONITORING] Interface List` (crossref)

## Tracing the Shape Graph

The shape graph defines the flow execution order. Starting from `shape1` (always the start shape), follow the `connections_to` array:

```
shape1 (start) → shape42 (documentproperties) → shape3 (documentproperties) → shape40 (catcherrors)
  ├── Try: shape41 (branch)
  │     ├── Branch 1: shape39 (processcall) → shape44 (branch) → ...
  │     └── Branch 2: shape37 (processcall) [monitoring]
  └── Catch: shape38 (processcall) [error handler]
```

Each connection has:
- `to_shape`: The target shape name
- `identifier`: For decision shapes, this is `"true"` or `"false"`; for branches, `"1"`, `"2"`, etc.; for catch errors, `"default"` (try) or `"error"` (catch)
- `text`: Display label for the connection

## Interpreting Shape Configurations

### Process Call (`processcall`)
```json
{
  "type": "processcall",
  "config": {
    "process_id": "5ec8019a-...",
    "abort": "true",
    "wait": "true"
  }
}
```
- `process_id` references another process in the export. Look it up in `processes` to understand the sub-flow.
- `abort: true` + `wait: true` means synchronous execution with error propagation.

### Connector Action (`connectoraction`)
```json
{
  "type": "connectoraction",
  "config": {
    "connection_id": "c0b1d3ca-...",
    "connector_type": "http",
    "action_type": "Get",
    "operation_id": "9ad31e26-..."
  }
}
```
- `connection_id` → look up in `connector_settings` for auth and URL
- `operation_id` → look up in `connector_actions` for HTTP method, path elements, and profiles

### Map (`map`)
```json
{
  "type": "map",
  "config": {
    "map_id": "53478caa-..."
  }
}
```
- `map_id` → look up in `transform_maps` for field mappings and functions

### Decision (`decision`)
```json
{
  "type": "decision",
  "config": {
    "name": "Is response empty?",
    "comparison": "equals"
  },
  "connections_to": [
    {"to_shape": "shape12", "identifier": "true", "text": "True"},
    {"to_shape": "shape6", "identifier": "false", "text": "False"}
  ]
}
```
- True/False branches lead to different shape sequences

### Branch (`branch`)
```json
{
  "type": "branch",
  "config": {
    "num_branches": "3"
  },
  "connections_to": [
    {"to_shape": "shape16", "identifier": "1", "text": "1"},
    {"to_shape": "shape14", "identifier": "2", "text": "2"},
    {"to_shape": "shape19", "identifier": "3", "text": "3"}
  ]
}
```
- In Boomi, branches execute in parallel. In Prismatic CNI, they execute sequentially.
- Each branch is a separate path that may converge later (or terminate independently).

### Data Process / Split (`dataprocess`)
```json
{
  "type": "dataprocess",
  "config": {
    "steps": [{
      "name": "Split Documents",
      "type": "split",
      "profile_type": "json",
      "split_element": "CitationNumber (...)",
      "profile_id": "98763e9e-..."
    }]
  }
}
```
- Splits an array into individual documents for per-item processing
- Maps to `.forEach()` or `.map()` iteration in TypeScript

## Interpreting Transform Map Functions

### DateFormat
```json
{
  "type": "DateFormat",
  "inputs": [
    {"key": "1", "name": "Date String"},
    {"key": "2", "name": "Input Mask", "default": "M/d/yyyy h:mm:ss a"},
    {"key": "3", "name": "Output Mask", "default": "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"}
  ]
}
```
Convert with `dayjs(input, inputMask).format(outputMask)` or equivalent.

### CrossRefLookup
```json
{
  "type": "CrossRefLookup",
  "cross_ref_table_id": "973f6be1-...",
  "cross_ref_inputs": [{"name": "Dacra Color"}],
  "cross_ref_outputs": [{"name": "Mark43 Item Color"}]
}
```
Look up the table in `cross_references` to see column headers. Implement as a lookup map.

### Scripting (Groovy)
```json
{
  "type": "Scripting",
  "language": "groovy2",
  "script": "if (heightString == null || ...) { ... }",
  "inputs": [{"name": "heightString"}],
  "outputs": [{"name": "heightInInches"}]
}
```
Translate the Groovy logic to TypeScript. Most Groovy scripts are simple string/number manipulation.

**Important:** The `script` field contains the full Groovy source code. This MUST be carried through to the integration schema as `script_content` — do not summarize or omit it. The CNI builder needs the actual code to translate it to TypeScript.

### StringConcat
```json
{
  "type": "StringConcat",
  "delimiter": " | ",
  "inputs": [{"name": "ViolationText"}, {"name": "ViolationDisplayCode"}]
}
```
Implement as template literal or `.join(delimiter)`.

## Extracting Config Variables

Config variables come from two sources:

### 1. Overrideable Process Properties
In the process overrides section, `OverrideableDefinedProcessPropertyValue` entries with `overrideable="true"`:
```json
{
  "key": "ec9dea80-...",
  "name": "Dacra API Token",
  "overrideable": true
}
```
Cross-reference with `process_properties` to get the label, type, and help text.

### 2. Overrideable Connection Fields
In the process overrides section, `ConnectionOverride` fields with `overrideable="true"`:
```json
{
  "id": "url",
  "label": "URL",
  "overrideable": true
}
```
These are typically API URLs that change per deployment.

## Connection Override Extraction

Connection overrides in the MAIN process define which connection settings are configurable per-environment:
```json
"connection_overrides": [
  {
    "id": "ea837a6d-...",
    "fields": [
      {"id": "url", "label": "URL", "overrideable": true},
      {"id": "password", "label": "Password", "overrideable": false}
    ]
  }
]
```
Match the override `id` to `connector_settings` component IDs to identify which connection each override applies to.

## Extracting API Profiles for Schema

API profiles define the field names and structure of request/response data. These MUST be
captured in the integration schema to ensure the generated code uses correct field names.

### Linking Profiles to Operations

1. In `connector_actions`, each action has `response_profile` and `request_profile` IDs
2. Look up these IDs in `profiles` to get field names
3. The profile `fields` array contains the leaf-level field names
4. For response profiles, note the nesting structure from the profile element hierarchy

### Building the api_profiles Schema Section

For each profile referenced by a connector action:
1. Get the profile ID from the connector action
2. Look up in `profiles` for field names
3. Determine role: `response_profile` → "response", `request_profile` → "request"
4. Determine which system it belongs to (from the connection's connector settings)
5. Note any nesting (arrays, nested objects) from the profile element names

### Example: Tracing a Field Name

To verify the correct field name for ticket status:
1. Find the connector action for `ReadAdjudicationTicketJson`
2. Get its `response_profile` ID (e.g., `98763e9e`)
3. Look up `profiles["98763e9e"]` → `fields: ["CitationNumber", "Status", ...]`
4. The field is `Status`, not `TicketStatus`

## Custom Connector Operations

When a connector action uses a custom/SDK connector (e.g., `disk-sdk`), the parser emits additional fields beyond `operation_type` and `connector_type`:

```json
{
  "connector_type": "custom",
  "operation_type": "QUERY",
  "custom_operation_type": "LIST",
  "object_type_id": "DIRECTORY",
  "object_type_name": "Directory",
  "response_profile": "14c43ced-...",
  "fields": [
    {"id": "count", "type": "integer", "value": "-1"}
  ],
  "filter_operator": "and",
  "filters": [
    {"field": "isDirectory", "operator": "EQUALS"},
    {"field": "fileName", "operator": "REGEX"},
    {"field": "fileSize", "operator": "GREATER_THAN"}
  ]
}
```

- `custom_operation_type` is the key discriminator: `LIST`, `GET`, `CREATE`, `DELETE`, `UPDATE`
- `object_type_name` identifies the entity being operated on (e.g., `Directory`, `File`)
- `filters` describes selection criteria for query/list operations
- For `disk-sdk` connectors, these map to the **Prismatic SFTP component**: LIST → SFTP list, GET → SFTP download, CREATE → SFTP upload

## Interpreting Document Caches

The parser emits index and key information from document cache components:

```json
"document_caches": {
  "f1cb5494-...": {
    "name": "Victims by complaintNumber",
    "max_documents": "",
    "expiration": "",
    "profile": "ae01165c-...",
    "profile_type": "profile.xml",
    "enforce_single_lucene": "true",
    "indexes": [
      {
        "index_id": "1",
        "index_name": "complaintNumber",
        "keys": [
          {"alias": "complaintNumber (statUf61/complaintNumber)", "element_key": "26"}
        ]
      }
    ]
  }
}
```

- `indexes[].index_name` — the lookup key name for this cache
- `indexes[].keys[]` — the profile field(s) that form the cache key
- `profile` — links to the data profile defining the cached document structure

Document caches map to one of two CNI patterns:
- **Static lookup caches** (loaded once from API/file, read-only during processing) → JSON configVar with customer-uploaded data, keyed by `index_name`
- **Runtime caches** (populated during processing, used within same execution) → in-memory `Map<string, T>`, keyed by `index_name`

When a `doccacheretrieve` shape references a cache by `doc_cache` ID, look up that ID in `document_caches` to find the `index_name`.

## Component-Referenced Scripts in transform.function

When a `transform.function` step delegates to an external script component via `useComponent="true"`, the parser emits:

```json
{
  "key": "6",
  "type": "Scripting",
  "name": "Scripting",
  "use_component": true,
  "script_component_id": "f6008290-...",
  "language": "groovy2"
}
```

The actual Groovy source lives in the `scripts` bucket under `script_component_id`. Look it up:

```json
"scripts": {
  "f6008290-...": {
    "name": "Random UUID",
    "type": "script.mapping",
    "script": "uuid = UUID.randomUUID().toString()",
    "language": "groovy2",
    "outputs": [{"name": "uuid", "index": "1"}]
  }
}
```

Do NOT flag the script as "source not found" — it is present in the export, just stored in a separate component. Carry the script content into the schema by referencing the `scripts` entry.

## DocumentCacheLookup in transform.function Steps

When a `transform.function` step performs a cache lookup, the parser emits:

```json
{
  "key": "9",
  "type": "DocumentCacheLookup",
  "name": "Document Cache Lookup",
  "doc_cache_id": "f13ddfa6-...",
  "cache_index": "1",
  "lookup_inputs": [
    {"index": "2", "key_id": "2", "name": "badgeNumber (Root/.../badgeNumber)"}
  ],
  "lookup_outputs": [
    {"index": "1", "key": "27", "name": "personnelUnit (Root/.../personnelUnit)"}
  ]
}
```

- `doc_cache_id` → look up in `document_caches` to find the cache profile and index definition
- `cache_index` → which index to use for the lookup
- `lookup_inputs` → the field(s) used as the lookup key
- `lookup_outputs` → the field(s) returned from the cache

Maps to either a JSON configVar lookup or an in-memory Map read, depending on whether the referenced cache is static or runtime.
