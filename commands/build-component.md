---
name: build-component
description: Build and deploy a Prismatic custom component
context: fork
agent: component-builder
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, WebFetch, WebSearch
---

Build a Prismatic custom component for $ARGUMENTS.

<express-mode>
  <trigger>User's $ARGUMENTS contains more than a simple name — describes API, auth type, actions, or URLs</trigger>
  <procedure>
    <step>Extract answers from the description into a context JSON file</step>
    <step>Write to {session_dir}/express-context.json</step>
    <step>Run gather-requirements.ts with --context {session_dir}/express-context.json</step>
    <step>DAG skips pre-populated questions, only asks unknowns</step>
  </procedure>
  <extraction-rules>
    <rule>"utility" / "helper" / "transform" → component_type = "Utility/Logic Component"</rule>
    <rule>"connector" / "API" / "integration" → component_type = "Application Connector"</rule>
    <rule>API/service names → api_name</rule>
    <rule>URLs (https://...) → api_docs_url</rule>
    <rule>Action descriptions → utility_actions or component_description</rule>
  </extraction-rules>
</express-mode>

## STOP — Read Before Proceeding

- Do NOT spawn the `external-api-researcher` agent. Research is performed inline when the DAG requests it.
- The questionnaire DAG (`gather-requirements.ts`) searches for existing Prismatic components automatically and will emit an `inline_task` when API research is actually needed.
- If the user provides an API docs URL in their request, hold onto it — do NOT use it to eagerly launch research. The questionnaire will ask for it at the right time.

<procedure name="setup">
  <step>Run prerequisites.ts with --type component</step>
  <step>Capture session_dir and requirements_file from JSON output</step>
  <step>Do NOT manually mkdir session directories</step>
</procedure>

<procedure name="requirements-loop">
  <step>Run gather-requirements.ts</step>
  <step>Check exit code per exit-code-protocol</step>
  <step>If exit 42: use AskUserQuestion, write answer with write-answer.ts, re-run</step>
  <step>If exit 0 + inline_task: perform research directly using WebFetch/WebSearch, save to output_file, mark answered, re-run</step>
  <step>If exit 0 + question (allow_inference): infer if 100% confident, otherwise ask user, write answer, re-run</step>
  <step>If exit 0 + complete: proceed to next phase</step>
</procedure>

## Phase 1: Setup

Run prerequisites:

```bash
npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/prerequisites.ts <component-name> --type component
```

Capture `session_dir` and `requirements_file` from the JSON output.

**Do NOT manually create session directories with `mkdir`. Always use `prerequisites.ts`.**

## Workflow

1. Run prerequisites check (see Phase 1 above — the `--type component` flag is required)
2. Gather requirements via the DAG questionnaire — it handles component search and conditionally triggers API research
   - If the completion output includes `"shape_valid": false`, warn the user about missing requirements before proceeding
3. Scaffold component with `scaffold-component.ts`
4. **Validate scaffold:** `npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/shared/validate-phase.ts <component-dir> --phase scaffold --type component`
5. Generate code using component-patterns skill and templates from `${CLAUDE_PLUGIN_ROOT}/templates/component/`
   - Read the relevant template files to understand required structure
   - Only load phase-appropriate skill references (see SKILL.md phase tags)
6. **Validate code generation:** `npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/shared/validate-phase.ts <component-dir> --phase code-gen --type component`
7. Build, publish, and validate
   - If build fails, run `npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/shared/diagnose-build.ts <component-dir> --type component` before attempting manual fixes
8. **Validate build:** `npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/shared/validate-phase.ts <component-dir> --phase build --type component`
9. Return summary of what was created

## Inline Task Handling

When `gather-requirements.ts` outputs `status: "inline_task"`:

1. Perform the task described in `task.description` directly using WebFetch/WebSearch
2. Follow the instructions in `task.instructions`
3. Save results to the file specified in `task.output_file`
4. Mark the question as answered:
   ```bash
   npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/write-answer.ts <requirements_file> <question_id> completed
   ```
5. Re-run `gather-requirements.ts` to continue with remaining questions.
