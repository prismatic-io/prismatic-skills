# prismatic-skills evals (lux)

A [lux](https://github.com/prismatic-io/lux) eval suite for the `prismatic-skills`
Claude Code plugin. Cases live under `cases/<skill>/`, with the plugin's subagents
and slash commands under `cases/agents/` and `cases/commands/`. Each case grades
with **deterministic assertions** (file/grep checks) and **LLM rubric** assertions
for subjective output.

## How a case runs

Lux's `claude-code` driver runs a headless `claude -p` session. Each case loads the
**skill under test as context**: the prompt points Claude at
`plugin/skills/<skill>/SKILL.md` and its `references/`, granted with `--add-dir`
(see `cases/_support.ts`). Two shapes:

- **Build skills** (e.g. `component-patterns`, `integration-patterns`) write files
  into a scratch dir, graded with `glob-count`, `grep`-based `command-exits-zero`,
  and `rubric`.
- **Knowledge skills** answer in prose, graded with `regex` / `contains` against
  `transcript-all`, `tool-called`, and `rubric`.

## Setup

`@prismatic-io/lux` is a single package — driver, answerers, assertions,
orchestrator, and the `lux` CLI. It is not on npm, so it links from a local
checkout. Build lux first; the CLI and library run from compiled `lib/`:

```bash
cd /path/to/lux
bun install
bun run build          # produces packages/lux/lib (incl. lib/cli/bin.js)
```

Then link it into this suite (idempotent; also sets the bin's executable bit):

```bash
LUX_DIR=/path/to/lux evals/scripts/link-lux.sh   # defaults to a sibling ../lux
```

## Running

```bash
cd evals

bun run lux run                                              # every case under cases/
bun run lux run --list                                       # preview matches, run nothing
bun run lux run component-patterns/                          # one skill (path substring)
bun run lux run cases/component-patterns/api-key-component.ts # one case
bun run lux run --tag ci                                     # a curated subset (comma-separated, repeatable)
bun run lux run component-patterns/ --loop 3                 # repeat the matched set N times
bun run lux view                                             # browse results
bun run lux compare <older-run-dir> <newer-run-dir>          # exits non-zero on regression
```

`lux run` discovers every case file under `cases/`; there is no manifest. Filters —
path/name substrings and `--tag` (from each case's `meta.tags`) — AND together.
Bare `lux run` includes the `hitl` and `build-strict` cases; scope them out with a
path or `--tag` filter.

Tags:

- `ci` — a small, fast, high-signal subset.
- `hitl` — persona-driven cases; grade the interaction, not just the files.
- `build-strict` — type-check generated code with `tsc` (`bunx typescript`, needs network).

Results land in `.lux-runs/<case>/claude-code/<timestamp>/` (gitignored):
`case.json`, `run.json`, `events.jsonl` (the full transcript), `grading.json`, and
`artifacts/` (files the agent wrote, plus any staged `fixtures`).

## No API key

Every model call runs through the local `claude` CLI on your Claude subscription:

- The agent under test runs via the claude-code driver.
- The `scripted` answerer replays a fixture — no model. The `persona` answerer
  (HITL cases) simulates a user with a one-shot `claude -p` call.
- The `rubric` judge shells out to `claude -p --output-format json`. Cases write
  `{ type: "rubric", criteria }`.

Nothing calls the Anthropic API directly, so no `ANTHROPIC_API_KEY` is needed.

**Interrupts do not fire against this driver:** a headless `claude --print` session
is never offered the `AskUserQuestion` tool, so the agent asks in prose and no `ask`
interrupts are emitted. Grade "did the agent ask before acting?" with a `rubric`
over the transcript, not with `interrupt-count`.

## Adding a case

Drop `cases/<skill>/<name>.ts` using `defineEvalCase` and the helpers in
`_support.ts`:

- `withSkill(skill, task)` + `...scripted` for a deterministic case.
- `...withPersona("…")` in place of `...scripted` for a HITL case (grade the
  interaction with a `rubric` over the transcript — see the interrupt note above).
- `fixtures: { kind: "dir", path: "<dir under fixtures/>" }` stages input (a
  migration export, a project skeleton, a tsconfig + type shim) into the working
  directory before the agent starts.

`lux run` discovers the file automatically. Add a `meta.tags` entry to place it in
a curated subset: `ci`, `hitl`, or `build-strict`.
