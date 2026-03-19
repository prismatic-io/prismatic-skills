# Skill Architecture Comparison

A comparison of how the **prismatic repo** (`.ai/`), **components repo** (`.claude/`), and **prismatic-skills** (plugin) approach skill design, progressive disclosure, and code quality enforcement.

Each system evolved under different constraints and arrived at different architectures, all solving the same core problem: guiding Claude through complex workflows.

---

## Prismatic Repo

The main Prismatic platform repo is a polyglot codebase (Django backend, TypeScript infrastructure, Terraform IaC). Its `.ai/` system is optimized for **role-based delegation** — routing work to specialized agents by language and responsibility, coordinated through plan documents.

This system is the newest of the three and is actively evolving. The skills layer was added in late February 2026; before that, the system was agents-only.

### Architecture

```
/go command
│
├── reads CLAUDE.md (conventions, repo context)
│
├── spawns software-architect-planner (blue)
│     └── creates .ai/plans/FEATURE_NAME.md
│           ├── work streams assigned to specific agents
│           ├── dependencies between work streams
│           └── phased execution order (parallel where possible)
│
├── spawns implementers CONCURRENTLY per the plan:
│     ├── python-feature-implementer (yellow)    → .py files only
│     ├── typescript-feature-implementer (purple) → .ts/.tsx only
│     └── terraform-feature-implementer (red)    → .tf files only
│
│     each implementer ends with:
│     └── /validate-changes skill
│           └── 915-line TypeScript validation engine
│               ├── auto-detects changed files (git diff + untracked)
│               ├── categorizes: python | typescript | terraform | skill
│               ├── builds phased plan: Format → Lint → Test
│               ├── runs phases in parallel within categories
│               ├── skips Test entirely if Lint fails
│               ├── 7 output parsers (Ruff, Pyright, Biome, TSC, Terraform, Format, Generic)
│               ├── errors capped at 20 per tool
│               ├── real-time pytest progress (xdist-aware)
│               └── heartbeat for long-running non-pytest tasks
│
├── spawns code-review-specialist (green)
│     └── audits changes for security, quality, performance, maintainability
│
└── spawns feature-docs-writer (pink)
      └── reads plan → writes .ai/docs/FEATURE_NAME.md
          (audience: technical non-developers)
```

### The Optimize-Pytests Skill

A separate skill with a different pattern — a **code quality auditor** that reads test code, evaluates it against named guidelines, and applies fixes.

```
/optimize-pytests [since=main] [file=path] [dry-run]
│
├── parse arguments (branch diff, file target, dry-run mode)
├── gather test code (full function bodies, not just diff hunks)
├── load common fixtures catalog (backend/tests/common/fixtures/)
├── audit against best-practices.md (8 named guidelines)
│     each guideline follows:
│       ## guideline-name
│       [description]
│       **Flag when:** [detection criteria]
│       **Suggest:** [remediation]
├── apply fixes (unless dry-run)
└── report findings by guideline name
```

### Key Strengths

- **Plan documents as first-class coordination artifacts.** The architect agent creates plans with work streams, agent assignments, file references, dependencies, and phased execution order. The plan is the contract between architect and implementers — more structured than a GitHub issue, more actionable than a design doc.

- **Concurrency by design.** The `/go` command says "use subagents concurrently when possible." Plans explicitly mark parallel work streams. The validation engine runs targets in parallel within each phase. Concurrency is the default, not an optimization.

- **File-type boundaries on agents.** Each implementer can only edit files matching its language. The architect can't edit code. The docs writer can't edit code or plans. These aren't suggestions — the prompts say "DO NOT edit" and "you can only edit." This prevents scope creep and makes the collaboration protocol explicit.

- **Validation as a real program.** The 24-line skill delegates to a 915-line TypeScript engine with Zod schemas, output parsers, real-time progress tracking, and intelligent change detection (e.g., if a Terraform module changes, it validates all affected roots). This is more robust than encoding validation logic in markdown.

- **Self-validating infrastructure.** The validation engine validates itself — changes to `.ai/skills/validate-changes/*.ts` trigger the `skill` category, which runs `make format-skill` and `make lint-skill`.

