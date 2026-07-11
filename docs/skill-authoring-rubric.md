# Rubric: Authoring & Reviewing Agent Skills (SKILL.md) — 2026

Audience: engineers and Claude sessions creating or editing skills under `plugin/skills/<name>/SKILL.md` in this repo.

## How to use this rubric

Score every skill — and every edit to one — against the checkable items below. Each item is tagged:

- **[MUST]** — a failing MUST blocks merge.
- **[SHOULD]** — fix unless you can state why the exception is right.
- **[CONSIDER]** — judgment call; decide deliberately.

Read the sections for the *why* and the BAD→GOOD examples; use the [compact checklist](#compact-checklist) for a fast review pass.

**The framing everything else follows from:** a skill is *always-loaded routing metadata (name + description) that points to on-demand instructions and files.* Two consequences:

1. **The description is the load-bearing surface.** The name and description are the only text always in context when Claude chooses among many skills; the body, references, and scripts cost zero context until Claude opens them. Invest in the description first. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), [overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview))
2. **Write forward, not backward.** A skill states how things work *now*, for a reader who has never seen a prior version. Diff and changelog narration ("previously X, now Y") belongs in git, not in the skill. Section 5 covers this in depth because it is the failure mode this repo hits most.

---

## 1. Discovery & Description

The description does the routing. A vague description does not error — it silently never fires. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))

- **[MUST]** Write the description in **third person**, covering **both** what the skill does **and** its concrete when-to-use triggers. Model it on Anthropic's shipped form: *"Verb-phrase of what it does. Use when \<triggers / file types / user phrasings\>."* Reject vague filler like "Helps with documents." ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))
  - GOOD (in-repo): `boomi-migration` — *"This skill should be used when the user needs to analyze a Dell Boomi export, parse Boomi Component XML files… Relevant when the user says 'analyze this Boomi export', 'migrate from Boomi', 'parse Boomi XML'…"*
  - FIX (in-repo): `component-patterns` and `integration-patterns` have near-identical descriptions (*"Architecture patterns, … reference documentation for building Prismatic custom components"* vs *"… Prismatic Code Native Integrations"*), **neither states when to use it**, and **no skill in the repo carries a negative boundary**. Give each a distinct *what + when* with literal triggers, e.g. `component-patterns`: *"…Use when the user wants to build, scaffold, or debug a Prismatic custom component, add an action/trigger/connection, or asks 'how do I build a component'."*
