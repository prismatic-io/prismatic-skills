---
name: integration-patterns
version: 1.0.0
description: Architecture patterns, manifest usage, code generation guides, and reference documentation for building Prismatic Code Native Integrations.
user-invocable: false
---

# Integration Patterns

Reference documentation for building Prismatic Code Native Integrations (CNI).

## Architecture Patterns

### Standard Integration Pattern
- Components accessed via manifests and componentRegistry
- Standard connection configuration
- Any component/manifest combination

## Component Manifest Pattern

All components are accessed via manifests:
1. Install: `npx cni-component-manifest <component-key>`
2. Register in componentRegistry.ts with `componentManifests()`
3. Access via `context.components.<key>.<action>()`
- See `references/manifest-pattern.md`

## Config Mantra

Every config element MUST use wrapper functions:
- `configVar()` for simple values
- `connectionConfigVar()` for connections
- `dataSourceConfigVar()` for data sources
- See `references/cni-examples/config-patterns-correct-vs-incorrect.md`

## Key References

### Workflow & Architecture
- `references/workflow-phases.md` - Complete phase-by-phase workflow
- `references/workflow-guide.md` - Workflow overview
- `references/code-generation-guide.md` - File generation patterns and context object
- `references/manifest-pattern.md` - Component manifest usage patterns

### Configuration
- `references/auth-setup.md` - Authentication setup
- `references/network-configuration.md` - Network setup
- `references/spectral-quickstart.md` - Spectral SDK basics
- `references/trigger-metadata-spec.md` - Test data structure requirements

### CNI Examples (Pattern Library)
- `references/cni-examples/basic-api-to-slack.md` - Simple integration
- `references/cni-examples/webhook-patterns.md` - Webhook handling
- `references/cni-examples/webhook-payload-access.md` - Accessing trigger payloads
- `references/cni-examples/lifecycle-events.md` - onInstanceDeploy, onInstanceDelete
- `references/cni-examples/state-persistence.md` - State types and usage
- `references/cni-examples/config-patterns-correct-vs-incorrect.md` - Config wrapper functions
- `references/cni-examples/data-sources.md` - Data source patterns
- `references/cni-examples/json-forms.md` - JSON Forms for complex config
- `references/cni-examples/multi-flow.md` - Multi-flow integrations
- `references/cni-examples/oauth-connection.md` - OAuth connection setup
- `references/cni-examples/using-components.md` - Component usage patterns
- `references/cni-examples/error-handling.md` - Error handling patterns
- `references/cni-examples/integration-agnostic-connections.md` - Shared connections
- `references/cni-examples/templated-connections.md` - Templated connection patterns
- `references/cni-examples/testing-debugging.md` - Test and debug patterns

### Troubleshooting
- `references/troubleshooting-errors.md` - Common errors and fixes
