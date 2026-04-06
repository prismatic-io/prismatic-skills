# Migration Plugin Integration into prismatic-test-typescript

## Context

The `migration-plugin` (at `/Users/brandonlittle/Documents/prismatic/code/migration-plugin/`) automates migration from Dell Boomi and Cyclr to Prismatic CNIs. It currently lives as a separate Claude Code plugin that depends on `prismatic-skills` for the CNI builder handoff. The handoff mechanism is outdated — it references removed question IDs (`source_provide_credentials`, `scheduled_details`, `retry_config`), uses the old `gather_requirements.py` DAG engine (which no longer exists), and spawns the CNI builder via Task tool with a context file.

**Goal:** Port the migration functionality into this plugin so it uses our architecture: YAML spec, `prismatic-tools` synthetic dispatch, XML directives, connection flow, and JIT instruction delivery via tool output.

## Current Branch State

This branch (`bl/v2.1.0-updates`) has:
- YAML spec files (`scripts/questions/integration.yaml` + domain files)
- `pretooluse-dispatch.mjs` hook with `tool-manifest.json`
- Individual scripts (update-tasks, record-choices, code-plan, verify-code, etc.) each loading spec/answers independently
- No Session module (that was built on another branch)
- `loadSpec()` with `$include` support
- `getSessionDirectory()` / `getPluginRoot()` for path resolution
- cni-builder, component-builder, orby agents
- `record-choices.ts` with connection gates, inference batch gates, choice validation

---

## What Moves In

### Copy as-is (relocate):
| Source (migration-plugin) | Destination |
|---|---|
| `skills/boomi-migration/` (all) | `skills/boomi-migration/` |
| `skills/cyclr-migration/` (all) | `skills/cyclr-migration/` |
| `skills/migration-framework/references/standard-integration-schema.md` | `skills/migration-framework/references/standard-integration-schema.md` |

### Rewrite from Python to TypeScript:
| Source (Python) | Destination (TypeScript) | Notes |
|---|---|---|
| `scripts/parse_boomi_export.py` | `scripts/migration/parse-boomi-export.ts` | Port XML parsing to `fast-xml-parser` or Node `DOMParser` |
| `scripts/parse_cyclr_export.py` | `scripts/migration/parse-cyclr-export.ts` | Port JSON parsing + topological sort |
| `scripts/generate_mermaid_diagrams.py` | `scripts/migration/generate-mermaid-diagrams.ts` | Port Mermaid generation |
| `scripts/generate_requirements_context.py` | `scripts/migration/schema-to-answers.ts` | Uses loadSpec + record-choices patterns |

### Rewrite to fit our architecture:
| Source | Destination | Reason |
|---|---|---|
| `commands/migrate.md` | `commands/migrate-integration.md` | Uses prismatic-tools, not Task tool handoff |
| `agents/migration-analyzer.md` | `agents/migration-analyzer.md` | Updated tools list, prismatic-tools dispatch |
| `agents/migration-reviewer.md` | `agents/migration-reviewer.md` | Updated to output XML directives |
| `skills/migration-framework/references/schema-to-requirements-mapping.md` | rewritten | Maps to current spec item IDs |
| `skills/migration-framework/references/cni-handoff-guide.md` | deleted | No more Task tool handoff |

### New:
| File | Purpose |
|---|---|
| `scripts/migration/detect-platform.ts` | Detect Boomi vs Cyclr from export files |
| `scripts/migration/parse-export.ts` | Dispatcher that calls the right parser |
| `scripts/migration/schema-to-answers.ts` | Converts schema → spec answers via record-choices pattern |
| `skills/migration-framework/references/migration-code-gen-guide.md` | How to use API profiles + scripts during code gen |

---

## Architecture

