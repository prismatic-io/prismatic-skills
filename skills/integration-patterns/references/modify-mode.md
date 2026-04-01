# Modify Mode — Integration Builder

Load this reference only when `--mode modify` is active.

**Mental model:** Build = empty → requirements → scaffold → generate. Modify = existing → extract state → capture delta → targeted edits.

## Phase 1: Extract State
Run `prismatic-tools extract-state` for the "before" snapshot. Present as structured summary: flow count/names, trigger types, components, connections, error handling, retry, queue config, lifecycle hooks, state management, extraction_gaps.

## Phase 2: Capture Delta
Read `modify-integration.yaml` for intent. Based on modification_scope:
- **Add flow:** Convert single-file to directory structure if needed. Walk `scope: flow` items for new flow only. Offer to copy from existing flows.
- **Modify behavior / error handling:** Show current values, ask what should change, only ask about changed items.
- **Add/change component:** Search registry, install manifest, update componentRegistry.ts, add config page entries.
- **Modify config pages:** Read current state, present structure, apply changes (connections before dependent data sources).
- **Add lifecycle hooks / state management:** Load relevant domain file, walk items for this specific addition.
- **Fix a bug:** Run prismatic-tools diagnose-build, read errors, identify root cause, fix.

## Phase 3: Apply Changes
Read cookbook patterns for relevant items. Make targeted edits with Edit tool — do not overwrite files. Verify edits preserve existing functionality.

## Phase 4: Build, Deploy, Test
Build → Deploy → Test as in build mode. On build failure: `prismatic-tools diagnose-build`.

Pass `--mode modify --extracted-state {state.json}` and `--scope` with modification_scope choices to prismatic-tools update-tasks.
