# Cyclr Concepts Mapping

Detailed concept-by-concept conversion rules from Cyclr cycle elements to Prismatic CNI equivalents.

## ActionType Reference

| ActionType Value | Cyclr Name | Prismatic CNI Equivalent | Confidence |
|---|---|---|---|
| 1 | Standard Action | Component action or HTTP call | High |
| 2 | Decision | Conditional logic (if/else in flow) | High |
| 3 | Delay | `setTimeout` or scheduled pause step | Medium |
| 4 | Script | Custom TypeScript logic (inline function) | Medium |
| 5 | Webhook | Webhook trigger (flow entry point) | High |

**Notes:**
- ActionType 1 covers the vast majority of steps — these are API calls to external systems via connectors.
- ActionType 2 decision steps use `LeftOperandType` and `RightOperandValue` fields for comparison logic. The step's edges determine true/false branching.
- ActionType 4 script steps contain inline JavaScript in `ActionData`. This must be translated to TypeScript.
- ActionType 5 webhook steps are always the first step in a cycle triggered by external events.

## Connector Type Mapping

| Cyclr Connector | Prismatic Equivalent | Notes |
|---|---|---|
| Salesforce | Search Prismatic component registry first | Likely has public component |
| HubSpot | Search Prismatic component registry first | Likely has public component |
| SurveyMonkey | Direct HTTP via `createClient` | Niche — unlikely to have public component |
| Insider | Direct HTTP via `createClient` | Niche — unlikely to have public component |
| Mailchimp | Search Prismatic component registry first | Likely has public component |
| Slack | Search Prismatic component registry first | Likely has public component |
| Shopify | Search Prismatic component registry first | Likely has public component |
| Generic Webhook | Prismatic webhook trigger | Built-in trigger type |

**Strategy:** For each connector, search the Prismatic component registry (`prism components:list --filter=public=true`) before building custom HTTP clients. Common SaaS platforms often have pre-built Prismatic components with authentication and actions ready to use. Niche or proprietary connectors require direct HTTP implementation via `createClient`.

## Authentication Type Mapping

| Cyclr AuthType | Numeric | String | Prismatic Connection |
|---|---|---|---|
| API Key | 1 | `apiKey` | Custom connection with API key input |
| Basic | 2 | `basic` | Basic Auth connection |
| Custom | 3 | `custom` | Custom connection (inspect connector parameters) |
| OAuth 2.0 | 4 | `oauth2` | OAuth 2.0 connection |
| OAuth 1.0 | 5 | `oauth1` | Custom OAuth connection |

### OAuth2Type Sub-Mapping

| OAuth2Type Value | Grant Type | Prismatic Config |
|---|---|---|
| 1 | Authorization Code | `OAuth2Type.AuthorizationCode` with authorize URL and token URL |
| 2 | Client Credentials | `OAuth2Type.ClientCredentials` with token URL only |

When a connector uses OAuth2 (AuthType=4), extract:
- `AuthoriseUrl` → `authorizationUrl` in Prismatic OAuth2 config
- `AccessTokenUrl` → `tokenUrl` in Prismatic OAuth2 config
- `Scopes` → `scopes` default value (if present in export)

## CycleFieldMappings → Data Transformations

Cyclr's `CycleFieldMappings` define how data flows from one step's output to another step's input.

**Reference format:** Each mapping's `Value` field contains `"stepId,fieldId"` where:
- `stepId` is the UUID of the source step
- `fieldId` is the numeric ID of a field in the source step's `ResponseFormat.Fields`

**Resolution process:**
1. Parse the `Value` string by splitting on `,`
2. Look up `stepId` in the Steps array to find the source step
3. Look up `fieldId` in that step's `Method.ResponseFormat.Fields` to find the `ConnectorField` name
4. The `Field.ConnectorField` on the mapping itself is the target field path

**Example:**
```json
{
  "Field": { "ConnectorField": "[users].identifiers.email" },
  "Value": "7efc8402-1098-49bf-9d2f-5a27c51b979b,17462950"
}
```
- Source: Step `7efc8402...` → field ID `17462950` → resolves to `Email` (from ResponseFormat)
- Target: `[users].identifiers.email`
- Meaning: Map the source step's `Email` response field to the target step's `[users].identifiers.email` request field