### Flow:
```
/migrate-integration <export-path>
  │
  ├─ prismatic-tools detect-platform <path>     → { platform: "boomi"|"cyclr" }
  ├─ prerequisites <name> --type integration     → session dir created
  ├─ prismatic-tools parse-export <path> --platform <detected>  → parsed-export.json in session
  │
  ├─ [migration-analyzer agent spawned]
  │   ├─ Reads parsed-export.json (TypeScript parser output)
  │   ├─ Loads platform skill (boomi/cyclr)
  │   ├─ Builds migration-schema.json (AI judgment on parsed data)
  │   ├─ Generates diagrams via prismatic-tools generate-diagrams (Boomi only)
  │   └─ Returns to main agent with schema path
  │
  ├─ prismatic-tools schema-to-answers --session <name>   → pre-populates requirements.json
  ├─ prismatic-tools update-tasks --session <name> --actionable
  │   └─ Emits <draft-proposal> (most items pre-filled from schema)
  │
  ├─ Agent presents proposal → user confirms/corrects
  │
  ├─ Standard build flow: connections → scaffold → code-gen → build → deploy → test
  │   (code-plan emits <migration-context> with API profiles, script translations)
  │
  └─ [migration-reviewer agent spawned]
      ├─ Reads generated code + migration-schema.json
      ├─ Compares field names, endpoints, transformations
      └─ Returns structured review report
```

### Key design decisions:
1. **No Task tool handoff** — the `/migrate-integration` command uses the cni-builder agent directly. The migration-analyzer is a subagent for the analysis phase only.
2. **Standard session state** — migration artifacts live alongside requirements.json in the session dir.
3. **schema-to-answers uses record-choices patterns** — loads spec, validates choices, writes to requirements.json via the same code path. No special migration state format.
4. **update-tasks sees pre-populated answers** — most items show as `mark_completed`, remaining items (component search, connections) show as `create_required`. The `<draft-proposal>` fires naturally.
5. **code-plan includes migration context** — when `migration-schema.json` exists, emit API profiles and script translations so the agent has exact field names and Groovy→TS translation context.

---

## Synthetic Tools (add to tool-manifest.json)

```json
"detect-platform": {
  "script": "migration/detect-platform",
  "desc": "Detect whether export files are from Boomi or Cyclr",
  "usage": "<export-path>"
},
"parse-export": {
  "script": "migration/parse-export",
  "desc": "Parse a Boomi or Cyclr export into structured JSON",
  "usage": "<export-path> --platform <boomi|cyclr> [--summary]",
  "timeout": 60
},
"schema-to-answers": {
  "script": "migration/schema-to-answers",
  "desc": "Convert a migration schema to pre-populated spec answers",
  "usage": "--session <name> --schema <path>",
  "timeout": 30
}
```

---

## Script: `schema-to-answers.ts` (~200 lines)

The critical bridge. Maps migration schema fields to current spec item IDs:

| Schema field | Spec item | Notes |
|---|---|---|
| `integration.systems_summary` | `systems` | Text |
| `flows[0].trigger.type` | `trigger_type` | Map to choice slug: webhook/scheduled/polling |
| `flows[0].trigger.schedule` | `schedule_value` | Cron expression |
| `flows[].description + steps` | `data_flow` | Narrative |
| `systems[role=source].name` | `source_system` | Text |
| `systems[role=destination].name` | `destination_system` | Text |
| `data_transformations` | `transformations` | Narrative with field mappings |
| `error_handling.strategy` | `error_handler_type` | Map: "retry"→"retry", "stop"→"fail", "continue"→"ignore" |
| `error_handling.retry_count` | `error_retry_max_attempts` | Number as string |
| `error_handling.retry_delay` | `error_retry_delay_seconds` | Number as string |
| `migration_notes + config_variables + scripts` | `additional_requirements` | Full text with Groovy source |

**NOT pre-populated** (left for live discovery):
- `source_component`, `destination_component` — live registry search
- `source_connection_type`, `source_connection` — live connection search
- `flow_count`, `flow_definitions` — derived from schema but confirmed by user
- `additional_systems` — if 3+ systems in schema

Uses `loadSpec()` + `readFileSync`/`writeFileSync` for requirements.json (same pattern as record-choices.ts). Validates choice values against spec before writing.

---

## code-plan.ts Changes (~30 lines added)

