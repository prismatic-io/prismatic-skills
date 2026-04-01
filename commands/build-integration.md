---
name: build-integration
description: Build and deploy a Prismatic Code Native Integration (CNI)
agent: cni-builder
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebFetch, WebSearch, TaskCreate, TaskUpdate, TaskList, TaskGet, AskUserQuestion
---

Build a Prismatic Code Native Integration for $ARGUMENTS.

Voice and narration style are defined in the agent instructions. Follow them.

<rules context="command" critical="true">
  <rule name="spec-drives-everything">
    <always>Let the sync script determine what tasks to create and what questions to ask. It reads the spec, evaluates conditions, and returns actionable items.</always>
    <never>Pre-decide what components or answers are needed. Never search for components or write answers before the sync script tells you to.</never>
  </rule>
  <rule name="build-commands">
    <always>Use `npm run build --prefix &lt;project-dir&gt;` for builds</always>
    <never>Run `npx webpack` or `npx tsc` directly</never>
    <never>cd into the project directory — use `--prefix` for npm</never>
  </rule>
  <rule name="answer-writing" critical="true">
    <always>Write ALL answers with key=value pairs in one command: `prismatic-tools record-choices {requirements_file} key=value key2=value2`. JSON values are auto-parsed — pass directly: `'source_component={"key":"shopify",...}'`</always>
    <never>Edit requirements.json directly with Edit or Write tools</never>
    <never>Create temp JSON files with the Write tool for answer persistence</never>
    <never>Construct JSON with heredocs (`cat > file << EOF`) or echo redirects</never>
  </rule>
  <rule name="cookbook-before-code">
    <always>Read the answer-to-code cookbook BEFORE writing ANY code</always>
    <never>Generate code without first reading the cookbook and templates</never>
  </rule>
</rules>

