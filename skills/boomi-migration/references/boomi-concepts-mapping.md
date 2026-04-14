# Boomi Concepts Mapping

Detailed shape-by-shape conversion rules from Boomi process shapes to Prismatic CNI equivalents.

## Shape Type Reference

| Boomi Shape Type | XML `shapetype` | Prismatic CNI Equivalent | Confidence |
|---|---|---|---|
| Start (no action) | `start` + `noaction` | Scheduled or manual trigger | High |
| Start (connector listen) | `start` + `connectoraction` | Webhook trigger | High |
| Process Call | `processcall` | Sub-flow or inline steps | Medium |
| Connector Action | `connectoraction` | Component action or HTTP call | High |
| Map | `map` | Data transformation (TypeScript function) | Medium |
| Decision | `decision` | Conditional logic (if/else in flow) | High |
| Branch | `branch` | Sequential step execution (CNI is single-threaded) | Medium |
| Catch Errors | `catcherrors` | Try/catch error handling wrapper | High |
| Data Process (split) | `dataprocess` | Array iteration / `.map()` / `.forEach()` | High |
| Document Properties | `documentproperties` | Variable assignment / state management | Medium |
| Doc Cache Load | `doccacheload` | JSON configVar (static lookup) or `Map.set()` (runtime cache) | Medium |
| Doc Cache Retrieve | `doccacheretrieve` | JSON configVar lookup (static) or `Map.get()` (runtime cache) | Medium |
| Doc Cache Remove | `doccacheremove` | `Map.delete()` (runtime cache only) | Medium |
| Notify | `notify` | `logger.info()` / `logger.warn()` logging step | High |
| Flow Control | `flowcontrol` | Sequential processing (no threading in CNI) | Medium |
| Stop | `stop` | Flow termination / return statement | High |

## Connector Type Mapping

| Boomi Connector | `subType` value | Prismatic Equivalent |
|---|---|---|
| HTTP Client | `http` | HTTP component or custom `axios` calls |
| Database | `database` | Prismatic database components |
| FTP/SFTP | `ftp` / `sftp` | SFTP component |
| AS2 | `as2` | Custom implementation |
| Disk / SFTP SDK | `disk-sdk` | **Prismatic SFTP component**. LIST → SFTP list action, GET → SFTP download, CREATE → SFTP upload. Filter criteria in the parsed `filters` array describe file selection logic. |

## Authentication Type Mapping

| Boomi Auth | `authenticationType` | Prismatic Connection |
|---|---|---|
| `NONE` | No auth / API key in URL | Custom connection with API key input |
| `basic` | Basic auth | Basic Auth connection |
| `oauth` | OAuth 1.0 | Custom OAuth connection |
| `oauth2` | OAuth 2.0 | OAuth 2.0 connection |
| `aws` | AWS Signature | AWS connection |
| Custom header | Token in header | Custom connection with header token |

## Concept Mappings

### Process Properties → Config Variables
Boomi Process Properties marked as `overrideable: true` in the process overrides section map to Prismatic `configVar` elements. These become customer-configurable settings in the CNI config wizard.

### Cross-Reference Tables → Lookup Maps
Boomi cross-reference tables map to either:
- **ConfigVar of type `picklist`** for simple key-value mappings
- **Hardcoded TypeScript `Map` objects** for static mappings
- **External lookup API calls** for dynamic data

### Document Caches → JSON ConfigVar or In-Memory Map

Boomi document caches map to one of two CNI patterns depending on usage:

**Pattern A: Static lookup caches → JSON configVar**
Caches that hold reference/lookup data (e.g., offense codes, user lists). These are populated once from an API or file, then only read during processing. In Prismatic, the customer uploads this data as a JSON configVar in the config wizard.

How to identify: `doccacheload` appears in a setup/initialization sub-process; the cache is only read (via `doccacheretrieve` or `DocumentCacheLookup`) during the main processing flow.

```typescript
// configVar: offense_codes_lookup (type: string, contains JSON)
const offenseCodes: Record<string, OffenseCode> = JSON.parse(
  util.types.toString(configVars["offense_codes_lookup"])
);
const code = offenseCodes[description]; // keyed by index_name
```

