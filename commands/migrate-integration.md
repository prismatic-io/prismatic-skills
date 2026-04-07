---
name: migrate-integration
description: Migrate an integration from another platform to a Prismatic Code Native Integration
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
    Output an `<analyzer-request>` tag to delegate analysis to the migration-analyzer agent.
    The main conversation handles the handoff (see CLAUDE.md orchestration).

    ```
    I need the migration analyzer to build the integration schema.
    <analyzer-request>
    Analyze the {platform} export for session '{session-name}'.
    Session directory: {session-dir}
    The parsed export is at: {session-dir}/parsed-export.json

    Follow your full workflow:
    1. Read the parsed export from the session
    2. Load the {platform}-migration skill for platform-specific concepts
    3. Build the standard integration schema (migration-schema.json)
    4. Generate flow diagrams if Boomi
    5. Present the migration plan with confidence scores

    Write migration-schema.json to: {session-dir}/migration-schema.json
    </analyzer-request>
    ```

    Then STOP and wait for the analyzer's response via SendMessage.
    After it returns, present the migration plan to the user.
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
    <rules critical="true">
      <rule name="component-results">
        <always>When find-components returns a result, record the FULL JSON object — not a bare string key</always>
        <always>When find-components returns empty, ask the user: "No Prismatic component exists for [system]. Options: 1) Research the API and use direct HTTP calls, 2) Build a custom component first"</always>
        <never>Silently decide to use HTTP calls — the user must confirm</never>
      </rule>
      <rule name="build-custom-component-branch">
        <always>If the user chooses "build custom component":</always>
        <always>1. Record *_component=none for that system (activates api_docs_url question)</always>
        <always>2. Ask for or use API docs URL from migration schema</always>
        <always>3. Spawn external-api-researcher to analyze the API</always>
        <always>4. WAIT for researcher to complete</always>
        <always>5. Launch /build-component for that system using the research</always>
        <always>6. After component is published, re-run find-components — now it exists</always>
        <always>7. Record the real component object and continue the connection flow</always>
        <never>Launch /build-component without running the API researcher first</never>
      </rule>
      <rule name="direct-http-branch">
        <always>If the user chooses "direct HTTP calls":</always>
        <always>1. Record *_component=none (activates api_docs_url question)</always>
        <always>2. Ask for or use API docs URL from migration schema</always>
        <always>3. Spawn external-api-researcher to analyze the API</always>
        <always>4. WAIT for researcher to complete — research informs code generation</always>
        <always>5. Continue with HTTP component for connections</always>
      </rule>
    </rules>

    From here, follow the standard build-integration workflow:
    - Component search for each system (record full object or "none")
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
    After a successful deploy, output a `<reviewer-request>` tag:

    ```
    I need the migration reviewer to validate the generated code.
    <reviewer-request>
    Review the generated CNI code against the migration schema.
    Project directory: {project-dir}
    Migration schema: {session-dir}/migration-schema.json

    Run your full 8-point review checklist. Compare field names, endpoints,
    transformations, and script translations against the original export data.
    Output a <review-result> XML report.
    </reviewer-request>
    ```

    Then STOP and wait for the reviewer's response via SendMessage.
    Parse the `<review-result>` output:
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
