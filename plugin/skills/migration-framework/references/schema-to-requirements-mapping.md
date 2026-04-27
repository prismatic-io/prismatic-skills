# Schema-to-Spec Mapping

Maps fields from the standard integration schema to the YAML spec item IDs
in `scripts/questions/integration.yaml`.

## Pre-Populated Items

These are written to requirements.json by `schema-to-answers.ts`:

| Schema Path | Spec Item | Type | Notes |
|---|---|---|---|
| `integration.systems_summary` | `systems` | text | "Salesforce to NetSuite" format |
| `flows[0].trigger.type` | `trigger_type` | choice | Map: "webhook"→"webhook", "schedule"→"scheduled", "poll"→"polling" |
| `flows[0].trigger.schedule` | `schedule_value` | text | Cron expression if scheduled |
| `flows[].description + steps` | `data_flow` | text | Generated narrative |
| `systems[role=source].name` | `source_system` | text | System name |
| `systems[role=destination].name` | `destination_system` | text | System name |
| `data_transformations` | `transformations` | text | Narrative with first 10 mappings + function summary |
| `error_handling.strategy` | `error_handler_type` | choice | Map: "retry"→"retry", "stop"→"fail", "continue"→"ignore" |
| `error_handling.retry_count` | `error_retry_max_attempts` | text | Number as string |
| `error_handling.retry_delay` | `error_retry_delay_seconds` | text | Number as string |
| `error_handling.retry_backoff` | `error_retry_backoff` | choice | "Yes" or "No" |
| `migration_notes + config_variables + scripts` | `additional_requirements` | text | Full text with Groovy source |

## NOT Pre-Populated

These require live platform interaction or user decisions:

| Spec Item | Reason |
|---|---|
| `source_component` | Must search Prismatic component registry live |
| `destination_component` | Must search Prismatic component registry live |
| `source_connection_type` | Depends on component search result |
| `source_connection` | User decides connection strategy |
| `source_connection_existing` | Must search org connections live |
| `destination_connection_type` | Depends on component search result |
| `destination_connection` | User decides connection strategy |
| `destination_connection_existing` | Must search org connections live |
| `flow_count` | Derived from schema but confirmed by user |
| `flow_definitions` | Derived from schema but confirmed by user |
| `additional_systems` | If 3+ systems detected in schema |

## Choice Value Mapping

The schema uses different vocabulary than the spec. Map to exact spec slugs:

| Schema value | Spec slug | Spec item |
|---|---|---|
| "webhook" | `webhook` | trigger_type |
| "schedule", "scheduled", "cron" | `scheduled` | trigger_type |
| "poll", "polling" | `polling` | trigger_type |
| "retry", "automatic retry" | `retry` | error_handler_type |
| "stop", "fail", "abort" | `fail` | error_handler_type |
| "continue", "ignore", "log" | `ignore` | error_handler_type |

## Multi-Flow Handling

If the schema has multiple flows:
- Set `flow_count` to the number of flows (user confirms)
- Write `flow_definitions` as JSON array with key/name/description per flow
- Per-flow items (trigger_type, error_handler_type, etc.) go under `answers.flows[flowId]`
