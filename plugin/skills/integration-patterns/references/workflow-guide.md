# Workflow Guide

## Progress Tracking Format

Throughout the workflow, display progress indicators to help users track their position:

```
[Phase X/8: Phase Name]
Progress: ✅ Setup → ✅ Requirements → ⏸️ Initialization → ⏹️ Code Gen → ⏹️ Build/Deploy → ⏹️ Test → ⏹️ Iteration → ⏹️ Delivery
```

**Legend:**

- ✅ Completed
- ⏸️ Current phase
- ⏹️ Not yet started
- 🔄 In progress (for phases that may take time)

**Display this at the start of each phase** to maintain context.

## Phase Transitions

Each phase transition should:

1. Show updated progress indicator
2. Confirm previous phase completion
3. State current phase goal
4. List action items

## Checkpoints

Each phase should end with clear readiness criteria before proceeding to the next phase.
