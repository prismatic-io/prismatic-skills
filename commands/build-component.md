---
name: build-component
description: Build and deploy a Prismatic custom component
allowed-tools: Bash, Read, AskUserQuestion, Grep, Glob, Edit, Write, Task
---

Build a Prismatic custom component for $ARGUMENTS.

You are an orchestrator. Run setup and requirements gathering in the main conversation, then delegate heavy work to sub-agents. All scripts are relative to `${CLAUDE_PLUGIN_ROOT}/scripts/`.

## Phase 1: Setup

Run prerequisites:

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/prerequisites.py <component-name> --type component
```

Capture `session_dir` and `requirements_file` from the JSON output at the end.

## Phase 2: Requirements Gathering

Run `gather_requirements.py` in a loop. On each iteration:

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/gather_requirements.py \
  ${CLAUDE_PLUGIN_ROOT}/scripts/questions/component.json \
  <requirements_file>
```

### Exit code handling

1. Check the exit code:
   - **Exit 0**: Parse the JSON output and check the `status` field (see below).
   - **Exit 42**: Present the EXACT question to the user with AskUserQuestion. Do NOT infer. Wait for their answer. Write the answer with `write_answer.py`, then re-run `gather_requirements.py`.
   - **Exit 2**: Error — report and stop.

2. If exit 0, check the `status` field:
   - **`"question"` with `allow_inference: true`**: You MAY infer if confident. Otherwise ask the user. Write the answer with `write_answer.py`, then re-run.
   - **`"question"` with `allow_inference` absent or `false`**: Ask the user with AskUserQuestion. Write the answer, then re-run.
   - **`"agent_task"`**: Proceed to Phase 3 (API Research).
   - **`"complete"`**: Proceed to Phase 4 (Build).

3. **For `choice` / `multi_choice` questions**: Write the answer using the **EXACT text** from the `choices` array. Never paraphrase or abbreviate (e.g., write `"Application Connector"`, not `"connector"`).

4. Write the answer and re-run `gather_requirements.py`.

## Phase 3: API Research (Application Connectors only)

When `gather_requirements.py` outputs `status: "agent_task"`:

1. Spawn the `external-api-researcher` sub-agent using the Task tool
   - Use the `task.prompt` from the output as the prompt
   - Replace any `{session_dir}` in the prompt with the actual session directory path
   - The researcher will use WebFetch to analyze the API documentation and return structured findings

2. After the researcher completes, save the research results to `<session_dir>/api-research.json` if the researcher hasn't already done so.

3. Mark the question as answered:
   ```bash
   python3 ${CLAUDE_PLUGIN_ROOT}/scripts/write_answer.py <requirements_file> spawn_api_researcher completed
   ```

4. Re-run `gather_requirements.py` to continue with the remaining questions (auth type confirmation, resources, webhooks, etc.).

## Phase 4: Build

Spawn the `component-builder` sub-agent using the Task tool with a prompt like:

> Build the Prismatic component '<component-name>'.
> Session directory: <session_dir>
> Requirements: <session_dir>/requirements.json
> API research: <session_dir>/api-research.json (READ THIS FILE for endpoint details)
>
> Requirements and API research are already complete. Do NOT re-research the API.
> Skip to scaffolding (Phase 3 in your workflow), then generate code, build, publish, and validate.

The builder will scaffold the component, generate code, build, publish, and validate.

## Phase 5: Iterate

If the builder reports issues or the user wants changes, resume the `component-builder` sub-agent with the specific issue to address.