- **[MUST]** Fill the description with the **literal, distinctive tokens a user actually types** — exact product names, file types (`.xml`, `.json`), command names, verbatim phrasings. Distinctive literal tokens match far more reliably than conceptually-equivalent generic phrasings. Treat "keyword matching beats semantic matching" as a working heuristic, not an established mechanism. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices); [activation eval](https://scottspence.com/posts/measuring-claude-code-skill-activation-with-sandboxed-evals))
- **[MUST]** **Front-load the single most distinctive trigger cluster in the first sentence.** The Claude Code skill listing budgets to ~1% of the context window; when it overflows, the descriptions of the *least-invoked* skills are dropped first, and each entry's combined `description` + `when_to_use` is capped at 1,536 characters. Keywords placed late are the first to be cut. ([skills](https://code.claude.com/docs/en/skills))
- **[MUST]** **Keep the description tight — a few sentences, a few hundred characters.** The hard validation cap is 1024 characters, but that is a ceiling, not a target: Anthropic's shipped descriptions are one or two sentences. Length works against you at the listing budget, so spend characters only on distinctive triggers. When a skill genuinely needs many trigger phrases, move the overflow into the optional `when_to_use` field rather than bloating `description`. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), [skills](https://code.claude.com/docs/en/skills))
- **[SHOULD]** Make the description **assertive** enough to fire when the user describes the task without naming the skill or file type (e.g. *"…even when the user doesn't say the word 'migrate'"*). Do not set every skill to always-invoke — overlapping directive triggers dilute each other. ([skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md))
- **[MUST]** Scope each skill to **one job**. An over-broad skill leaves Claude unable to decide when to select it. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))
- **[SHOULD]** For skills that **neighbor each other**, add explicit **negative boundaries** ("Do NOT use for…"), the pattern Anthropic's shipped `docx`/`xlsx` skills use. Treat negatives as a complement to strong positive triggers, and reserve them for genuinely adjacent skills — in this repo: `boomi-migration` vs `cyclr-migration` vs `migration-framework`, and `integration-patterns` vs `component-patterns`. ([xlsx](https://github.com/anthropics/skills/blob/main/skills/xlsx/SKILL.md))
- **[MUST]** Keep **all** when-to-use signals in the metadata (`description`, or Claude Code's optional `when_to_use`) — never only in the body, which loads *after* selection.
- **[MUST]** Verify discovery with **should-trigger / should-not-trigger** evals (Section 7). For relevance that literal tokens can't capture, add a deterministic trigger (path glob, hook) rather than hoping the model infers it.

> Repo note: `user-invocable: false` does not weaken the need for a strong description. Set to `false`, the skill is hidden from the `/` menu, but its description stays in context and Claude still auto-invokes it. Every background-knowledge skill here (`prismatic-api`, `component-patterns`, `integration-patterns`) still needs rich triggers. ([skills](https://code.claude.com/docs/en/skills))

---

## 2. Frontmatter

Only **`name`** and **`description`** are required and validated. Everything else is optional. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), [overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview))

- **[MUST]** `name`: ≤64 characters, lowercase letters/numbers/hyphens only, no XML tags, and never the reserved words `anthropic` or `claude`. Match the directory name. Prefer **gerund** (`processing-pdfs`) or **noun-phrase** (`pdf-processing`) forms that name the activity; avoid vague names (`helper`, `utils`, `tools`, `data`). ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))
- **[MUST]** `description`: non-empty, ≤1024 characters, no XML tags. Keep custom XML-ish tags like `<disallowed-tools>` in the **body** — angle brackets fail frontmatter validation. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))
- **[MUST]** Run `claude plugin validate` (add `--strict` in CI to treat warnings as errors) before shipping. It checks `plugin.json` and all frontmatter/schema structurally — it does not test activation or output, so it complements, never replaces, evals. ([plugins-reference](https://code.claude.com/docs/en/plugins-reference))
- **[CONSIDER]** Choose invocation control deliberately — the levers are not interchangeable ([skills](https://code.claude.com/docs/en/skills)):
  - `disable-model-invocation: true` → side-effecting or timing-sensitive workflows to run only via `/name`. Removes the description from Claude's context, blocks preloading into subagents, and (v2.1.196+) blocks scheduled-task firing.
  - `user-invocable: false` → background knowledge Claude should apply automatically but that isn't a user command (the repo's reference skills). Hides the `/` menu entry only; Claude still invokes it. To actually stop Claude invoking a skill, use `disable-model-invocation` or a permission deny rule.
- **[CONSIDER]** `allowed-tools`, `disallowed-tools`, `when_to_use`, `context`, `license`, `metadata` are optional. Some are Claude Code extensions and some are Agent Skills open-standard fields; unrecognized fields validate as warnings, not errors. Use them where they earn their place.
- **[CONSIDER]** A per-skill `version` field in SKILL.md does not drive discovery or updates. Plugin updates key off **`plugin.json` version** — bump it each release, or leave it unset while iterating so the commit SHA drives updates. If you set it, bump it every release or `/plugin update` reports "already at the latest version." ([plugins](https://code.claude.com/docs/en/plugins))

---

## 3. Body & Altitude

The body loads on trigger and then persists in context every turn, so each line is a recurring token cost. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))

- **[MUST]** Include only **high-signal context Claude doesn't already have.** Challenge each paragraph: does Claude need this, or does it already know it? Aim for the smallest wording that still fully specifies the behavior — minimal, not under-specified. Bloat lowers instruction recall. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), [context-engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))
- **[MUST]** **State each fact once (single source of truth).** The body routes; reference files hold the detail. Do not restate the same rule in both the body and a reference, or across sibling skills — duplicated content drifts out of sync, the spatial cousin of the temporal rot Section 5 targets. *(In this repo, the "Phase-Specific References" and "All References" lists overlap heavily — keep one authoritative list and let the other point to it.)* ([context-engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))
- **[MUST]** Match **specificity to task fragility** ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)):
  - **Fragile / narrow-path** (one wrong move breaks it): give low-freedom exact steps — the precise command and sequence; forbid extra flags. *(Doc analogy: a narrow bridge with cliffs.)*
  - **Open-ended / many valid paths**: give high-freedom general direction plus strong, time-agnostic heuristics, and trust the model. *(An open field.)*
  - Avoid both failure modes: brittle branch-by-branch logic on flexible tasks, and vague under-specification on fragile ones.
- **[MUST]** Be **explicit about output format, constraints, and the quality bar.** Apply the golden rule: if a colleague with minimal context would be confused, so will Claude. ([be-clear-and-direct](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/be-clear-and-direct))
- **[SHOULD]** Make load-bearing **verification/validation steps prominent and hard to skip** — a strong imperative, a "Required" heading, a numbered step, or a copyable checklist. A loaded skill can still silently skip steps; prominence matters more than position. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))
- **[SHOULD]** For **artifact-producing** skills, specify a **validate → fix → re-verify** loop with an adversarial *"assume there are problems"* stance, and gate completion on a clean re-check. Document what any auto-repair will and will not fix. ([docx](https://github.com/anthropics/skills/blob/main/skills/docx/SKILL.md))
- **[MUST]** Explain the **WHY** behind non-obvious instructions rather than stacking all-caps `ALWAYS`/`NEVER`. Capable models generalize from stated intent better than from rigid commands; reserve hard `MUST`/`NEVER` for genuinely non-negotiable constraints. Escalate wording only after a rule is observed to be ignored. ([skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md))

> Repo note: a body-level `<disallowed-tools>` block (as in `component-patterns`, `integration-patterns`) is **prose guidance to Claude, not enforcement.** To actually block a tool, use the `disallowed-tools:` frontmatter field or a permission deny rule (Section 6).

---

## 4. Structure & Progressive Disclosure

Design around three levels: **metadata** (~100 tokens, always loaded) → **SKILL.md body** (loaded on trigger) → **bundled files** (loaded or executed on demand, effectively unlimited). ([overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview))

- **[MUST]** Structure SKILL.md as a **lightweight overview that routes to detail**, like a table of contents — not a container for all the detail. Push depth into files that cost zero context until read.
- **[SHOULD]** Keep the body **under ~500 lines** (Anthropic's stated performance guideline). As you approach it, add one layer of hierarchy and move detail into reference files. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))
- **[MUST]** Keep references **exactly one level deep** — every supporting file links directly from SKILL.md; never chain reference → reference. Files reached only through a nested link get partially read (e.g. `head -100`), yielding incomplete information. The repo's flat `references/*.md` layout is the correct pattern. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))
- **[SHOULD]** Annotate each reference link with **when** to load it and **what** it contains. The repo's task → `references/instances.md → "Get Test Instance"` tables do this well.
- **[SHOULD]** Put a **table of contents at the top of any reference file longer than ~100 lines** so its full scope survives partial reads. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))
- **[MUST]** Name files **descriptively by content** (`form_validation_rules.md`, `references/instances.md` — not `doc2.md`).
- **[SHOULD]** Give the body a predictable skeleton — H1 title → brief overview/quick-start → task/phase sections → terminal "Reference Files" section. Adapt to the skill; a reference-style skill may open with a decision tree, a trivial skill needs no scaffolding. Express completeness-critical procedures as **numbered steps**, and add a **copyable checklist** for complex multi-step workflows. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))
- **[MUST]** Plugin layout: each skill at `plugin/skills/<name>/SKILL.md` under the plugin root — **never** inside `.claude-plugin/`, which holds only `plugin.json`. Claude Code discovers component directories only at the plugin root. ([plugins-reference](https://code.claude.com/docs/en/plugins-reference))
- **[SHOULD]** Path variables: use **`${CLAUDE_SKILL_DIR}`** to reference a skill's own bundled files (resolves to the skill's directory at any install level); use **`${CLAUDE_PLUGIN_ROOT}`** for assets that live at the plugin root and are shared across skills — which is why `${CLAUDE_PLUGIN_ROOT}/templates/integration/` is correct here (the `templates/` tree sits at the plugin root). Never hardcode install paths; never write persistent state under `${CLAUDE_PLUGIN_ROOT}` (replaced on each update). Relative links like `references/foo.md` are fine for one-level reference reads. ([skills](https://code.claude.com/docs/en/skills))

---

## 5. Writing Style — Write Forward, Not Backward (primary treatment)

A skill states how things work now, for a reader with no memory of any prior version. When you edit a skill, rewrite the affected instruction so it stands on its own — do not narrate the change. Diff and changelog commentary becomes wrong as the skill evolves and clutters the actionable instruction. ([best-practices: "Avoid time-sensitive information"](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), [Google: timeless documentation](https://developers.google.com/style/timeless-documentation))

### 5a. Timeless, present-tense, imperative

- **[MUST]** Write **evergreen, present-tense** instructions. Use the **imperative mood** for procedural steps (lead with a verb) and present indicative for descriptions. State only the current correct behavior. ([Microsoft: verbs](https://learn.microsoft.com/en-us/style-guide/grammar/verbs))
- **[MUST]** **Never narrate how the guidance changed.** No "previously X, now Y", "used to", "we renamed/moved/replaced", "as of \<date\> this changed".
- **[MUST]** **State behavior affirmatively** — say what to do, not what it used to be. Replace "we no longer do X, do Y instead" with a plain "Do Y." Reserve negative phrasing for genuine guardrails. ([prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices))

### 5b. BAD → GOOD rewrites

| BAD (backward / diff narration) | GOOD (forward / timeless) |
|---|---|
| "Previously we used the REST client, now use the GraphQL client." | "Use the GraphQL client." |
| "We renamed `getConfig` to `loadConfig`, so call `loadConfig`." | "Call `loadConfig` to read configuration." |
| "This skill no longer reads `config.json`; instead read `settings.yaml`." | "Read configuration from `settings.yaml`." |
| "The parser now supports XML exports." | "The parser supports XML exports." |
| "As of 2026-03 the API requires a bearer token." | "The API requires a bearer token." |
| "Updated the mapping table — Boomi `Map` now maps to a code step." | "Map the Boomi `Map` shape to a code step." |
| "Credential extraction utilities. No longer needed since `prism` handles auth." | *(delete — describe what to do now: "`prism` commands handle auth natively; no separate credential step is required.")* |

The last row is a real in-repo offender (`prismatic-api/references/api-access-methods.md`); "Spec items **now** carry `agent_context`…" (`integration-patterns/SKILL.md`) is another — the reader has no "before" to compare against.

### 5c. Strike stale temporal qualifiers

- **[MUST]** Delete present-implied qualifiers that add nothing — **currently, now, presently, at present, for now**. "The parser now supports X" → "The parser supports X." ([Google word list](https://developers.google.com/style/word-list))
- **[SHOULD]** Distinguish two cases before touching version/comparison words:
  - **Stale relative to the skill's own edit history** → rewrite. "This is the *newer* mapping table" describes an edit; state the mapping instead.
  - **Describes external world/version state** → keep. "Pin to the *latest* stable SDK release" and "the value is *changed to* uppercase" are correct present-tense instructions, not changelog narration.
- **[SHOULD]** For future words (`soon`, `eventually`, `in the future`): describe current capability rather than documenting behavior that does not exist yet. "The connector will eventually support webhooks" → describe what it does now ("The connector supports polling triggers.").

### 5d. Consistent terminology + full rename sweep

- **[MUST]** Use **one term per concept** throughout ("API endpoint" — not a mix of "endpoint/URL/route/path"). Inconsistent wording degrades how reliably Claude follows instructions. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))
- **[MUST]** When you rename or replace a term, **sweep every occurrence** so only the canonical term remains — no implicit "this used to be called X" trail.

### 5e. The "Old patterns" escape hatch

- **[SHOULD]** When legacy context is genuinely useful, **quarantine** it in a labeled `## Old patterns` section (a collapsed `<details>` block), and anchor any deprecation to a concrete version or date. This is the only sanctioned place old and new coexist. Anthropic's own example ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)):

  ```markdown
  ## Current method
  Use the v2 API endpoint: `api.example.com/v2/messages`

  ## Old patterns
  <details><summary>Legacy v1 API (deprecated 2025-08)</summary>
  The v1 API used `api.example.com/v1/messages`. This endpoint is no longer supported.
  </details>
  ```

### 5f. Concrete, not abstract; include worked examples

- **[MUST]** For skills whose output quality depends on format, **include worked input → output examples** (multishot pairs), just as in regular prompting. Examples convey style and detail more reliably than descriptions alone. ([best-practices "Examples pattern"](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), [multishot prompting](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/multishot-prompting))
- **[SHOULD]** Make examples **concrete and specific** — real filenames, field names, values — never abstract placeholders like "Format this data." (Keep deliberate typos/casual phrasing for *trigger test queries* in Section 7, not for reference examples.) ([skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md))

### 5g. Review gate — flag before merge

Run this against the diff and the whole file as a **first-pass flag requiring human adjudication**, not an auto-fail (a regex cannot tell an edit-history reference from a description of the world — see 5c). Prefer `rg` for consistent word boundaries; a hit outside an `## Old patterns` block is a candidate `[MUST]` fix:

```
rg -in "\b(previously|used to|no longer|formerly|historically|going forward)\b|as of [0-9]|\bwe (renamed|moved|replaced|removed|added|changed)\b|deprecated in favor|note:? this (has )?changed|\bnow (supports?|uses?|requires?|works?|carr)" SKILL.md references/
```

Then read each touched instruction as a fresh reader with zero memory of prior versions: if a sentence only makes sense as a diff against an earlier draft, rewrite it to stand alone.

---

## 6. Tools & Safety

A skill runs with the privileges of the local Claude Code process. Treat tool grants and bundled scripts as privilege and supply-chain surface.

- **[MUST]** Understand that **`allowed-tools` is a permission GRANT, not a sandbox.** It pre-approves the listed tools so the skill runs them without prompting, but restricts nothing — every unlisted tool stays callable, governed by your permission settings. To actually block a tool, add a **permission deny rule** (deny rules override skills durably). `disallowed-tools` removes a tool only while that skill is active and **clears on your next message** — hygiene, not a boundary against an untrusted skill. Audit every `allowed-tools` entry, especially `Bash(...)`, as a privilege grant — a checked-in project skill can grant itself broad access once you trust the folder. ([skills](https://code.claude.com/docs/en/skills), [Reversec](https://labs.reversec.com/posts/2026/05/skill-issues-compromising-claude-code-with-malicious-skills-agents-part-1))
- **[MUST]** **Ship dynamic-context shell commands only if they are safe by inspection.** The inline `` !`command` `` form and fenced ```` ```! ```` form run **during preprocessing, before Claude reasons and with no permission prompt** — a later refusal cannot un-run them. Restrict them to read-only, idempotent commands with no network, no credential access, and no interpolation of untrusted input; otherwise let Claude run commands through the normal tool-permission flow. For untrusted third-party skills, enforce `disableSkillShellExecution` via managed settings. ([skills](https://code.claude.com/docs/en/skills), [Datadog](https://securitylabs.datadoghq.com/articles/malicious-skills-supply-chain-risks-in-coding-agents-with-dynamic-context/))
- **[MUST]** Treat adopting a third-party skill as a **software-supply-chain decision**: read every bundled file and its frontmatter for unexpected shell/network/credential access before enabling; run under least privilege; rotate any credentials a suspect skill could have reached. ([overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview), [Snyk ToxicSkills](https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/))
- **[SHOULD]** For every bundled script, make **execute-vs-read intent explicit** ("Run `parse-export` to extract fields" vs "See `parse-export` for the algorithm"). Prefer running deterministic scripts as black boxes (`--help` first) over reading large sources into context — execution costs only the script's output in tokens and is more reliable than regenerated code. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))
- **[SHOULD]** Have scripts **solve, not punt** — handle error conditions explicitly rather than failing into Claude's lap — return **high-signal, human-meaningful** output, and **justify every constant** (no `TIMEOUT = 47 # why 47?`). Keep the executable/decision surface small and non-overlapping. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), [writing-tools](https://www.anthropic.com/engineering/writing-tools-for-agents))

---

## 7. Testing & Maintenance

This repo has a lux-based eval harness (`evals/`). Use it — a skill's discovery and its behavior are both testable.

- **[MUST]** Practice **evaluation-driven development**: run Claude on representative tasks **without** the skill, record the baseline and specific failures, build **≥3 scenarios** targeting those gaps, then write the **minimal instructions** that close them. Tie every addition to a measured failure. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))
- **[MUST]** **Test activation separately from correctness.** In fresh sessions measure: (1) does it **fire on should-trigger** prompts and **refrain on should-not-trigger** ones, (2) is the **output correct** when it fires, (3) did the **required steps actually run** — a skill can activate yet silently skip steps while producing plausible output. Skills fail silently; a malformed SKILL.md surfaces only under `--debug`. ([skills](https://code.claude.com/docs/en/skills), [Marc Bara](https://medium.com/@marc.bara.iniesta/claude-skills-have-two-reliability-problems-not-one-299401842ca8))
- **[MUST]** Make **trigger/test queries realistic** — real paths and values, plus lowercase, abbreviations, typos, and casual speech; favor edge cases and near-misses over clean stubs. Abstract queries exercise nothing. ([skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md))
- **[SHOULD]** Iterate with an **author-instance / fresh-tester-instance** loop (Claude A drafts; a clean-context Claude B uses it on real tasks). Refine `name`/`description`/structure from observed behavior, **generalize** fixes rather than adding overfit example-specific rules, and **test against every model you will run it on** — smaller/faster models may need more guidance. Stop when eval results stop moving. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))
- **[MUST]** **Run the Section 5g write-forward gate before merging any edit**, and read each touched instruction as a fresh reader. This is the house rule that keeps skills timeless.

---

## 8. Anti-Patterns (net-new — see also the MUSTs above)

- **[MUST]** **Don't present multiple equivalent approaches.** Give one sensible default per task, with at most a narrow escape hatch for a genuinely distinct case (e.g. OCR for scanned PDFs). A menu of interchangeable options creates ambiguous decision points. This targets *equivalent* options, not genuinely context-dependent choices. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))
- **[MUST]** **Reference MCP tools by fully-qualified `ServerName:tool_name`** — unqualified names cause "tool not found" when multiple servers are loaded. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))
- **[MUST]** **Don't assume packages/tools are pre-installed** — state the dependency and its install step. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))
- **[MUST]** **Always use forward slashes** in paths — Windows-style paths break on Unix. ([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))

---

## Compact Checklist

**Discovery / Description**
- [ ] Third person; states *what* + *when*; front-loads the most distinctive trigger cluster
- [ ] Packed with literal trigger tokens users actually type (names, file types, exact phrasings)
- [ ] Tight (a few sentences, well under 1024 chars); overflow triggers moved to `when_to_use`
- [ ] Assertive enough to fire when the user doesn't name the skill; scoped to one job
- [ ] Negative boundaries added where it neighbors a sibling skill; all when-to-use in metadata

**Frontmatter**
- [ ] `name` ≤64, lowercase/digits/hyphens, matches dir, no `anthropic`/`claude`
- [ ] `description` non-empty, ≤1024, no angle-bracket tags
- [ ] `claude plugin validate` passes; invocation flags chosen deliberately; `plugin.json` version bumped for release

**Body & Altitude**
- [ ] Only high-signal context; each fact stated once (no body/reference duplication)
- [ ] Specificity matches task fragility; output format/constraints explicit; passes the colleague test
- [ ] Load-bearing verification steps prominent; artifact skills have validate → fix → re-verify
- [ ] Rules explain WHY; all-caps ALWAYS/NEVER minimized

**Structure**
- [ ] Body is an overview that routes to detail; ~≤500 lines
- [ ] References one level deep, linked directly, annotated with when/what; TOC atop long reference files
- [ ] Skill at `plugin/skills/<name>/SKILL.md`; `${CLAUDE_SKILL_DIR}` for own files, `${CLAUDE_PLUGIN_ROOT}` for plugin-root assets

**Write Forward (timeless)**
- [ ] Present-tense/imperative; states current behavior only; affirmative ("Do Y"), not "no longer X"
- [ ] No changelog/diff narration; 5g gate reviewed (hits outside `## Old patterns` adjudicated)
- [ ] One term per concept; renames fully swept; legacy quarantined + version-anchored
- [ ] Examples concrete and worked (input → output), not abstract placeholders

**Tools & Safety**
- [ ] `allowed-tools` audited as grants; real blocking via deny rules
- [ ] No unreviewed dynamic-context `` !`…` `` shell commands; third-party skills reviewed as supply chain
- [ ] Bundled scripts: execute-vs-read intent explicit; solve-don't-punt; justified constants

**Testing**
- [ ] ≥3 eval scenarios; no-skill baseline recorded
- [ ] Activation tested separately from correctness, in fresh sessions; queries realistic
- [ ] Write-forward gate run before merge

---

## Scope notes

- "Keyword matching beats semantic matching" is used here as a **working heuristic** for packing literal triggers, not an established mechanism — primary sources establish that the description drives selection, not the matching internals.
- Version-specific and numeric facts (the 1,536-char listing cap, the ~500-line body guideline, `v2.1.196` gating) reflect current Claude Code documentation and may shift — confirm against [the skills docs](https://code.claude.com/docs/en/skills) for your version.

## Sources

**Official docs** — [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) · [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) · [Claude Code skills](https://code.claude.com/docs/en/skills) · [Plugins](https://code.claude.com/docs/en/plugins) / [reference](https://code.claude.com/docs/en/plugins-reference) · [Be clear and direct](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/be-clear-and-direct) · [Multishot prompting](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/multishot-prompting) · [Google: timeless documentation](https://developers.google.com/style/timeless-documentation) / [word list](https://developers.google.com/style/word-list) · [Microsoft: verbs](https://learn.microsoft.com/en-us/style-guide/grammar/verbs)

**Primary Anthropic** — [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) · [Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) · shipped skills: [skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md), [docx](https://github.com/anthropics/skills/blob/main/skills/docx/SKILL.md), [pptx](https://github.com/anthropics/skills/blob/main/skills/pptx/SKILL.md), [xlsx](https://github.com/anthropics/skills/blob/main/skills/xlsx/SKILL.md)

**Practitioner / security** — [Scott Spence: activation evals](https://scottspence.com/posts/measuring-claude-code-skill-activation-with-sandboxed-evals) · [Marc Bara: two reliability problems](https://medium.com/@marc.bara.iniesta/claude-skills-have-two-reliability-problems-not-one-299401842ca8) · [Reversec: malicious skills](https://labs.reversec.com/posts/2026/05/skill-issues-compromising-claude-code-with-malicious-skills-agents-part-1) · [Datadog: dynamic context](https://securitylabs.datadoghq.com/articles/malicious-skills-supply-chain-risks-in-coding-agents-with-dynamic-context/) · [Snyk: ToxicSkills](https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/)
