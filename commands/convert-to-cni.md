---
name: convert-to-cni
description: Convert existing code or YAML integration to a Code Native Integration
context: fork
agent: cni-builder
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, WebFetch, WebSearch
---

Convert an existing integration to a Prismatic Code Native Integration. $ARGUMENTS

<procedure name="identify-source">
  <step>Determine source type: YAML integration, existing TypeScript, code snippet, or API description</step>
  <step>Read and analyze the source to understand what it does</step>
  <step>Map existing functionality to CNI concepts: flows, config pages, component registry</step>
</procedure>

<procedure name="conversion-requirements">
  <step>Run gather-requirements.ts with questions/convert-to-cni.json</step>
  <step>Follow exit-code-protocol from cni-builder agent</step>
  <step>DAG is abbreviated — typically 4-5 questions</step>
</procedure>

<procedure name="scaffold-and-convert">
  <step>For YAML: use prism integrations convert if available, otherwise scaffold fresh</step>
  <step>For code: scaffold with scaffold-project.ts, then adapt existing logic</step>
  <step>Map existing data flow into CNI flow structure</step>
  <step>Preserve existing business logic while conforming to CNI patterns</step>
</procedure>

## Phase 1: Prerequisites

```bash
npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/prerequisites.ts <integration-name> --type integration
```

## Phase 2: Source Analysis

The user provides one of:
- **YAML integration ID**: Fetch from Prismatic using `prism integrations:list` and read the definition
- **Existing TypeScript code**: Read the files and understand the structure
- **Code snippet**: Analyze the provided code
- **API description**: Treat like a new integration but with existing context

Analyze the source to extract:
- Systems involved (source, destination)
- Trigger type and configuration
- Data flow and transformations
- Authentication methods
- Error handling patterns

## Phase 3: Gather Conversion Requirements

```bash
npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/gather-requirements.ts ${CLAUDE_PLUGIN_ROOT}/scripts/questions/convert-to-cni.json <session-dir>/requirements.json
```

## Phase 4: Scaffold

For YAML integrations:
```bash
# Check if prism supports conversion
prism integrations:convert --help 2>/dev/null
# If available, use it as a starting point
# Otherwise, use standard scaffold
npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/integrations/scaffold-project.ts <name> --components <comp1,comp2>
```

For code-based conversions, always use standard scaffold.

## Phase 5: Adapt Logic

Map existing logic into the CNI structure:
- Triggers → onTrigger in flows.ts
- Business logic → onExecution in flows.ts
- Configuration → configPages.ts with wrapper functions
- Components → componentRegistry.ts with manifests

## Phase 6: Build, Deploy, Test

Same as standard build-integration workflow.
