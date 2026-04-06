---
name: migrate-integration
description: Migrate an integration from another platform (Boomi, Cyclr) to a Prismatic Code Native Integration
argument-hint: [export-path]
agent: cni-builder
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebFetch, WebSearch, TaskCreate, TaskUpdate, TaskList, TaskGet, AskUserQuestion
---

Migrate an integration from $ARGUMENTS to a Prismatic Code Native Integration.

<rules context="command" critical="true">
  <rule name="never-generate-directly">
    <never>Generate CNI TypeScript code during the analysis phase — that's the build phase's job</never>
  </rule>
  <rule name="never-preempt-search">
    <never>Pre-decide which Prismatic components exist — the standard build flow searches live</never>
  </rule>
  <rule name="use-prismatic-tools">
    <always>Use prismatic-tools synthetic commands for parsing and analysis</always>
    <never>Run Python scripts directly or call parsers via Bash</never>
  </rule>
</rules>

<procedure name="migration-workflow">

  <step name="detect-platform">
    If `$ARGUMENTS` is blank, ask the user for the path to their export files.
    Run: `prismatic-tools detect-platform <export-path>`
    If platform is "unknown", inform the user that only Boomi and Cyclr are supported.
    Derive session name from the export directory basename.
  </step>

  <step name="setup">
    Run: `npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/run.ts prerequisites <session-name> --type integration`
    This creates the session directory.
  </step>

  <step name="parse-export">
    Run: `prismatic-tools parse-export <export-path> --platform <detected> --session <session-name>`
    This produces parsed-export.json in the session directory.
    If --summary mode is useful for initial overview, run with --summary first, then full.
  </step>

  <step name="analyze" critical="true">
    Spawn the `migration-analyzer` agent with this prompt:

    "Analyze the {platform} export for session '{session-name}'.
    Session directory: {session-dir}
    The parsed export is at: {session-dir}/parsed-export.json

    Follow your full workflow:
    1. Read the parsed export from the session
    2. Load the {platform}-migration skill for platform-specific concepts
    3. Build the standard integration schema (migration-schema.json)
    4. Generate flow diagrams if Boomi
    5. Present the migration plan with confidence scores

    Write migration-schema.json to: {session-dir}/migration-schema.json"

    After the analyzer returns, present the migration plan to the user.
    Use AskUserQuestion: "Here's the migration plan. Ready to proceed?"
    WAIT for user approval before continuing.
  </step>

  <step name="pre-populate">
    Run: `prismatic-tools schema-to-answers --session <session-name> --schema <session-dir>/migration-schema.json`
    This pre-populates requirements.json with answers derived from the schema.
    The output lists what was pre-populated.
  </step>

  <step name="requirements">
    Run: `prismatic-tools update-tasks --session <session-name> --actionable`
    Most items will be in `mark_completed` (pre-populated from schema).
    Remaining items are component search, connection setup, and any decisions the schema couldn't resolve.

    If `<draft-proposal>` is emitted, present the full proposal to the user.
    Otherwise, walk through remaining questions one at a time per the standard requirements flow.
  </step>

  <step name="standard-build">
    From here, follow the standard build-integration workflow:
    - Connection search and setup
    - Confirm before scaffold
    - Scaffold project
    - Generate code (code-plan will include `<migration-context>` with API profiles and scripts)
    - Verify code
    - Build
    - Confirm before deploy
    - Deploy
    - Test
  </step>

  <step name="review" depends="standard-build">
    After a successful deploy, spawn the `migration-reviewer` agent with this prompt:

    "Review the generated CNI code against the migration schema.
    Project directory: {project-dir}
    Migration schema: {session-dir}/migration-schema.json

    Run your full 8-point review checklist. Compare field names, endpoints,
    transformations, and script translations against the original export data.
    Output a <review-result> XML report."

    Parse the reviewer's `<review-result>` output:
    - For `fixable="yes"` findings: apply the fixes, rebuild, and redeploy
    - For `fixable="needs-verification"` findings: present them to the user
    - If no findings: report clean migration
  </step>

  <step name="summary">
    Present the migration results:
    - What was migrated successfully
    - What requires manual configuration (connections, credentials)
    - What requires manual review (low-confidence mappings, untranslated scripts)
    - Link to the designer URL for the test instance
  </step>

</procedure>