<procedure name="workflow">

  <step name="setup">
    Run `npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/prerequisites.ts <name> --type integration`. Brief the user on what you're verifying and what the session directory is for.
  </step>

  <step name="run-sync-script">
    Run the task sync script to discover what spec items need user input:
    <command>
      prismatic-tools update-tasks --session <name> --actionable
    </command>
    Parse the JSON output. It contains `create_required`, `mark_completed`, `create_optional`, `blocked_count`, and `ready_for_next_phase`.
  </step>

  <step name="create-requirement-tasks" depends="run-sync-script" critical="true">
    <rules critical="true">
      <always>Create a task for EVERY item in `create_required` — all TaskCreate calls in parallel.</always>
      <never>Skip items from `create_required`</never>
      <never>Create phase tasks (Scaffold, Build, Deploy) during requirements — they clutter the task list</never>
      <never>Create tasks for `mark_completed` items (already inferred) or `create_optional` items (handle conversationally)</never>
    </rules>
    Use item.subject as the task subject.
  </step>

  <step name="narrate-inferences" depends="run-sync-script">
    For items in `mark_completed`, explain to the user IN THE CONVERSATION what you inferred:
    - What you picked up from their description
    - Which spec answer it maps to
    - What it means for the integration architecture
    Be verbose and educational. This is where personality shines.
  </step>

  <step name="gather-requirements">
    <rules critical="true">
      <rule name="one-at-a-time">
        <always>Present exactly ONE question per message. After presenting, STOP and wait for the user's response.</always>
        <never>Batch multiple questions into one message — even if they seem related (e.g., Shopify connection type and NetSuite connection type are separate turns).</never>
      </rule>
      <rule name="sync-after-each-answer">
        <always>After writing each answer, re-run the sync script with --actionable. The sync script determines what question comes next — not you.</always>
        <never>Decide the next question yourself. The sync script evaluates conditions and may surface follow-up questions (e.g., connection management options after connection type is chosen).</never>
      </rule>
    </rules>

    <loop name="requirement-loop">
      <substep>Pick the next pending task from the task list</substep>
      <substep>Explain the question — what Prismatic concept it configures and why it matters</substep>
      <substep>Present choices with tradeoffs, then STOP and wait for the user's response</substep>
      <substep>Write the answer AND re-sync in one call:
        `prismatic-tools record-choices {requirements_file} --sync {spec_file} key=value`
        (JSON values auto-parsed in key=value pairs)
        The output includes both the write confirmation and the sync result.</substep>
      <substep>Mark the task completed with TaskUpdate</substep>
      <substep>Create tasks for any new `create_required` items from the sync output</substep>
      <substep>Repeat from top — present the NEXT single question</substep>
    </loop>

    When the sync script reports `ready_for_next_phase: true`, requirements are complete.
  </step>

  <step name="credentials">
    Collect OAuth/API credentials if needed. Explain what each credential is for.
  </step>

  <step name="scaffold">
    TaskCreate(subject: "Scaffold project") and mark in_progress.
    Run: `npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/run.ts scaffold-project <name> --components <comp1,comp2> [--private-components <comp1>]`
    <rules>
      <always>Include ALL components selected during requirements — source_component, destination_component, AND any connector_N_component answers</always>
      <always>If a component has `public: false` in the find-components result, include it in --private-components</always>
      <never>Add components that weren't selected in requirements</never>
    </rules>
    Validate: `prismatic-tools validate-phase <project-dir> --phase scaffold --type integration`
    Mark completed.
  </step>

  <step name="generate-code">
    TaskCreate(subject: "Generate integration code") and mark in_progress.

    BEFORE writing ANY code:
    1. Run `prismatic-tools code-plan --session <name> --type integration` to get the code-gen manifest
    2. Read each cookbook section and reference file listed in the manifest
    3. Templates (read ALL that apply):
       - `${CLAUDE_PLUGIN_ROOT}/templates/integration/componentRegistry.ts.template`
       - `${CLAUDE_PLUGIN_ROOT}/templates/integration/configPages.ts.template`
       - `${CLAUDE_PLUGIN_ROOT}/templates/integration/flows.ts.template`
       - `${CLAUDE_PLUGIN_ROOT}/templates/integration/index.ts.template`
       - Multi-flow only: `${CLAUDE_PLUGIN_ROOT}/templates/integration/flows-index.ts.template`
    4. Check `<verify-coverage>` — escalate uncovered architectural items to Orby

    <rules>
      <always>Use connectionConfigVar() wrapper for connections on config pages — as shown in configPages.ts.template</always>
      <always>Use onInstanceDeploy/onInstanceDelete for lifecycle hooks — as shown in flows.ts.template</always>
      <never>Use webhookLifecycleHandlers — causes "Invalid trigger configuration" deploy errors</never>
      <never>Define onTrigger for webhook flows unless custom parsing or a component trigger is needed — default passes payload through</never>
      <never>Use raw connection constructors directly in configPages</never>
    </rules>

    Required files: componentRegistry.ts, configPages.ts, flows (single file or flows/ directory), index.ts, documentation.md, .spectral/flows/

    Validate structure: `prismatic-tools validate-phase <project-dir> --phase code-gen --type integration`
    Verify semantics: `prismatic-tools verify-code <project-dir> --session <name>`
    If verify-code reports gaps (spec answers not reflected in code), fix the generated code BEFORE building.
    Mark completed.
  </step>

  <step name="build">
    TaskCreate(subject: "Build integration") and mark in_progress.
    Build: `npm run build --prefix <project-dir>`
    Validate: `prismatic-tools validate-phase <project-dir> --phase build --type integration`
    If build fails: run `prismatic-tools diagnose-build <project-dir> --type integration` before attempting manual fixes.
    Mark completed.
  </step>

  <step name="confirm-import">
    Present a summary: integration name, components, flows, connections.
    Use AskUserQuestion: "Build succeeded. I'll import this to your Prismatic environment so we can test it — this creates a test instance you can configure. Ready?"
    Options: "Yes, import and test" / "No, I want to make changes first"
    WAIT for the user's response. Do NOT import without explicit confirmation.
  </step>

  <step name="import">
    TaskCreate(subject: "Import to Prismatic") and mark in_progress.
    Pre-import validation: `prismatic-tools validate-phase <project-dir> --phase deploy --type integration`
    Import: `npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/run.ts deploy-integration <project-dir>`
    This opens the designer in the browser so the user can configure the test instance.
    Mark completed.
  </step>

  <step name="test">
    TaskCreate(subject: "Test integration") and mark in_progress.

    <test-workflow>
      After deploy, do NOT stop. Guide the user through configuring and testing:

      <substep name="check-instance">
        Request Orby to check the test instance and surface the config wizard URL:
        <orby-request>
          For integration [name] (ID: [integration-id]):
          1. Find the test/system instance
          2. List unconfigured connections and config variables
          3. Provide the direct URL to the config wizard for the test instance
        </orby-request>
        Wait for Orby's response.
      </substep>

      <substep name="present-url">
        Present the config wizard URL to the user:
        "Your integration is deployed. Configure the test instance here: [URL]"
        List what needs configuring — connections (with OAuth flows to complete) and config variables.
      </substep>

      <substep name="confirm-ready">
        Use AskUserQuestion:
        "Have you configured the connections and config variables in the test instance?"
        Options: "Yes, run the test" / "Not yet, I need help"
        If "not yet": walk through each unconfigured item.
      </substep>

      <substep name="run-test">
        Run: `prismatic-tools test-integration <integration-id> --integration-dir <project-dir>`
      </substep>

      <substep name="report">
        Report results — what succeeded, what failed, what requires real credentials.
        If test failed with connection errors, remind the user to configure connections in the admin.
      </substep>
    </test-workflow>

    Mark completed.
  </step>

  <step name="iterate">
    Fix issues, rebuild, redeploy, retest. Explain root cause before each fix.
  </step>

  <step name="summary">
    Return summary of what was created.
  </step>

</procedure>