- **Flag when / Suggest pattern.** The optimize-pytests best-practices file uses a structured pattern for each guideline that gives Claude exact detection criteria and exact remediation steps. This is the markdown equivalent of structured `{ issue, fix }` guidance.

- **Minimal prompts, maximum programs.** Agents are 55–111 lines because complexity lives in TypeScript programs and plan documents. The prompts say *what* to do; the programs and plans say *how*.

### Design Trade-offs

- No progressive disclosure is needed — each agent is small enough to fit entirely in context. This works because the complexity lives in the codebase conventions (Django, Terraform, TypeScript), not in the agent prompts.

- Plans are manually created by the architect agent and tracked in markdown. There's no script that validates plan completeness or automates progress tracking.

- No anti-pattern documentation in the implementer agents. They describe what to do but not common mistakes to avoid.

- No phase gates or confirmation steps between planning and implementation. The implementers go straight from "understand" to "implement" to "validate."

### Recent Evolution (Last 3 Weeks)

| Date | Change | Significance |
|------|--------|--------------|
| Feb 27 | validate-changes skill created | Moved validation out of agent prompts into a shared TypeScript program |
| Mar 5 | Terraform subroot detection added | Intelligent change analysis — module changes trigger validation of all affected roots |
| Mar 11 | Implementer agents refactored | Removed inline validation commands from all 3 implementers; all now use `/validate-changes` |
| Mar 11 | ec2-ami-updater agent deleted | Pruned stale agents |
| Mar 11 | Runner.ts added | Real-time pytest progress tracking (xdist-aware) and heartbeat for long tasks |
| Mar 17 | optimize-pytests skill created (new contributor) | First code-quality auditor skill; hub-and-spoke pattern with best-practices.md |

The trajectory: **move intelligence from agent prompts into skills and programs.** Agents are getting leaner; skills are getting richer. Two different people are now building skills, indicating the practice is becoming shared.

---

## Components Repo

The components repo manages 200+ public Prismatic components across multiple deployment stacks. Its skill system is optimized for **cross-component consistency** — ensuring that every component follows the same patterns, naming conventions, and quality standards.

### Architecture

```
CLAUDE.md (346 lines, always in context)
│
├── Component structure, dev commands, code standards
├── Agent registry (17 agents)
├── Skill registry (12 skills)
└── Workflow diagram
│
▼  user invokes a skill
│
Skills (643–774 lines each, fully loaded on invocation)
│
├── Quick Reference Card (compressed workflow overview)
├── Phase-by-phase workflow with decision points
├── Standardization Reference Map (file → standard mapping)
├── Code generation order with examples
├── Proactive Questions, Suggestions, Decision Points
│
▼  during code generation, per file:
│
Standardizations (26 files, ~28,000 lines total)
│
├── INDEX.md — task-based navigation, dependency graph, context budget guide
├── src/actions/actions.md (1,810 lines)
├── src/inputs/input-standards.md (2,467 lines)
├── documentation/standardize-description-docs.md (1,004 lines)
├── shared/writing-style-guidelines.md (332 lines)
└── ... (22 more files)
│
▼  after generating code:
│
Standardizer Agents (8 agents, ~4,000 lines total)
│
├── input-standardizer — validate input fields
├── structure-standardizer — validate file layout
├── docs-standardizer — validate .mdx documentation
├── changelog-standardizer, payload-standardizer, etc.
└── Each reads the relevant standard, scans code, reports/fixes
```

### Key Strengths

- **Comprehensive standards library.** The 26 standardization files represent deep institutional knowledge about how every file type should look. Anti-patterns, validation checklists, and canonical patterns prevent drift across 200+ components.

- **Self-healing via standardizer agents.** After code is generated, specialized agents audit it against standards and auto-fix safe violations. This catches issues that the generator missed.

- **Quick Reference Cards.** Each major skill starts with a compressed 5–10 line overview that gives Claude the full mental model before diving into detail. This front-loads the decision tree and improves workflow branch selection.

- **Structured Decision Points.** Explicit pause markers at phase boundaries tell Claude exactly when to stop, what options to present, and what to recommend. This prevents the agent from guessing through ambiguity.

