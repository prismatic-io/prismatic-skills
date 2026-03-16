# Plugin Branch Comparison — Iterative Tests

Compare the three prismatic-skills plugin branches by building the same integration
with each one and evaluating the results.

## Branches Under Test

| Branch | Architecture | Key Difference |
|--------|-------------|----------------|
| `bl/improve-python-dag-usage` | Python scripts + DAG questionnaire | Original script implementation |
| `bl/use-TS-instead-of-python` | TypeScript scripts + DAG questionnaire | Python→TypeScript rewrite, same DAG engine |
| `bl/rely-on-types-only` | No scripts, conversational agents | Scripts deleted, prism CLI + AskUserQuestion |

## Setup

Run the setup script to create isolated worktrees for each branch:

```bash
cd iterative-tests
bash setup.sh
```

This creates three sibling directories:

```
Documents/prismatic/code/
├── prismatic-skills/          # main (this repo, iterative test infrastructure)
├── prismatic-test-python/     # worktree: bl/improve-python-dag-usage
├── prismatic-test-typescript/ # worktree: bl/use-TS-instead-of-python
└── prismatic-test-nuclear/    # worktree: bl/rely-on-types-only
```

## Running a Test

Each test has a scenario file in `scenarios/`. To run one:

1. Open a terminal in a worktree directory
2. Start Claude Code with the plugin loaded from that worktree:
   ```bash
   cd ../prismatic-test-python
   claude --plugin-dir .
   ```
3. Paste the scenario prompt (or reference the scenario file)
4. Answer questions as they come — use the answer key in the scenario for consistency
5. Let the agent build the integration
6. Output lands in the worktree's working directory

Repeat for each worktree. Compare results.

## Handling User Questions

The plugin agents ask questions during integration building. This is expected and desirable —
it's part of what we're evaluating. To keep comparisons fair:

- Each scenario includes an **answer key** with canonical responses
- Give the same answers across all three branches
- Note any questions that differ between branches (this is signal)
- If a branch asks a question not in the answer key, answer naturally and record it

## Evaluating Results

After all three runs, compare:

1. **Generated code quality** — correctness, type safety, completeness
2. **Build success** — does `npm run build` pass on first try?
3. **Interaction quality** — how many questions? Were they useful? Any redundant?
4. **Error recovery** — if the build fails, how well does the agent diagnose and fix?
5. **Component usage** — correct manifest imports? Right connection types?
6. **Time/effort** — rough sense of how long each took

Record findings in `results/` per scenario.

## Scenarios

| # | Scenario | Key Patterns |
|---|----------|-------------|
| 001 | Slack webhook CRM deal notify | Webhook trigger, single component, config page (warmup) |
| 002 | Shopify→NetSuite order sync | Multi-flow, preprocess routing, lifecycle hooks, HMAC verification |
| 003 | HubSpot↔Salesforce bidirectional | Dual polling, loop prevention, state races, dynamic field mapping |
| 004 | Custom API→Google Sheets | No existing component, templated OAuth, JSON Forms, multi-page config |
| 005 | Stripe→QuickBooks + Teams | 3 components, idempotency, cross-flow state, event deduplication |
| 006 | Dynamics 365→Snowflake | Baseline + incremental, bulk load timeout, DDL generation, N cursors |

### Pattern Coverage Matrix

| Pattern | 002 | 003 | 004 | 005 | 006 |
|---------|-----|-----|-----|-----|-----|
| Multi-flow | X | X | | | |
| Preprocess routing | X | | | | |
| Lifecycle hooks | X | | | | X |
| Webhook HMAC verification | X | | | X | |
| Bidirectional sync / loop prevention | | X | | | |
| State race conditions | | X | | X | |
| Custom API (no component) | | | X | | |
| JSON Forms / dynamic config | | | X | | X |
| Templated connections | | | X | | |
| 3+ components | | | | X | |
| Cross-flow state coordination | | | | X | X |
| Baseline + incremental pattern | | | | | X |
| Complex OAuth (Azure/NetSuite) | X | | X | | X |
| Multiple data sources | | X | X | X | X |

## Cleanup

```bash
cd iterative-tests
bash teardown.sh
```
