# Expert Review Synthesis — Prismatic Skills Plugin

**Date:** 2026-04-01
**Reviewers:** 5 specialized agents (Claude Code plugin, progressive disclosure, agent orchestration, context engineering, GenAI product design)
**Input:** structural-assessment-2026-04-01.md + full codebase review

---

## Consensus Recommendations

### 1. Connectors Array (All 5 Agree — Highest Priority)

Replace binary source/destination with a dynamic connectors array. Template expansion preserves existing infrastructure. Use stable identifiers (system name), not array indices.

**Product designer insight:** Drop roles entirely. Replace with `provides_trigger: true` on one connector. The user thinks "which systems are involved?" not "what's the source and what's the destination?"

**Progressive disclosure insight:** Summary rows during requirements (`<connector system="Slack" status="needs_connection" />`), full detail during code gen.

**Orchestration insight:** Keep `source_*`/`destination_*` as aliases for `connectors[0]`/`connectors[1]` during migration.

### 2. Script-Enforced Gates (All 5 Agree)

Move enforcement from prose instructions to script-level gates:
- `scaffold-project.ts` refuses without confirmation token in session
- Build checks that `verify-code-result.json` exists
- `deploy-integration.ts` outputs structured JSON the agent must parse to construct its next message
- `record-choices.ts` rejects values not in spec choices (already done)

**Orchestration insight:** Compliance hierarchy: script gates (95%) > XML directives with data (75%) > XML directives behavioral (60%) > prose instructions (40-60%).

### 3. Cookbook Inline Extraction — Option A with Preamble (4/5 Agree)

`code-plan.ts` extracts relevant cookbook sections inline. Always include preamble (import rules, default omission, critical types, ~128 lines). Append only answer-specific sections. Expected output: 300-700 lines instead of 1,407.

**Progressive disclosure insight:** Extract from H2 to next H2 (not H3). The preamble sections are not referenced by any `cookbook_section` field — they must be hardcoded as always-included.

**Plugin expert insight:** Build with a size budget fallback (~3000 lines). If extracted content exceeds, fall back to headings-only with stronger instruction.

### 4. Split Agent File (4/5 Agree)

Cut cni-builder.md from 740 to ~250 lines. Extract:
- Tool catalog → reference file (load during setup)
- Spec-loading config → reference file (load at requirements start)
- Code patterns → reference file (load at code-gen start)
- Modify mode → reference file (load only when mode=modify)
- Examples → reference files per phase

**Context engineer insight:** Empirical attention budget is 7-12 discrete rules simultaneously. Current ~40 rules is 3x over budget. Tier into: always-active (5-7), phase-active (5-7 per phase), corrective (enforced by hooks/validators).

### 5. Questionnaire → Proposal Metaphor (Product Designer)

Replace sequential question-answer with draft-then-refine:
1. Do all lookups in parallel (components, connections)
2. Present complete draft: "Here's what I plan to build. Confirm or correct."
3. Iterate on corrections

**Key insight:** "Reviewing a proposal is always easier than answering a questionnaire." This applies regardless of user expertise level.

### 6. Parallel Batch Directive (Orchestration Expert)

`update-tasks` should detect mutually-independent lookup items and emit `<parallel-batch>`:
```xml
<parallel-batch>
  <action spec_key="source_component" type="lookup" />
  <action spec_key="destination_component" type="lookup" />
</parallel-batch>
```

Rule change: "One decision per message, but batch lookups that are mutually independent."

### 7. Pre-Constructed AskUserQuestion Payloads (Orchestration + Context)

Instead of emitting choice hints, emit the exact AskUserQuestion JSON payload. The agent copies it instead of constructing it. Reduces construction errors from ~20% to ~5%.

### 8. Three Exit States (Product Designer)

1. **Tested and passing** — the only "success" state
2. **Deployed, awaiting configuration** — a pause, not an exit
3. **Deployed, testing deferred** — valid exit with explicit acknowledgment

The summary step should require a `test_outcome` field.

### 9. Inference Presentation Gate (Context Engineer)

The sync script emits inferred values in a `<present-before-writing>` block with categorization:
- "From your description" (cited, with quotes from user's words)
- "Default choices" (labeled as defaults, with rationale)

Gate: "Do NOT call record-choices in the same response as the presentation. Wait for user's next message."

### 10. Personality via Concrete Exemplars (Context Engineer)

Replace abstract personality descriptions with per-phase example sentences:
```xml
<voice phase="requirements">
Speak like this:
"That's a solid choice — retry with backoff is basically insurance for transient failures."
"No queue config needed here — the default settings are exactly right."
Never: "I'd be happy to help!" or "Great question!" or "Let me explain..."
</voice>
```

First-turn greeting template is the strongest personality signal.

---

## Disagreements

### `<voice>` Repetition
- **Plugin expert:** Remove — wasted tokens, system prompt is durable
- **Progressive disclosure expert:** Keep — total cost negligible (0.06%), not worth optimizing
- **Context engineer:** Replace with concrete exemplars per phase

**Resolution:** Replace with concrete exemplars. The cost argument is irrelevant — the issue is effectiveness, not tokens.

### Cookbook Option C (Accept Cost)
- **Progressive disclosure expert:** Acceptable on 1M context, but Option A is strictly better
- **Plugin expert:** Option A recommended for better compaction behavior
- **Others:** Did not advocate for Option C

**Resolution:** Implement Option A. It's low effort and strictly better.

### Orby Relay Pattern
- **Orchestration expert:** Most escalations are data lookups — wrap as scripts, eliminate relay
- **Others:** Did not assess

**Resolution:** Investigate. If most Orby calls are instance status/URL lookups, wrapping them as synthetic tools eliminates latency and relay failure modes.

---

## Implementation Priority (Combined Expert Input)

| Priority | Change | Effort | Impact | Expert Consensus |
|----------|--------|--------|--------|-----------------|
| 1 | Hard gates in scripts (scaffold, build, deploy) | Low | Highest | 5/5 |
| 2 | Cookbook inline extraction (Option A + preamble) | Low | High | 4/5 |
| 3 | Pre-constructed AskUserQuestion payloads | Low | High | 4/5 |
| 4 | Inference presentation gate | Low | High | 3/5 |
| 5 | Split agent file into core + phase refs | Medium | High | 4/5 |
| 6 | Parallel batch directive | Medium | High | 3/5 |
| 7 | Concrete voice exemplars per phase | Low | Medium | 3/5 |
| 8 | Connectors array refactor | High | Highest | 5/5 |
| 9 | Three exit states | Low | Medium | 2/5 |
| 10 | Orby → synthetic tool migration | Medium | Medium | 1/5 |

Items 1-4 are quick wins. Item 5 is a focused refactor. Items 6-7 are enhancements. Item 8 is the big structural refactor that enables the proposal metaphor. Items 9-10 are follow-ups.
