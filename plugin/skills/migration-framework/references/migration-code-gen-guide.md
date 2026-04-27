# Migration-Aware Code Generation Guide

When `migration-schema.json` exists in the session directory, the `code-plan` output
includes a `<migration-context>` block. Use this data during code generation.

## API Profiles

The schema's `api_profiles` section contains exact field names and nesting structure
from the source platform's API documentation.

<rule name="field-names">
  <always>Use exact field names from API profiles — do not invent or rename</always>
  <always>Check response `structure.nesting_path` for correct data extraction path</always>
  <always>Check request `body_structure` for correct top-level field siblings</always>
</rule>

Example: If the profile says `structure.nesting_path: "Result[0]"`, extract data as:
```typescript
const records = (result.data as Record<string, unknown>).Result as unknown[];
```

## Script Translation (Groovy → TypeScript)

The schema carries full Groovy source code from Boomi processes. Translate completely.

<rule name="script-translation">
  <always>Translate the full Groovy source — no TODO placeholders</always>
  <always>Preserve the input/output contract (parameter names, types)</always>
  <always>Use TypeScript equivalents for Java/Groovy APIs</always>
</rule>

### Common translations:

| Groovy | TypeScript |
|---|---|
| `ExecutionUtil.getDynamicProcessProperty(name)` | Function parameter or `crossFlowState[name]` |
| `ExecutionUtil.setDynamicProcessProperty(name, val)` | Return value or `crossFlowState[name] = val` |
| `dataContext.getDataCount()` / `getStream()` | Array iteration (`for...of`) |
| `new JsonSlurper().parseText(json)` | `JSON.parse(json)` |
| `new JsonBuilder(obj).toString()` | `JSON.stringify(obj)` |
| `new SimpleDateFormat(pattern)` | `dayjs(date).format(pattern)` or Intl.DateTimeFormat |
| `java.util.UUID.randomUUID()` | `crypto.randomUUID()` |
| `Properties.getProperty(key)` | `context.configVars[key]` |
| `try { ... } catch (Exception e) { ... }` | `try { ... } catch (e: unknown) { ... }` |

### Script categories:
- **mapping** (single-document): Transforms one record at a time. Becomes a helper function called per-record.
- **processing** (stream): Processes a batch/stream. Becomes the main loop body in `onExecution`.

## Field Mappings

The schema's `data_transformations` section lists source→destination field mappings.
Use these to generate the transformation logic in `onExecution`.

For simple field copies:
```typescript
const destination = {
  externalId: source.Id,
  name: source.Name,
  email: source.ContactEmail,
};
```

For function-transformed fields, check the `functions` array for the transformation type
and implement the equivalent TypeScript logic.

## Endpoints

The schema may include known API endpoints with confidence scores.
- **high confidence** (0.8+): Use the endpoint path directly
- **medium confidence** (0.5-0.79): Use but note in comments for review
- **low confidence** (<0.5): Flag as UNKNOWN — do not fabricate paths

```typescript
// UNKNOWN endpoint — needs manual verification
// Migration schema confidence: 0.3
const result = await client.get("/api/v2/records"); // verify this path
```

## HTTP Error Handling

Prismatic's HTTP client (via Spectral's axios wrapper) throws on non-2xx responses.
Boomi's HTTP connector does NOT throw by default — it returns the response and checks
status in a subsequent Decision shape.

<rule name="http-errors">
  <always>Wrap HTTP calls in try/catch — Spectral/axios throws on non-2xx</always>
  <never>Check `response.status` after an axios await — the await already threw if non-2xx</never>
</rule>

## Document Caches (Boomi)

Boomi Document Caches map to:
- **Static lookup tables** → JSON configVar (customer can edit the mapping)
- **Runtime caches** → `Map<K, V>` in flow scope (rebuilt each execution)

## Transformation Chains

Boomi often chains multiple map/function steps. Implement the full chain:
```typescript
// Step 1: Map fields from source format
const mapped = mapSourceFields(sourceData);
// Step 2: Apply date transformations
const withDates = transformDates(mapped);
// Step 3: Apply cross-reference lookups
const withRefs = await resolveCrossRefs(withDates, lookupTable);
// Step 4: Build destination format
const destinationPayload = buildDestinationPayload(withRefs);
```

Do not collapse steps — the migration reviewer checks each transformation step.