When `migration-schema.json` exists in session dir, emit:
```xml
<migration-context>
  <api-profiles count="N">
    [Inline JSON of request/response profiles with exact field names, nesting paths]
  </api-profiles>
  <script-translations count="N">
    [Groovy source code with translation hints per script]
  </script-translations>
  <field-mappings count="N">
    [Source→destination field mappings from data_transformations]
  </field-mappings>
  <endpoints>
    [Known API endpoints with confidence scores]
  </endpoints>
</migration-context>
```

---

## Agent: migration-analyzer.md (~300 lines)

**Skills:** migration-framework, boomi-migration OR cyclr-migration
**Tools:** Read, Write, Bash, Glob, Grep, AskUserQuestion

**Workflow:**
1. Read parsed-export.json from session
2. Load platform-specific skill
3. Build standard integration schema (AI judgment on parsed data)
4. Score confidence per element
5. Generate Mermaid diagrams (Boomi only, via Python script)
6. Write migration-schema.json to session
7. Present migration plan to user with confidence overview

**XML output:**
```xml
<migration-plan platform="boomi" confidence="0.82">
  <systems count="2">
    <system name="Salesforce" role="source" auth="oauth2" confidence="0.9" />
    <system name="NetSuite" role="destination" auth="token" confidence="0.75" />
  </systems>
  <flows count="1">
    <flow name="Order Sync" trigger="webhook" steps="8" confidence="0.85" />
  </flows>
  <scripts count="2" language="groovy">
    <script name="transformOrder" lines="45" translatable="yes" />
  </scripts>
  <review-items count="3">
    Items requiring manual review after generation
  </review-items>
</migration-plan>
```

---

## Agent: migration-reviewer.md (~200 lines)

**Skills:** migration-framework, integration-patterns
**Tools:** Read, Glob, Grep

**8-point checklist:**
1. Field name accuracy (compare TS interfaces against API profiles)
2. Response structure (verify nesting paths)
3. HTTP error handling
4. Endpoint paths
5. Transformation completeness
6. Logic fidelity
7. CNI pattern compliance
8. Script translation completeness

**Output:** `<review-result>` XML with severity + fixability classification.

---

## Implementation Order

1. **Copy static assets** — platform skills (boomi, cyclr), schema reference docs
2. **Port parse-boomi-export.py → TypeScript** (~600 lines; needs `fast-xml-parser` for namespace-aware XML; Boomi uses `bns:` namespace for Component elements, `dragpoints` for shape connection graphs, configuration extraction per shape type)
3. **Port parse-cyclr-export.py → TypeScript** (~400 lines; pure TS — JSON parsing, Kahn's algorithm for topological sort of step execution order, `"stepId,fieldId"` reference resolution, connector deduplication)
4. **Port generate-mermaid-diagrams.py → TypeScript** (~200 lines; pure string templating — reads parsed Boomi export, outputs .mmd flowchart files)
5. **Create detect-platform.ts** — thin platform detection (~40 lines)
6. **Create parse-export.ts** — dispatcher that calls parse-boomi-export or parse-cyclr-export
7. **Create schema-to-answers.ts** — the key bridge (~200 lines)
8. **Register synthetic tools in tool-manifest.json** — detect-platform, parse-export, schema-to-answers, generate-diagrams
9. **Update code-plan.ts** — migration context emission
10. **Write migrate-integration.md command**
11. **Write migration-analyzer.md agent** — adapted from migration-plugin
12. **Write migration-reviewer.md agent** — adapted from migration-plugin
13. **Update plugin.json** — register command, agents, skills
14. **Write migration-code-gen-guide.md + update schema-to-requirements-mapping.md**
15. **Test with Boomi export** — end-to-end

---

## Verification

1. `prismatic-tools detect-platform <boomi-dir>` → `{ platform: "boomi" }`
2. `prismatic-tools parse-export <dir> --platform boomi --summary` → structured JSON
3. `prismatic-tools schema-to-answers --session test --schema <path>` → requirements.json populated
4. `prismatic-tools update-tasks --session test --actionable` → most items in mark_completed
5. End-to-end: `/migrate-integration <boomi-export>` completes through deploy