**CycleEntityMappingType values:**
- `0` = Dynamic mapping (value references a previous step's output)
- `1` = Static mapping (value is a literal/constant)

## CycleParameters → Step Parameter Configuration

Cyclr's `CycleParameters` configure step-level parameters, often used for API query parameters, URL segments, and filtering.

**TargetType values** (from connector Parameters):

| TargetType | Meaning | Prismatic Equivalent |
|---|---|---|
| 1 | Endpoint URL segment | Path parameter in HTTP request URL |
| 2 | Query string parameter | Query parameter in HTTP request |
| 3 | Request header | Header value in HTTP request |
| 4 | Response field | Output field selection/filtering |
| 5 | Boolean setting | Connector configuration toggle |

Parameters follow the same `"stepId,fieldId"` reference format as field mappings when `CycleEntityMappingType=0` (dynamic). When `CycleEntityMappingType=1` (static), the `Value` is a literal value.

## Edges → Flow Execution Order

Cyclr's `Edges[]` define the directed graph of step execution:

- `TailStep_Id` = predecessor (source of the edge)
- `HeadStep_Id` = successor (target of the edge)
- Direction: TailStep → HeadStep (tail runs first, then head runs)

**CycleEdgeType values:**

| CycleEdgeType | Meaning |
|---|---|
| 0 | Standard sequential flow |
| 1 | Standard sequential flow (data-passing) |

The parser performs topological sorting on edges to produce a deterministic `execution_order` array. Steps with no incoming edges are the cycle's entry points (triggers or first actions).

## Variables → Config Variables

Cyclr's top-level `Variables[]` array contains cycle-scoped variables. These map to Prismatic `configVar` elements:

```json
{ "Id": "...", "Name": "API_BASE_URL", "Value": "https://api.example.com" }
```

Maps to:
```typescript
configVar({
  stableKey: "api-base-url",
  dataType: "string",
  defaultValue: "https://api.example.com",
})
```

## ShareFields / IsLaunchVisible → Customer-Visible Configuration

Cyclr exposes certain parameters to end-users via two mechanisms:

1. **ShareFields** (cycle-level) — Top-level array listing fields visible during cycle launch
2. **IsLaunchVisible** (per-mapping/parameter) — Boolean on individual CycleFieldMappings and CycleParameters

Fields marked as launch-visible become customer-configurable in Prismatic via `configVar` with appropriate visibility settings.

## StepCollectionSplitType → Array Processing

| StepCollectionSplitType | Meaning | Prismatic Equivalent |
|---|---|---|
| 0 | No splitting (pass full array) | Process array as-is |
| 1 | First item only | `array[0]` — take first element |
| 2 | All items individually | `.forEach()` / `.map()` iteration |

When a step has `StepCollectionSplitType=2`, the step executes once per item in the input array. This maps to array iteration in TypeScript.

## ConnectorField Notation

Cyclr uses bracket notation for array paths in ConnectorField values:

| Notation | Meaning | TypeScript Equivalent |
|---|---|---|
| `fieldName` | Simple top-level field | `data.fieldName` |
| `[arrayName].fieldName` | Field within array items | `data.arrayName[i].fieldName` |
| `[arrayName].[nestedArray].field` | Nested array field | `data.arrayName[i].nestedArray[j].field` |
| `parent.child` | Nested object field | `data.parent.child` |

**Examples from exports:**
- `[records].Id` → `response.records[i].Id`
- `[data].title` → `response.data[i].title`
- `[users].identifiers.email` → `request.users[i].identifiers.email`
- `[users].attributes.email` → `request.users[i].attributes.email`

## Request/Response Format Fields

Each step's `Method` contains `RequestFormat` and `ResponseFormat` objects with a `Fields` array:

```json
{
  "RequestFormat": {
    "Fields": [
      { "Id": 12345, "ConnectorField": "[users].identifiers.email" }
    ]
  },
  "ResponseFormat": {
    "Fields": [
      { "Id": 17462950, "ConnectorField": "Email" },
      { "Id": 17462948, "ConnectorField": "LastName" }
    ]
  }
}
```

- **ResponseFormat.Fields** define the outputs of a step — these are the fields available for reference in downstream steps' CycleFieldMappings and CycleParameters
- **RequestFormat.Fields** define the inputs of a step — these are populated via CycleFieldMappings from upstream steps
- Field `Id` values are the numeric identifiers used in the `"stepId,fieldId"` reference format

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

3. **Cyclr error handling** — Cyclr's `CycleStepErrorAction` and `MaxRetriesOnError` fields
   define cycle-level error behavior. In Prismatic CNI, translate these to try/catch blocks
   with retry logic where applicable.
