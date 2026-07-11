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
| `error_handling.strategy` | `error_handler_type` | choice | Only MAPPED strategies set this: "retry"→"retry", "stop"→"fail", "continue"→"ignore". Unmapped strategies (e.g. "log", "notify") are NOT written here — they are surfaced in `additional_requirements`. |
| `migration_notes + config_variables + scripts + unmapped error strategies` | `additional_requirements` | text | Full text with Groovy source; also captures error strategies like "log"/"notify" that have no spec-choice equivalent |

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
| `error_retry_max_attempts`, `error_retry_delay_seconds`, `error_retry_backoff` | Not auto-filled by `schema-to-answers.ts` — only `error_handler_type` is derived from `error_handling`; retry tuning is gathered during requirements |

## Choice Value Mapping

The schema uses different vocabulary than the spec. Map to exact spec slugs:

| Schema value | Spec slug | Spec item |
|---|---|---|
| "webhook" | `webhook` | trigger_type |
| "schedule", "scheduled", "cron" | `scheduled` | trigger_type |
| "poll", "polling" | `polling` | trigger_type |
| "retry", "automatic retry" | `retry` | error_handler_type |
| "stop", "fail", "abort" | `fail` | error_handler_type |
| "continue", "ignore" | `ignore` | error_handler_type |
| "log", "notify" (no spec-choice equivalent) | — → `additional_requirements` | (not a choice) |

## Multi-Flow Handling

If the schema has multiple flows:
- Set `flow_count` to the number of flows (user confirms)
- Write `flow_definitions` as JSON array with key/name/description per flow
- Per-flow items (trigger_type, error_handler_type, etc.) go under `answers.flows[flowId]`
