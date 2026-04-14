# Standard Integration Schema

The intermediate JSON format produced by migration analysis. All platform-specific parsers and agents produce this schema, which is then converted to a CNI builder requirements context for handoff.

## Full Schema Definition

```json
{
  "metadata": {
    "source_platform": "boomi|cyclr|paragon",
    "source_directory": "/path/to/export",
    "export_file_count": 44,
    "parse_timestamp": "2025-01-15T10:30:00Z",
    "overall_confidence": 0.75,
    "notes": "Free-form migration notes"
  },
  "integration": {
    "name": "Dacra Citation Import",
    "description": "Imports eCitation records from Dacra and submits them as citation reports to Mark43 Partnerships API",
    "systems_summary": "Dacra eCitation system to Mark43 Partnerships API"
  },
  "flows": [
    {
      "name": "Main Citation Import Flow",
      "description": "Fetches citations from Dacra API, resolves users, transforms data, and submits to Mark43",
      "source_process": "process-component-id",
      "trigger": {
        "type": "scheduled|webhook|manual",
        "schedule": "Every 15 minutes",
        "details": "Scheduled poll of Dacra API with date range parameters"
      },
      "steps": [
        {
          "name": "Fetch eCitations from Dacra",
          "type": "api_call|transform|decision|loop|subprocess|error_handler|cache_operation|logging",
          "source_concept": "connectoraction",
          "source_shape": "shape2",
          "system": "Dacra",
          "operation": "GET ReadAdjudicationTicketJson",
          "description": "HTTP GET to Dacra API with date range and API key parameters",
          "confidence": 0.9,
          "field_mappings": [
            {
              "source_path": "data/*/CitationNumber",
              "target_path": "externalCitation/citationNumber",
              "transform": null,
              "confidence": 1.0
            },
            {
              "source_path": "data/*/IssueDate",
              "target_path": "eventStartUtc",
              "transform": "DateFormat: M/d/yyyy h:mm:ss a -> yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
              "confidence": 0.9
            }
          ]
        }
      ]
    }
  ],
  "api_profiles": {
    "profile-id-98763e9e": {
      "name": "Dacra API Response - Adjudication Ticket",
      "type": "json",
      "role": "response",
      "system": "Dacra",
      "fields": ["CitationNumber", "IssueDate", "Status", "BadgeNumber", "..."],
      "structure": {
        "root_type": "array",
        "notes": "Response is a JSON array of ticket objects"
      },
      "used_by_operations": ["ReadAdjudicationTicketJson"]
    },
    "profile-id-d7ca4646": {
      "name": "Dacra API Response - User",
      "type": "json",
      "role": "response",
      "system": "Dacra",
      "fields": ["ApplicationUserId", "BadgeNumber", "EmployeeNumber"],
      "structure": {
        "root_type": "object",
        "nesting_path": "Result[0]",
        "notes": "User data is nested under Result array"
      },
      "used_by_operations": ["ReadApplicationUserJson"]
    },
    "profile-id-b7726b4d": {
      "name": "Mark43 External Report",
      "type": "json",
      "role": "request",
      "system": "Mark43",
      "fields": ["approvalStatus", "agencyOri", "eventStartUtc", "recordNumber", "submittedBy", "externalCitation", "externalCustomFields", "citationCharge1"],
      "structure": {
        "root_type": "object",
        "notes": "Deeply nested request body with multiple top-level siblings"
      },
      "body_structure": {
        "top_level_fields": ["approvalStatus", "agencyOri", "eventStartUtc", "recordNumber", "submittedBy", "externalCitation", "externalCustomFields", "citationCharge1"],
        "nesting": {
          "externalCitation": ["citationNumber", "citationRecipientPerson", "citationVehicle", "citationLocation", "citationType"],
          "submittedBy": ["mark43Id"],
          "externalCustomFields": ["courtCase"]
        },
        "notes": "externalCitation and externalCustomFields are SIBLINGS at the top level, NOT nested inside each other"
      },
      "used_by_operations": ["SubmitCitationReport"]
    },
    "profile-id-errors": {
      "name": "Mark43 Validation Errors",
      "type": "json",
      "role": "response",
      "system": "Mark43",
      "fields": ["validationErrorMessages"],
      "structure": {
        "root_type": "object",
        "nesting_path": "data[0].validationErrorMessages",
        "notes": "Error details are nested under data array, first element, validationErrorMessages array"
      },
      "used_by_operations": ["SubmitCitationReport"]
    }
  },
  "endpoints": [
    {
      "system": "Dacra",
      "method": "GET",
      "path": "/ReadAdjudicationTicketJson",
      "confidence": 0.9,
      "source": "connector_action path_elements"
    },
    {
      "system": "Mark43",
      "method": "GET",
      "path": null,
      "confidence": 0.0,
      "source": "operation_id not in export",
      "notes": "Endpoint for fetching users - operation 9ad31e26 not included in export. Must be configured or verified against API docs."
    }
  ],
  "systems": [
    {
      "name": "Dacra",
      "role": "source",
      "connection": {
        "auth_type": "NONE",
        "url": "*SET BY EXTENSION*",
        "overrideable_fields": ["url"]
      },
      "connector_type": "http",
      "prismatic_component_suggestion": "HTTP/REST (generic)",
      "notes": "API key passed as query parameter, not in auth header"
    },
    {
      "name": "Mark43 Partnerships API",
      "role": "destination",
      "connection": {
        "auth_type": "basic",
        "url": "*SET BY EXTENSION*",
        "overrideable_fields": ["url", "password"]
      },
      "connector_type": "http",
      "prismatic_component_suggestion": "HTTP/REST (generic)",
      "http_client_notes": "Prismatic's createClient uses axios which throws on non-2xx responses. Status code checks after await are unreachable - use try/catch with error.response.status instead."
    }
  ],
  "data_transformations": [
    {
      "name": "Dacra eCitation to Mark43 Citation Report",
      "source_system": "Dacra",
      "target_system": "Mark43",
      "source_profile": "profile-id",
      "target_profile": "profile-id",
      "mappings": [
        {
          "source_path": "CitationNumber",
          "target_path": "externalCitation.citationNumber",
          "transform": null,
          "confidence": 1.0
        }
      ],
      "functions": [
        {
          "name": "Date Format",
          "type": "DateFormat",
          "description": "Convert date from M/d/yyyy h:mm:ss a to ISO 8601",
          "prismatic_equivalent": "Built-in date parsing with dayjs or date-fns",
          "confidence": 0.95
        },
        {
          "name": "Cross Reference Lookup",
          "type": "CrossRefLookup",
          "description": "Map Dacra vehicle color codes to Mark43 color codes",
          "prismatic_equivalent": "Lookup table as configVar or hardcoded map",
          "confidence": 0.7
        },
        {
          "name": "Height Conversion Script",
          "type": "Scripting",
          "description": "Convert height string (e.g. '510') to inches (70)",
          "script_language": "groovy",
          "script_content": "if (heightString == null || heightString.length() < 2) { heightInInches = '0' } else { feet = Integer.parseInt(heightString.substring(0, heightString.length() - 2)); inches = Integer.parseInt(heightString.substring(heightString.length() - 2)); heightInInches = String.valueOf(feet * 12 + inches) }",
          "inputs": [{"name": "heightString", "dataType": "character"}],
          "outputs": [{"name": "heightInInches", "dataType": "character"}],
          "prismatic_equivalent": "TypeScript utility function",
          "confidence": 0.9
        }
      ]
    }
  ],
  "scripts": [
    {
      "name": "Merge Persons",
      "category": "processing",
      "description": "Deduplicates Person elements by matching on DOB/firstName/lastName/SSN, aggregates nameTypes",
      "script_content": "for (int i = 0; i < dataContext.getDataCount(); i++) { ... }",
      "inputs": [],
      "outputs": [],
      "used_by_flows": ["Main Complaint Import"],
      "prismatic_equivalent": "TypeScript utility function",
      "confidence": 0.7
    }
  ],
  "error_handling": {
    "strategy": ["log", "retry"],
    "retry_config": {
      "max_retries": 0,
      "details": "Catch errors around submission, route to error handler subprocess"
    },
    "error_subprocess": "SUB - Report Submission Error Handler"
  },
  "config_variables": [
    {
      "key": "dacra_api_token",
      "label": "Dacra API Token",
      "type": "string",
      "source_concept": "Process Property (overrideable)",
      "overrideable": true,
      "help_text": "The API token for the Dacra environment"
    },
    {
      "key": "dacra_api_url",
      "label": "Dacra API URL",
      "type": "string",
      "source_concept": "Connection Override (url)",
      "overrideable": true
    }
  ],
  "state_management": {
    "document_caches": [
      {
        "name": "Dacra Citation Cache",
        "purpose": "Cache citation data during processing for branch coordination",
        "prismatic_equivalent": "crossFlowState or instanceState"
      }
    ],
    "dynamic_process_properties": [
      "DPP_CITATION_NUMBER",
      "DPP_PROCESS_ID",
      "DPP_JOB_MODE",
      "DPP_EXECUTION_ID"
    ]
  },
  "migration_notes": {
    "manual_review_required": [
      "Cross-reference lookup tables (Body Style, Race, Vehicle Color, Offense Code) need data populated in Prismatic",
      "Groovy scripts need manual translation to TypeScript",
      "OTEL/Monitoring processes excluded from migration - implement via Prismatic's built-in logging"
    ],
    "unsupported_features": [
      "Document Cache (Boomi-specific) - replaced with instanceState/crossFlowState",
      "Flow Control threading - CNI processes sequentially",
      "Dynamic Document Properties - use step results or flow state instead"
    ],
    "excluded_processes": [
      "[OTEL] !Wrapper",
      "[OTEL] Counter",
      "[OTEL] Gauge",
      "[OTEL] Histogram",
      "[OTEL] Send Metric",
      "[Monitoring] Failed Documents Count",
      "[Monitoring] Success Documents Count",
      "[Monitoring] Successful Execution Counter",
      "[Monitoring] Global Error Handler"
    ],
    "recommendations": [
      "Use Prismatic's built-in retry mechanism instead of custom error handling subprocess",
      "Convert cross-reference tables to configVar lookup maps for customer-specific mappings",
      "Replace Boomi Document Cache with Prismatic instanceState for per-execution state"
    ]
  }
}
```