- **Rich INDEX.md.** The standardizations index provides task-based filtering, a dependency graph, and a context budget guide — acknowledging that 28,000 lines can't all be loaded at once and providing intelligent access patterns.

### Design Trade-offs

- Skills inline most critical content rather than referencing external files. This ensures Claude always has the information but means each skill is 643–774 lines in context on every invocation.

- Some content appears in multiple places (the standardization reference map appears in skills and in standardization files). This redundancy serves as reinforcement — important rules are hard to miss.

- The standardizer agents are powerful but add context cost. Each agent prompt is 500–600 lines and requires reading the corresponding standardization file.

---

## Prismatic-Skills (CNI Builder)

Prismatic-skills builds one-off Code Native Integrations for customers. Its architecture is optimized for **progressive disclosure** — loading the minimum context needed for each workflow phase.

### Architecture

```
cni-builder.md (569 lines, loaded when agent spawns)
│
├── <prime-directive> — collaborator role
├── <role> — identity + workflow overview
├── <user-boundary> — internal concept filter
├── <instructions> — answers, tools, requirements, scripts
├── <context> — script paths, MCP tools, CLI commands
├── <spec-loading> — which YAML domains to load when
├── <doc-fetch> — when to fetch vs use inline context
├── <examples> — WRONG/RIGHT patterns
├── <workflow> — phase steps with confirmation gates
├── <code-patterns> — required files and flow patterns
├── <modify-mode> — targeted edits to existing code
└── <error-recovery> — diagnostic approach
│
▼  skill reference (always loaded with agent)
│
integration-patterns/SKILL.md (126 lines, thin index)
│
├── Architecture patterns (brief orientation)
├── Phase-specific reference pointers:
│   ├── Phase 2: spec items carry context inline
│   ├── Phase 3: → auth-setup.md
│   ├── Phase 4: → manifest-pattern.md, spectral-types.md
│   ├── Phase 5: → 8 always-load + 9 conditional references
│   ├── Phase 6-7: → troubleshooting, testing, errors
│   └── Phase 8: → network-configuration.md
│
▼  loaded on demand, per phase, per condition
│
references/ (~25 files, loaded individually as needed)
│
├── Always (Phase 5): cookbook, spectral-types, config-patterns,
│   using-components, trigger-metadata, code-gen-guide,
│   code-anti-patterns, documentation-style
│
├── Conditional: webhook-patterns, lifecycle-events,
│   state-persistence, oauth-connection, multi-flow,
│   data-sources, json-forms, agnostic-connections,
│   templated-connections, direct-http-patterns
│
└── Troubleshooting: troubleshooting-errors, testing-debugging
│
▼  spec YAML (loaded progressively by domain)
│
Spec YAML (split-file architecture)
│
├── integration.yaml (master TOC, always loaded)
├── integration/overview.yaml (always)
├── integration/source-system.yaml (always)
├── integration/destination-system.yaml (always)
├── integration/error-handling.yaml (always)
├── integration/payload-and-behavior.yaml (always)
├── integration/flow-planning.yaml (skip if single-flow)
├── integration/execution-retry.yaml (skip if synchronous)
├── integration/queue-config.yaml (skip if defaults)
├── integration/lifecycle-hooks.yaml (skip if no hooks)
└── integration/state-management.yaml (skip if no state)
│
│   Each spec item carries inline: agent_context, implications,
│   docs URLs, cookbook_section, references, on_answer
│
▼  templates (read once during code gen)
│
Templates (structural source of truth)
│
├── componentRegistry.ts.template
├── configPages.ts.template
├── flows.ts.template
├── flows-index.ts.template (multi-flow only)
└── index.ts.template
│
▼  validation (scripts return structured guidance)
│
Scripts (mini-prompt pattern)
│
├── validate-phase.ts
│   → structural checks (files exist, patterns match)
│   → semantic checks (anti-patterns, style violations)
│   → returns { issue, fix, reference } guidance
│
└── diagnose-build.ts
    → error pattern matching
    → returns { diagnosis, match, fix } per finding
```

### Key Strengths

- **Hub-and-spoke skill design.** The 126-line skill is a lightweight index pointing to ~25 reference files. Claude reads only what it needs for the current phase, keeping context lean.

