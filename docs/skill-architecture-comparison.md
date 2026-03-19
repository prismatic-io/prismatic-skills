# Skill Architecture Comparison

A comparison of how the **components repo** (`.claude/`) and **prismatic-skills** (plugin) approach skill design, progressive disclosure, and code quality enforcement.

Both systems solve the same problem — guiding Claude through complex, multi-phase workflows — but they evolved under different constraints and arrived at different architectures.

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

| Dimension | Components Repo | Prismatic-Skills |
|---|---|---|
| **Primary constraint** | 200+ components must be consistent | Each project is unique |
| **Skill size** | 643–774 lines (always loaded) | 50–142 lines (always loaded) |
| **Content strategy** | Inline critical content in skills | Point to content from skills |
| **Standards** | 26 standardization files (~28K lines) | Templates + cookbook + anti-patterns |
| **Enforcement** | Standardizer agents (post-hoc audit) | validate-phase.ts (structured guidance) |
| **Requirements** | DAG-driven with external context | Spec YAML with inline context per item |
| **Phase gating** | Prose STOP markers + exit code 42 | XML `<step name="confirm-*">` blocks |
| **Branching logic** | Prose inside phases | `<spec-loading>` skip-when rules |
| **Error recovery** | Re-read standardization file | diagnose-build.ts returns exact fix |

### Approximate Context Cost (Full Build)

| Phase | Components Repo | Prismatic-Skills |
|---|---|---|
| **Setup** | ~1,023 lines (CLAUDE.md + skill header) | ~695 lines (agent + skill) |
| **Requirements** | ~1,500 lines (skill + reference reads) | ~945 lines (agent + skill + spec domains) |
| **Code generation** | ~8,800 lines (skill + 4-5 standards + agents) | ~1,800 lines (agent + skill + references + templates) |
| **Validation** | +1,200 lines (standardizer agent) | +20 lines (JSON output from script) |

---

## Patterns We Adopted

After auditing the components repo, we adopted three patterns adapted to fit the prismatic-skills architecture:

### 1. Quick Reference Cards

A compressed 2–3 line workflow overview at the top of each agent file. Front-loads the decision tree so Claude has the full mental model before reading hundreds of lines of detail.

**Applied to:** `cni-builder.md` (inside `<role>`), `component-builder.md` (top of file)

### 2. Anti-Pattern Documentation

A dedicated reference file showing common code generation mistakes with `<wrong>`, `<why>`, `<right>` structure. Covers config pages, flow callbacks, imports, component usage, and trigger configuration.

**Applied to:** `references/code-anti-patterns.md` (12 anti-patterns), linked from SKILL.md Phase 5

### 3. Semantic Validation with Mini-Prompt Guidance

Enhanced `validate-phase.ts` to detect anti-patterns in generated code and return structured `{ issue, fix, reference }` guidance that points the agent to the exact anti-pattern reference. Extends the existing `diagnose-build.ts` pattern.

**Applied to:** `validate-phase.ts` semantic checks for code-gen phase

### 4. Documentation Style Guide

A lightweight writing style reference for generated `documentation.md` files, covering the rules that matter most: no second-person pronouns, no product name references, active voice, section structure.

**Applied to:** `references/documentation-style.md`, enforced by validate-phase.ts semantic checks

---

## Patterns We Chose Not to Adopt

| Pattern | Why It Works for Components | Why It Doesn't Fit Here |
|---|---|---|
| Standardizer agents | 200+ components need ongoing compliance auditing | One-off projects; scripts cover validation |
| 26-file governance hierarchy | Consistency across a large corpus | Templates already define correct output |
| Canonical patterns (e.g., identical `fetchAll` input) | Every component's pagination must match | Each integration is unique |
| Inline standardization maps in skills | Reinforces critical rules through repetition | Hub-and-spoke keeps skills lean |
| INDEX.md with context budget guide | 28K lines needs intelligent access patterns | 126-line skill is already the index |