## Field Descriptions

### metadata
- `source_platform`: Which platform the export came from
- `overall_confidence`: 0.0-1.0 score indicating how well the integration can be automatically migrated
- `notes`: Free-form notes about the migration

### integration
- `systems_summary`: One-line description like "Dacra to Mark43" - maps directly to the `systems` DAG question

### flows
Each flow represents a process/workflow from the source platform.
- `trigger.type`: Must be one of `webhook`, `scheduled`, or `manual` (Prismatic CNI does not support `pollingTrigger`)
- `steps`: Ordered sequence of operations. Each step has a `type` that indicates what kind of operation it performs.

### api_profiles
Structured API request/response profile definitions extracted from the source platform. These carry the actual field names and nesting structure so the code generator uses correct field names instead of guessing.
- `fields`: The exact leaf-level field names from the source profile. Generated code MUST use these names.
- `structure.root_type`: Whether the response is an `array`, `object`, etc.
- `structure.nesting_path`: Path to the actual data (e.g., `Result[0]` means data is nested under a `Result` array).
- `used_by_operations`: Which connector operations use this profile, for traceability.
- `body_structure` (request profiles only): Explicitly defines the top-level nesting hierarchy of the request body. This prevents the code generator from incorrectly nesting sibling fields inside each other.
  - `top_level_fields`: Array of field names that are direct children of the root object. These are **siblings** and must NOT be nested inside each other.
  - `nesting`: Object mapping parent field names to arrays of child field names. Example: `{ "properties": ["email", "firstname", "lastname"] }`. Values MUST be arrays, not strings.
  - `notes`: Clarifying notes about the structure (e.g., "externalCitation and externalCustomFields are siblings at the top level").