- **Spec-driven requirements with inline context.** Each spec item carries `agent_context` (narration backbone), `implications` (per-option consequences), and `cookbook_section` (code generation pointer). This eliminates most reference file reads during requirements gathering.

- **XML semantic boundaries.** The agent uses `<instructions>`, `<context>`, `<workflow>`, `<examples>` blocks that give Claude structural parsing cues beyond what markdown headers provide.

- **Mini-prompt validation.** Instead of spawning a 633-line standardizer agent, `validate-phase.ts` runs semantic checks and returns targeted `{ issue, fix, reference }` guidance objects. The agent reads 20 lines of JSON instead of loading a full agent prompt.

- **Conditional loading with skip-when rules.** The `<spec-loading>` block explicitly declares when to skip entire YAML domains (e.g., skip flow-planning if single-flow, skip execution-retry if synchronous). This prevents loading irrelevant content.

### Design Trade-offs

- References must be loaded explicitly during code generation. If the agent skips a reference it needs, the generated code may miss patterns that would have been caught by an always-loaded skill.

- No post-hoc audit agents. Quality enforcement relies on `validate-phase.ts` semantic checks and the `code-anti-patterns.md` reference. Edge cases not covered by the script require manual review.

---

## Side-by-Side Comparison

| Dimension | Prismatic Repo | Components Repo | Prismatic-Skills |
|---|---|---|---|
| **Primary constraint** | Polyglot platform (Django + TS + TF) | 200+ components must be consistent | Each project is unique |
| **Skill size** | 24–84 lines | 643–774 lines (always loaded) | 50–142 lines (always loaded) |
| **Agent size** | 55–111 lines | N/A (skills carry the logic) | 78–569 lines |
| **Content strategy** | Minimal prompts + real programs | Inline critical content in skills | Point to content from skills |
| **Standards** | Agent conventions + plan docs | 26 standardization files (~28K lines) | Templates + cookbook + anti-patterns |
| **Enforcement** | 915-line TypeScript validation engine | Standardizer agents (post-hoc audit) | validate-phase.ts (structured guidance) |
| **Requirements** | Plan documents (architect agent) | DAG-driven with external context | Spec YAML with inline context per item |
| **Phase gating** | None (implementers go straight through) | Prose STOP markers + exit code 42 | XML `<step name="confirm-*">` blocks |
| **Coordination** | Plan files + file-type boundaries | Skill prose + standardization files | Spec YAML + workflow steps |
| **Error recovery** | Output parsers per tool (7 parsers) | Re-read standardization file | diagnose-build.ts returns exact fix |
| **Concurrency** | Default (parallel agents + parallel targets) | Not addressed | Sequential phases |
| **Code quality audit** | optimize-pytests (Flag when / Suggest) | Standardizer agents | validate-phase.ts semantic checks |

### Approximate Context Cost (Full Build)

| Phase | Prismatic Repo | Components Repo | Prismatic-Skills |
|---|---|---|---|
| **Setup** | ~150 lines (instructions + agent) | ~1,023 lines (CLAUDE.md + skill) | ~695 lines (agent + skill) |
| **Planning** | ~250 lines (architect agent + plan) | N/A | ~945 lines (agent + skill + spec) |
| **Implementation** | ~200 lines (implementer agent) | ~8,800 lines (skill + standards + agents) | ~1,800 lines (agent + refs + templates) |
| **Validation** | ~50 lines (structured script output) | +1,200 lines (standardizer agent) | +20 lines (JSON output from script) |

---

## Changes Already Applied

During this audit, we adopted four patterns from the components repo:

1. **Quick Reference Cards** — Added compressed workflow overviews to `cni-builder.md` and `component-builder.md`
2. **Anti-Pattern Documentation** — Created `references/code-anti-patterns.md` (12 patterns) with `<wrong>`, `<why>`, `<right>` structure
3. **Semantic Validation with Mini-Prompt Guidance** — Enhanced `validate-phase.ts` with semantic checks returning `{ issue, fix, reference }` guidance
4. **Documentation Style Guide** — Created `references/documentation-style.md`, enforced by validate-phase.ts
