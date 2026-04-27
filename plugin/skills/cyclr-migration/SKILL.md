---
name: cyclr-migration
description: >
  This skill should be used when the user needs to analyze a Cyclr export,
  parse Cyclr JSON files, migrate from Cyclr to Prismatic, convert Cyclr
  cycles to CNI flows, map Cyclr steps to Prismatic equivalents, or interpret
  Cyclr connector settings, field mappings, and cycle parameters. Relevant when
  the user says "analyze Cyclr export", "migrate from Cyclr", "parse Cyclr JSON",
  "convert Cyclr cycle to Prismatic", or "what does this Cyclr step map to".
---

# Cyclr Migration

Knowledge for analyzing Cyclr cycle JSON exports and converting them to the standard integration schema for Prismatic CNI migration.

## Cyclr Export Format

Cyclr exports are single JSON files per cycle. Each file contains the complete cycle definition including steps, edges, variables, and connector metadata.

**Top-level keys in export:**
- `VersionedCycle` - Version metadata and publication status (Tags, Published)
- `Steps[]` - Array of step definitions with connector info, field mappings, and parameters
- `Edges[]` - Directed edges defining execution order (TailStep_Id → HeadStep_Id)
- `Variables[]` - Cycle-level variables
- `ExportedConnectors[]` - Encrypted connector data (not parseable — auth details come from Steps instead)
- `Name` - Cycle display name
- `Status` - Cycle status code
- `CustomMethodReleases[]` - Custom API method definitions if any
- `ShareFields[]` - Fields exposed to customer configuration
- `CycleStepErrorAction` - Error handling strategy
- `MaxRetriesOnError` - Retry configuration

**Note:** `ExportedConnectors` contains encrypted data and cannot be used for migration. All connector and authentication details are extracted from the `AccountConnector` blocks within each step.

## Parser

Use `prismatic-tools parse-export` to deterministically extract structured data from Cyclr JSON exports. The parser handles all JSON parsing, reference resolution, and topological sorting, then outputs JSON. See `references/cyclr-export-parsing.md` for interpreting the output.

```bash
# Full output from a single file
prismatic-tools parse-export <export-file.json> --platform cyclr

# Full output from a directory of cycle exports
prismatic-tools parse-export <export-directory> --platform cyclr

# Summary mode (condensed overview for quick scope assessment)
prismatic-tools parse-export <export-path> --platform cyclr --summary
```

**Efficient reading strategy:** For multi-cycle exports, use `--summary` first to understand the scope (cycle names, step counts, connector types, field mapping counts). Then read the full output selectively — start with execution order and connectors, only read detailed field mappings and parameters when needed.

## Step Type Mapping

See `references/cyclr-concepts-mapping.md` for the complete ActionType-by-ActionType conversion table mapping Cyclr step types to Prismatic CNI equivalents.

Key mappings:
- ActionType 1 (Standard) → Component action or HTTP call
- ActionType 2 (Decision) → Conditional logic (if/else)
- ActionType 3 (Delay) → setTimeout/scheduled pause
- ActionType 4 (Script) → Custom TypeScript logic
- ActionType 5 (Webhook) → Webhook trigger

## Analysis Workflow

When analyzing a Cyclr export:

1. **Run the parser script** to get structured JSON
2. **Identify the trigger step** — First in execution_order; look for ActionType=5 (webhook), Interval>0 (polling), or the step with no incoming edges
3. **Trace the step graph** — Follow execution_order and edges to understand flow; handle decision branches via edge types
4. **Identify systems** — Deduplicated connectors reveal source/destination systems
5. **Analyze field mappings** — CycleFieldMappings show data transformations between steps; resolve "stepId,fieldId" references using parser output
6. **Resolve parameter dependencies** — CycleParameters show how step parameters are fed from previous step outputs
7. **Extract config variables** — From Variables[], ShareFields[], and IsLaunchVisible parameters
8. **Assess confidence** — Rate each migration element based on concept mapping complexity
9. **Produce standard schema** — Assemble findings into the standard integration schema JSON