**Important:** For request profiles, always include `body_structure` when the request body has nested objects. This is critical for preventing bugs where the code generator incorrectly nests top-level siblings inside each other.

### endpoints
Known and unknown API endpoint paths. Endpoints that couldn't be determined from the export are marked with `path: null` and `confidence: 0.0` so the code generator marks them as configurable instead of guessing.
- `confidence`: 0.0-1.0 indicating how certain we are about the path
- `source`: Where the path was derived from (e.g., `connector_action path_elements`)
- `notes`: Additional context, especially for unknown endpoints

### systems
Each system involved in the integration.
- `role`: `source` or `destination`
- `prismatic_component_suggestion`: Suggested Prismatic component to search for
- `http_client_notes`: Important notes about HTTP client behavior in Prismatic (e.g., axios throwing on non-2xx)

### data_transformations
Field mapping details between systems.
- `functions`: Transformation functions used (date formatting, lookups, scripts)
- Each function includes a `prismatic_equivalent` suggestion
- For `type: "Scripting"` functions, include `script_content` (the full Groovy source code), `inputs` (array of `{name, dataType}`), and `outputs` (array of `{name, dataType}`) so the CNI builder can translate the logic to TypeScript

### scripts
Standalone script components (script.mapping, script.processing) and user-defined transform functions with embedded scripting steps. These are scripts used directly by process shapes rather than through transform maps.
- `category`: `"mapping"` (single-document input/output) or `"processing"` (multi-document stream operations)
- `script_content`: The full Groovy source code — must NOT be summarized or omitted
- `inputs`/`outputs`: Parameter names and data types for the script's contract
- `used_by_flows`: Which flows reference this script, for traceability

### config_variables
Values that should be configurable per-customer deployment.
- `source_concept`: What Boomi concept this came from (Process Property, Connection Override, etc.)
- `overrideable`: Whether this was marked as overrideable in the source platform

### migration_notes
- `excluded_processes`: Monitoring/OTEL processes identified and excluded from migration
- `manual_review_required`: Items that need human judgment during CNI development
