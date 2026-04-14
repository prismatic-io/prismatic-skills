---
name: boomi-migration
description: >
  This skill should be used when the user needs to analyze a Dell Boomi export,
  parse Boomi Component XML files, migrate from Boomi to Prismatic, convert Boomi
  processes to CNI flows, map Boomi shapes to Prismatic equivalents, or interpret
  Boomi connector settings, transform maps, and process properties. Relevant when
  the user says "analyze this Boomi export", "migrate from Boomi", "parse Boomi XML",
  "convert Boomi process to Prismatic", or "what does this Boomi shape map to".
---

# Boomi Migration

Knowledge for analyzing Dell Boomi Component XML exports and converting them to the standard integration schema for Prismatic CNI migration.

## Boomi Export Format

Boomi exports are directories of XML files, each representing a single component. Each file uses the `bns:Component` wrapper from the `http://api.platform.boomi.com/` namespace.

**File naming convention**: `<name>__<type>__<subType>__<componentId>.xml`
- Example: `[0010] MAIN - Dacra Interface__process__8b67b542-c021-401f-8a84-6f3819d4d778.xml`

**Component types** found in exports:
- `process` - Workflows/orchestrations with shapes (steps) and connections
- `connector-settings` - Connection configurations (HTTP, database, etc.)
- `connector-action` - API operations (GET, POST, etc.)
- `transform.map` - Data transformation maps with field mappings and functions
- `profile.json` / `profile.xml` / `profile.flatfile` - Data structure definitions
- `crossref` - Cross-reference lookup tables
- `processproperty` - Configurable process properties
- `documentcache` - In-memory document caching
- `script.mapping` / `script.processing` - Groovy scripts
- `transform.function` - User-defined reusable functions

## Parser

Use `prismatic-tools parse-export` to deterministically extract structured data from the export directory. The parser handles all XML parsing and outputs JSON. See `references/boomi-export-parsing.md` for interpreting the output.

```bash
# Full output
prismatic-tools parse-export <export-directory> --platform boomi

# Summary mode (condensed overview for quick scope assessment)
prismatic-tools parse-export <export-directory> --platform boomi --summary
```

**Efficient reading strategy:** For large exports, use `--summary` first to understand the scope (process names, system names, endpoint paths, profile field counts). Then read the full output selectively — start with processes and connectors, only read profiles and transforms when needed.

## Shape Type Mapping

See `references/boomi-concepts-mapping.md` for the complete shape-by-shape conversion table mapping Boomi shapes to Prismatic CNI equivalents.

Key mappings:
- Start (noaction) → Scheduled/manual trigger
- Process Call → Sub-flow or inline steps
- Connector Action → Component action or HTTP call
- Map → Data transformation logic
- Decision → Conditional logic (if/else)
- Branch → Parallel execution paths
- Catch Errors → Try/catch error handling

## Analysis Workflow

When analyzing a Boomi export:

1. **Run the parser script** to get structured JSON
2. **Identify the MAIN process** - Look for `MAIN` or `[MAIN]` in process names
3. **Separate monitoring from business logic** - Exclude processes with `[OTEL]`, `[Monitoring]`, or `[MONITORING]` prefixes
4. **Trace the shape graph** - Follow dragpoint connections from the start shape to understand flow
5. **Identify systems** - Connection settings reveal source/destination systems
6. **Analyze transformations** - Transform maps show field mappings and functions
   - Ensure all Groovy script source code from script.mapping, script.processing, and transform.function components is carried into the schema — not just metadata
7. **Extract config variables** - Overrideable process properties and connection fields become configVars
8. **Assess confidence** - Rate each migration element based on concept mapping complexity
9. **Produce standard schema** - Assemble findings into the standard integration schema JSON
