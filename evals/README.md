# prismatic-skills evals (lux)

A [lux](https://github.com/prismatic-io/lux) eval suite for the `prismatic-skills`
Claude Code plugin. Cases are grouped by skill, agent, or command under `cases/`.

## Setup

Build a local Lux checkout:

```bash
cd /path/to/lux
bun install
bun run build
```

Then link it into this suite:

```bash
LUX_DIR=/path/to/lux evals/scripts/link-lux.sh   # defaults to ../lux
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

Bare `lux run` includes the `hitl` and `build-strict` cases; scope them out with a
path or `--tag` filter.

Tags:

- `ci` — a small, fast, high-signal subset.
- `hitl` — persona-driven cases; grade the interaction, not just the files.
- `build-strict` — type-check generated code with `tsc` (`bunx typescript`, needs network).

Runs use the local Claude subscription and are pinned to Claude Haiku 4.5 at low
effort for both the subject and rubric/persona calls. Results are gitignored under
`.lux-runs/`.

**Interrupts do not fire against this driver:** a headless `claude --print` session
is never offered the `AskUserQuestion` tool, so the agent asks in prose and no `ask`
interrupts are emitted. Grade "did the agent ask before acting?" with a `rubric`
over the transcript, not with `interrupt-count`.

## Adding a case

Add `cases/<skill>/<name>.ts` using the helpers in `_support.ts`:

- `withSkill(skill, task)` + `...scripted` for a deterministic case.
- `...withPersona("…")` in place of `...scripted` for a HITL case (grade the
  interaction with a `rubric` over the transcript — see the interrupt note above).
- `fixtures: { kind: "dir", path: "<dir under fixtures/>" }` stages input (a
  migration export, a project skeleton, a tsconfig + type shim) into the working
  directory before the agent starts.

Add `meta.tags` to include it in `ci`, `hitl`, or `build-strict` subsets.
