---
name: build-component
description: Build and deploy a Prismatic custom component
context: fork
agent: component-builder
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, Task
---

Build a Prismatic custom component for $ARGUMENTS.

## STOP — Read Before Proceeding

- Do NOT spawn the `external-api-researcher` agent at the start. Do NOT parallelize research with prerequisites.
- The questionnaire DAG (`gather_requirements.py`) searches for existing Prismatic components automatically and will emit an `agent_task` when API research is actually needed.
- If the user provides an API docs URL in their request, hold onto it — do NOT use it to eagerly launch research. The questionnaire will ask for it at the right time.

## Phase 1: Setup

Run prerequisites:

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/prerequisites.py <component-name> --type component
```

Capture `session_dir` and `requirements_file` from the JSON output.

**Do NOT manually create session directories with `mkdir`. Always use `prerequisites.py`.**

## Workflow

1. Run prerequisites check (see Phase 1 above — the `--type component` flag is required)
2. Gather requirements via the DAG questionnaire — it handles component search and conditionally triggers API research
3. Scaffold component with `scaffold_component.py`
4. Generate code using component-patterns skill
5. Build, publish, and validate
6. Return summary of what was created

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