**Pattern B: Runtime caches → in-memory Map**
Caches populated during execution from processed data (e.g., victims by complaint number, addresses by person ID). Data is extracted from one document and cached for lookup when processing related documents later in the same execution.

How to identify: `doccacheload` appears inside a document processing loop, not a setup phase.

```typescript
// Declare at flow level:
const victimsByComplaint = new Map<string, VictimData>();

// Write during extraction step:
victimsByComplaint.set(complaintNumber, victimData);

// Read during later processing step:
const victims = victimsByComplaint.get(complaintNumber);
```

The parser's `document_caches[].indexes[].index_name` determines the Map/lookup key for both patterns.

### Dynamic Document Properties → Step Results
Boomi Dynamic Document Properties (`dynamicdocument.*`) map to passing data between steps via return values and step inputs in CNI.

### Dynamic Process Properties → Flow Variables
Boomi Dynamic Process Properties (`process.*`) map to variables scoped to the flow execution, typically passed via step context or `crossFlowState`.

## Transform Function Mapping

| Boomi Function Type | Prismatic Equivalent | Notes |
|---|---|---|
| `DateFormat` | `dayjs` or `date-fns` formatting | High confidence - direct equivalent |
| `CrossRefLookup` | Lookup map or configVar | Medium - needs data population |
| `Scripting` (Groovy) | TypeScript utility function | Medium - requires automated translation from Groovy source code provided in schema |
| `StringConcat` | Template literal or `.join()` | High confidence |
| `WhitespaceTrim` | `.trim()` | High confidence |
| `DefinedProcessPropertyGet` | Read from configVar | High confidence |
| `DefinedProcessPropertySet` | Write to state | Medium confidence |
| `userdefined` | Custom TypeScript function | Low - requires understanding logic |
| `DocumentCacheLookup` | JSON configVar lookup or `Map.get()` | Medium - static caches use configVar, runtime caches use in-memory Map. `doc_cache_id` links to the cache component; `cache_index` selects which index key to use. |

## Prismatic HTTP Client Behavior

When generating code that uses Spectral's `createClient` (or axios directly):

1. **Axios throws on 4xx/5xx** — `createClient` uses `axios.create()` without a custom
   `validateStatus`. This means HTTP errors throw exceptions. Code that checks
   `response.status === 400` after `await client.post(...)` is dead code — the promise
   rejects before reaching that line.

2. **Status-specific handling must be in catch blocks**:
   ```typescript
   try {
     const response = await client.post("/endpoint", data);
     // Only reaches here on 2xx
   } catch (error) {
     if (axios.isAxiosError(error) && error.response?.status === 400) {
       // Handle validation errors
       const validationErrors = error.response.data?.validationErrorMessages;
     }
   }
   ```

3. **Boomi route shapes → try/catch branches**: Boomi uses HTTP status routing
   (200 → success path, 400 → error path, other → exception). In Prismatic CNI,
   translate this to try/catch with status checks in the catch block.

## Response Structure Patterns

Boomi profiles define the exact structure of API responses. When migrating:

1. **Always check the profile for field names** — Don't guess. The parser extracts field
   names from `JSONObjectEntry` elements. Use these exact names in TypeScript interfaces.

2. **Check nesting depth** — Boomi profiles show the full path:
   - `data/Array/ArrayElement1/Object/FieldName` means `data[0].FieldName`
   - `Result/Array/ArrayElement1/Object/FieldName` means `Result[0].FieldName`

3. **Carry profile IDs through to the schema** — The `api_profiles` section in the
   standard schema should reference the profile ID so it can be traced back.

## References Within XML

The XML uses ID-based references between components:

- **connectionId** attribute → references a `connector-settings` component by componentId
- **processId** attribute → references a `process` component by componentId (sub-process call)
- **mapId** attribute → references a `transform.map` component by componentId
- **profileId** attribute → references a `profile.*` component by componentId
- **crossRefTableId** attribute → references a `crossref` component by componentId
- **docCache** attribute → references a `documentcache` component by componentId
- **operationId** attribute → references a `connector-action` component by componentId
