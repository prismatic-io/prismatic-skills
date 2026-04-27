---
name: migration-framework
version: 1.0.0
description: >
  Core knowledge for migrating integrations from other platforms (Boomi, Cyclr)
  to Prismatic Code Native Integrations. Provides the standard integration schema,
  schema-to-spec mapping, confidence scoring, and migration-aware code generation patterns.
  Use when the user says "migrate", "convert from Boomi/Cyclr", "parse this export".
user-invocable: false
---

# Migration Framework

## Standard Integration Schema

The intermediate JSON format that all platform parsers produce. See `references/standard-integration-schema.md`.

Key sections:
- **metadata** — Source platform, confidence score, migration notes
- **integration** — Name, description, systems summary
- **flows** — Trigger type, step sequence with operations
- **api_profiles** — Request/response field definitions with nesting structure
- **systems** — Source and destination with connection details
- **data_transformations** — Field mappings and transformation functions
- **scripts** — Groovy scripts with full source code for TypeScript translation
- **error_handling** — Strategy (retry, fail, ignore)
- **config_variables** — Overrideable configuration values
- **migration_notes** — Manual review items, unsupported features

## Schema-to-Spec Mapping

The `schema-to-answers` script maps schema fields to the integration YAML spec items.
See `references/schema-to-requirements-mapping.md`.

**Pre-populated** (from parsed export — confirmed by user via proposal):
- `systems`, `trigger_type`, `schedule_value`, `data_flow`
- `source_system`, `destination_system`
- `transformations`, `error_handler_type`, `error_retry_*`
- `additional_requirements` (includes Groovy scripts for translation)

**Left for live discovery** (requires platform interaction):
- `source_component`, `destination_component` — live registry search
- `*_connection_type`, `*_connection` — live connection search + user decision
- `flow_count`, `flow_definitions` — confirmed by user

## Confidence Scoring

Per-element confidence:
- **high** (0.8-1.0): Direct 1:1 mapping, deterministic
- **medium** (0.5-0.79): Requires interpretation or custom code
- **low** (0.0-0.49): No direct equivalent, manual design needed

Overall = weighted average. Drives reviewer focus.

## Migration-Aware Code Generation

When `migration-schema.json` exists in the session, `code-plan` emits `<migration-context>`:
- **api_profiles** — exact field names and nesting paths. Use these, don't invent field names.
- **script_translations** — full Groovy source with input/output contracts. Translate completely.
- **field_mappings** — source→destination field mappings from transformations.
- **endpoints** — known API paths with confidence scores.

See `references/migration-code-gen-guide.md` for translation patterns.

## Key References

- `references/standard-integration-schema.md` — Full schema definition with examples
- `references/schema-to-requirements-mapping.md` — Spec item ID mapping
- `references/migration-code-gen-guide.md` — API profiles, script translation, field mapping patterns
