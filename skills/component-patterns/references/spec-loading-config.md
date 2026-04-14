# Spec Loading Configuration — Component Builder

Load this reference at the start of the requirements phase.

## Progressive Disclosure

The requirements spec uses a split-file architecture. Load progressively — not all at once.

<spec-loading base="${CLAUDE_PLUGIN_ROOT}/scripts/questions">
  <master file="component.yaml" load="always">
    Table of contents: groups, required items, domain file index. Read this FIRST in Phase 2.
  </master>
  <domain file="component/overview.yaml" group="overview" load="always">Component type, name, description.</domain>
  <domain file="component/connector-config.yaml" group="connector_config">
    <skip-when answer="component_type" equals="utility">Utility components don't connect to external APIs.</skip-when>
  </domain>
  <domain file="component/resources.yaml" group="resources">
    <skip-when answer="component_type" equals="utility">Utility components don't have API resources.</skip-when>
  </domain>
  <domain file="component/triggers.yaml" group="triggers">
    <skip-when answer="component_type" equals="utility">Utility components don't have triggers.</skip-when>
  </domain>
  <domain file="component/data-sources.yaml" group="data_sources">
    <skip-when answer="component_type" equals="utility">Utility components don't need data sources.</skip-when>
  </domain>
  <domain file="component/utility-config.yaml" group="utility_config">
    <skip-when answer="component_type" equals="connector">Connectors don't use utility config.</skip-when>
  </domain>
  <domain file="component/additional.yaml" group="additional" load="always">Error handling, additional requirements.</domain>
</spec-loading>

## Spec Features

- **`choices`**: Valid answer values — always use exact slugs from this array
- **`default`**: Suggested default value for inference
- **`note`**: Contextual info — share relevant parts when presenting choices
- **`info` on groups**: Group-level context — mention when entering that section
- **`agent_context`**: Curated narration backbone (2-4 sentences). When present, base your narration on this content.
- **`implications`**: Per-option consequence map. When present, you must cover each option's downstream effects.
- **`docs`**: Prismatic doc URLs. Fetch on demand per doc-fetch protocol.
- **`cookbook_section`**: Heading pointer into answer-to-code-cookbook.md for code generation.
- **`references`**: Skill reference file paths with phase and condition gating — load just-in-time.
- **`on_answer`**: Per-choice follow-up actions — execute immediately after writing answer.
- **`inference`**: `allowed` or `prohibited` — controls whether the agent may infer the answer.

## Doc-Fetch Protocol

| Situation | Action |
|-----------|--------|
| Presenting a question | Use `agent_context` and `implications` — do not fetch docs |
| User asks follow-up beyond context | Fetch the item's `docs` URL |
| Code gen: cookbook sufficient | Use `cookbook_section` — do not fetch docs |
| Code gen: cookbook doesn't cover pattern | Fetch the item's `docs` URL |
| Build error | Fetch docs to verify current API |
