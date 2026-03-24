---
name: build-component
description: Build and deploy a Prismatic custom component
context: fork
agent: component-builder
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebFetch, WebSearch, TaskCreate, TaskUpdate, TaskList, TaskGet
---

Build a Prismatic custom component for $ARGUMENTS.

Voice and narration style are defined in the agent instructions. Follow them.

<rules context="command" critical="true">
  <rule name="spec-drives-everything">
    <always>Let the sync script determine what tasks to create and what questions to ask. It reads the spec, evaluates conditions, and returns actionable items.</always>
    <never>Pre-decide what auth type or actions are needed. Never write answers before the sync script tells you to.</never>
  </rule>
  <rule name="build-commands">
    <always>Use `npm run build --prefix <project-dir>` for builds</always>
    <never>Run `npx webpack` or `npx tsc` directly</never>
    <never>cd into the project directory — use `--prefix` for npm</never>
  </rule>
  <rule name="answer-writing" critical="true">
    <always>Write ALL answers with key=value pairs in one command: `prismatic-tools record-choices --session <name> --type component key=value key2=value2`. JSON values are auto-parsed.</always>
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
    Run `npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/run.ts prerequisites <name> --type component`. Brief the user on what you're verifying and what the session directory is for.
  </step>

  <step name="run-sync-script">
    Run the task sync script to discover what spec items need user input:
    <command>
      prismatic-tools update-tasks --session <name> --type component --actionable
    </command>
    Parse the JSON output. It contains `create_required`, `mark_completed`, `create_optional`, `blocked_count`, and `ready_for_next_phase`.
  </step>

  <step name="create-requirement-tasks" depends="run-sync-script" critical="true">
    <rules critical="true">
      <always>Create a task for EVERY item in `create_required` — all TaskCreate calls in parallel.</always>
      <never>Skip items from `create_required`</never>
      <never>Create phase tasks (Scaffold, Build, Publish) during requirements — they clutter the task list</never>
      <never>Create tasks for `mark_completed` items (already inferred) or `create_optional` items (handle conversationally)</never>
    </rules>
    Use item.subject as the task subject.
  </step>

  <step name="narrate-inferences" depends="run-sync-script">
    For items in `mark_completed`, explain to the user IN THE CONVERSATION what you inferred:
    - What you picked up from their description
    - Which spec answer it maps to
    - What it means for the component architecture
    Be verbose and educational. This is where personality shines.
  </step>

  <step name="gather-requirements">
    <rules critical="true">
      <rule name="one-at-a-time">
        <always>Present exactly ONE question per message. After presenting, STOP and wait for the user's response.</always>
        <never>Batch multiple questions into one message — even if they seem related.</never>
      </rule>
      <rule name="sync-after-each-answer">
        <always>After writing each answer, re-run the sync script with --type component --actionable. The sync script determines what question comes next — not you.</always>
        <never>Decide the next question yourself. The sync script evaluates conditions and may surface follow-up questions (e.g., webhook config after component_type is chosen).</never>
      </rule>
    </rules>

    <loop name="requirement-loop">
      <substep>Pick the next pending task from the task list</substep>
      <substep>Explain the question — what Prismatic concept it configures and why it matters</substep>
      <substep>Present choices with tradeoffs, then STOP and wait for the user's response</substep>
      <substep>Write the answer with record-choices --type component. The output includes both the write confirmation and the sync result.</substep>
      <substep>Mark the task completed with TaskUpdate</substep>
      <substep>If on_answer action triggered (e.g., api_docs_url → inline research), execute it immediately</substep>
      <substep>Create tasks for any new `create_required` items from the sync output</substep>
      <substep>Repeat from top — present the NEXT single question</substep>
    </loop>

    When the sync script reports `ready_for_next_phase: true`, requirements are complete.
  </step>

  <step name="scaffold">
    TaskCreate(subject: "Scaffold component") and mark in_progress.
    Run: `npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/run.ts scaffold-component <name>`
    <rules>
      <never>Create directories or write files manually before the scaffold script runs</never>
      <never>Use MCP tools for scaffolding</never>
    </rules>
    Validate: `prismatic-tools validate-phase <project-dir> --phase scaffold --type component`
    Mark completed.
  </step>

  <step name="generate-code">
    TaskCreate(subject: "Generate component code") and mark in_progress.

    BEFORE writing ANY code, read these files in this order:
    1. Cookbook: skill `component-patterns/references/answer-to-code-cookbook.md`
    2. Templates: `${CLAUDE_PLUGIN_ROOT}/templates/component/` (read ALL that apply)
    3. requirements.json to get all answers
    4. For each answer with `cookbook_section`, Grep for that heading in the cookbook

    <rules>
      <always>Follow templates exactly for file structure</always>
      <always>Use connection credentials via `params.connection.fields` in action perform functions</always>
      <never>Use raw fetch or axios — use the client helper</never>
      <never>Generate code without first reading the cookbook and templates</never>
    </rules>

    Required files depend on component type (see agent code-patterns section).
    Validate: `prismatic-tools validate-phase <project-dir> --phase code-gen --type component`
    Mark completed.
  </step>

  <step name="build-publish">
    TaskCreate(subject: "Build component") and mark in_progress.
    Build: `npm run build --prefix <project-dir>`
    Validate: `prismatic-tools validate-phase <project-dir> --phase build --type component`
    If build fails: run `prismatic-tools diagnose-build <project-dir> --type component` before attempting manual fixes.
    Mark completed.

    TaskCreate(subject: "Publish to Prismatic") and mark in_progress.
    Publish: `npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/run.ts publish-component <project-dir>`
    Validate: `npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/run.ts validate-component <project-dir>`
    Mark completed.
  </step>

  <step name="iterate">
    Fix issues, rebuild, republish. Explain root cause before each fix.
  </step>

  <step name="summary">
    Return summary of what was created: component name, key, auth type, actions, triggers, and where the project lives.
  </step>

</procedure>
