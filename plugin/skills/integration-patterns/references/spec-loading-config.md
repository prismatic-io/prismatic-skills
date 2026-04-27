# Spec Loading Configuration — Integration Builder

Load this reference at the start of the requirements phase.

## Progressive Disclosure

The requirements spec uses a split-file architecture. Load progressively — not all at once.

<spec-loading base="${CLAUDE_PLUGIN_ROOT}/scripts/questions">
  <master file="integration.yaml" load="always">
    Table of contents: groups, required items, domain file index. Read this FIRST in Phase 2.
  </master>
  <domain file="integration/overview.yaml" group="overview" load="always">Core questions every integration needs.</domain>
  <domain file="integration/flow-planning.yaml" group="flow_planning">
    <skip-when answer="flow_count" equals="1">Single-flow — infer flow_count=1, skip.</skip-when>
  </domain>
  <domain file="integration/flow-config.yaml" group="flow_config">Sync mode, endpoint type, routing, security, org API keys.</domain>
  <domain file="integration/source-system.yaml" group="source" load="always">Source system, component search, connection setup.</domain>
  <domain file="integration/destination-system.yaml" group="destination" load="always">Destination system.</domain>
  <domain file="integration/error-handling.yaml" group="error_handling" load="always">Immediate retry — every flow needs an error handling decision.</domain>
  <domain file="integration/execution-retry.yaml" group="execution_retry">
    <skip-when answer="is_synchronous" equals="Yes">Sync flows cannot use delayed retry.</skip-when>
  </domain>
  <domain file="integration/queue-config.yaml" group="queue_config">
    <skip-when>Defaults to concurrency 1. Load for FIFO, throttling, or singleton.</skip-when>
  </domain>
  <domain file="integration/lifecycle-hooks.yaml" group="lifecycle_hooks">
    <skip-when>Load if webhook auto-registration or resource setup is needed.</skip-when>
  </domain>
  <domain file="integration/state-management.yaml" group="state_management">
    <skip-when>Load for polling flows or persistent state needs.</skip-when>
  </domain>
  <domain file="integration/payload-and-behavior.yaml" group="payload_and_config,behavior" load="always">Payload shape, config page elements, transformations.</domain>
</spec-loading>

## Spec Features (v4.1)

- **`scope`**: `integration` (asked once) or `flow` (asked per flow)
- **`maps_to`**: SDK property each answer maps to — use during code generation
- **`default`**: Suggested default value for inference
- **`note`**: Contextual info — share relevant parts when presenting choices
- **`info` on groups**: Group-level context — mention when entering that section
- **`{ in: [a, b] }` condition**: Item applicable when answer matches any listed value
- **`agent_context`**: Curated narration backbone (2-4 sentences). When present, base your narration on this content.
- **`implications`**: Per-option consequence map. When present, you must cover each option's downstream effects.
- **`docs`**: Prismatic doc URLs. Fetch on demand per doc-fetch protocol.
- **`cookbook_section`**: Heading pointer into answer-to-code-cookbook.md for code generation.
- **`references`**: Skill reference file paths with phase and condition gating — load just-in-time.
- **`on_answer`**: Per-choice follow-up actions — execute immediately after writing answer.

## Doc-Fetch Protocol

| Situation | Action |
|-----------|--------|
| Presenting a question | Use `agent_context` and `implications` — do not fetch docs |
| User asks follow-up beyond context | Fetch the item's `docs` URL |
| Code gen: cookbook sufficient | Use `cookbook_section` — do not fetch docs |
| Code gen: cookbook doesn't cover pattern | Fetch the item's `docs` URL |
| Build/deploy error | Fetch docs to verify current API |
| Component actions/connections | Fetch `https://prismatic.io/docs/components/${key}.md` |
