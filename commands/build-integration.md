---
name: build-integration
description: Build and deploy a Prismatic Code Native Integration (CNI)
context: fork
agent: cni-builder
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, Task
---

Build a Prismatic Code Native Integration for $ARGUMENTS.

## STOP — Read Before Proceeding

- Do NOT spawn the `external-api-researcher` agent at the start. Do NOT parallelize research with prerequisites.
- The questionnaire DAG (`gather_requirements.py`) searches for existing Prismatic components automatically and will emit an `agent_task` when API research is actually needed.
- If the user provides an API docs URL in their request, hold onto it — do NOT use it to eagerly launch research. The questionnaire will ask for it at the right time.
- If a component already exists, use it. No research needed.

## Phase Gates

These are hard constraints. Violating them will cause failures.

**During Phase 2 (Requirements Gathering):**
- NEVER use MCP tools (`prism_integrations_add_connection_config_var`, `prism_install_component_manifest`, etc.) — they require a scaffolded project that does not exist yet
- NEVER call `search_connections.py` for auth types — that script lists org-level connections, not component connection types. The DAG handles component connections via `extract_connections.py` automatically
- NEVER execute inline GraphQL queries — all API interactions are handled by DAG scripts
- Trust the DAG: it has built-in `dynamic_choice` questions that handle component/connection lookups automatically

**Before Phase 4 (Scaffold):**
- NEVER create directories, write TypeScript files, or install manifests manually

**Before Phase 5 (Code Generation):**
- NEVER generate code until scaffolding + manifest installation are complete

## Phase 1: Setup

Run prerequisites:

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/prerequisites.py <integration-name> --type integration
```

Capture `name`, `session_dir`, and `requirements_file` from the JSON output.
- `name` — Use this exact value as the `<name>` argument for ALL subsequent scripts (including `scaffold_project.py`). It must match across phases so the project directory aligns with the session.
- `session_dir` and `requirements_file` — Used ONLY for Phase 2 requirements gathering (`gather_requirements.py` paths and `{session_dir}` template replacement in agent tasks). Do NOT pass `session_dir` to any other script.

**Do NOT manually create session directories with `mkdir`. Always use `prerequisites.py`.**

## Workflow

1. Run prerequisites check (see Phase 1 above — the `--type integration` flag is required)
2. Gather requirements via the DAG questionnaire — it handles component search and conditionally triggers API research
3. Collect OAuth/API credentials if needed
4. Scaffold project with component manifests
5. Generate TypeScript code (componentRegistry, configPages, flows, index)
6. Build, deploy, and test
7. Return summary of what was created

## Agent Task Handling

When `gather_requirements.py` outputs `status: "agent_task"`:

1. Spawn the agent specified in `task.agent` using the Task tool
   - Use the `task.prompt` from the output as the prompt
   - Replace any `{session_dir}` in the prompt with the actual session directory path
2. After the agent completes, mark the question as answered:
   ```bash
   python3 ${CLAUDE_PLUGIN_ROOT}/scripts/write_answer.py <requirements_file> <question_id> completed
   ```
3. Re-run `gather_requirements.py` to continue with remaining questions.
