# Integration Development Phases

Detailed instructions for each phase of integration development.

## Progress Indicators

Display at each phase start:

```text
[Phase X/7: Name]
Progress: [status icons for each phase]

Legend:
⏸️ Current phase
✅ Complete
⏹️ Not started
```

## Phase 1: Setup & Verification

**REQUIRED at session start. Never skip.**

### Running Setup

```bash
npx tsx scripts/prerequisites.ts <INTEGRATION_NAME> --type integration
```

The script:
1. Validates the integration name (lowercase, hyphens, no leading numbers)
2. Checks that the Prism CLI is installed
3. Verifies Prismatic authentication
4. Creates session directory at `.prismatic/sessions/integration/<name>/`
5. Initializes `requirements.json`

### Error Resolution

- **Prism not installed** → Ask the user to run `npm install -g @prismatic-io/prism`
- **Not logged in** → Run `prism login` to authenticate via browser
- **npm not found** → Install Node.js from nodejs.org
- **Network or auth failure** → Run `prismatic-tools check-prism-access` for structured diagnosis (exit 1=network, exit 2=auth, exit 3=other) with environment-specific remediation steps

### Technical Notes

- Prism CLI maintains its own authentication state
- No manual credential entry required - credentials are extracted from Prism CLI
- Default URL: `https://app.prismatic.io` for US region

**Ready when:** Script shows "PHASE 1 SETUP COMPLETE"

## Phase 2: Requirements Gathering

### ⚠️ ALWAYS RUN THIS PHASE

**Required for ALL integrations** - even simple examples benefit from structured requirements.

### 🛑 CRITICAL: ANSWER INFERENCE RULES 🛑

**Questions come in two types:**

1. **Questions that allow inference** (`allow_inference: true`) - You MAY infer from context
2. **Questions that require explicit answers** (default) - You MUST ask the user

**THIS IS AN INTERACTIVE PROCESS - Follow the rules below for each question type.**

#### FOR QUESTIONS WITH `inference: allowed`

When the YAML spec item has `inference: allowed`:

1. Check if the answer is explicitly stated and unambiguous in the user's request
2. **If 100% confident**: Write the answer directly to requirements.json, tell the user what you inferred and why
3. **If ANY uncertainty**: ask the user inline in conversation

**Example of correct inference:**

- User said "Salesforce to Slack webhook" → source_system = "Salesforce" is unambiguous
- ✅ Infer directly, explain: "I'm noting Salesforce as the source system based on your description."

**Example requiring user input:**

- User said "CRM to messaging app" (generic terms)
- ✅ Ask the user — cannot determine specific system names

#### FOR QUESTIONS WITH `inference: prohibited` (default)

These questions REQUIRE explicit user input — present choices inline in conversation. No exceptions.

**You are NOT ALLOWED to:**

- Answer questions based on the user's initial request
- Infer answers or make assumptions because they "seem obvious"
- Say "Based on your request..." and then answer
- Skip asking questions because you think you know the answer

### Execution Steps

The agent drives requirements gathering conversationally using the YAML spec (`scripts/questions/integration.yaml` and its domain files). There is no DAG script — the agent IS the traversal engine.

**1. Read the master spec:**

Read `${CLAUDE_PLUGIN_ROOT}/scripts/questions/integration.yaml` to see all requirement groups and their domain files.

**2. Load domain files progressively:**

Read each domain file only when entering its group. Skip domain files when prior answers eliminate them (e.g., skip `flow-planning.yaml` for single-flow integrations).

**3. For each requirement item:**

- If `agent_context` exists — base your narration on it (don't improvise from scratch)
- If `implications` exists — cover each option's downstream effects when presenting choices
- If `inference: allowed` — infer from context when confident, explain what you inferred and why
- If `inference: prohibited` — ALWAYS ask the user via AskUserQuestion
- If `type: lookup` — use `prismatic-tools find-components` to search, present results to user
- If `docs` exists — do NOT fetch on every question; follow the doc-fetch protocol in the agent instructions

**4. Persist answers:**

Read `requirements.json`, merge the new answer, and write back using Edit or Write. Minimize tool call noise by batching when natural. For multi-flow integrations, use `prismatic-tools record-choices <answers-file> --flow <flow-id> '<json>'` to handle flow-scoped nesting and connection type validation automatically.

**5. Verify completeness:**

When all groups are covered, read the YAML spec and requirements.json together to confirm nothing is missing. If items are missing, ask about them before proceeding. After context compaction (when you may have lost track of which groups were covered), use `prismatic-tools validate-requirements <spec-path> <requirements.json>` for a mechanical spec-vs-answers diff.

### Inference Rules

- **`inference: allowed`** — You MAY infer from context when the answer is explicitly stated and unambiguous. State what you inferred and why.
- **`inference: prohibited`** (default) — You MUST ask the user. No exceptions.

### What Gets Captured

The agent:

- Searches for components via `prismatic-tools find-components`
- Asks conditional questions based on previous answers
- Stores structured data in `requirements.json`

### After Completion

You'll have `<SESSION_DIR>/requirements.json` with all answers.

Use the requirements data in Phase 3 to guide:

- Trigger type selection
- Connection configuration (if `source_connection_existing` or `destination_connection_existing` objects exist, use their `stableKey` values)
- Error handling setup
- Component code integration

**Ready when:** All required items in the YAML spec have answers in requirements.json

## Phase 3: Code Generation

Note: Project scaffolding happens after Phase 2. Run `scripts/integrations/scaffold-project.ts <name> --components <comp1,comp2>` to create the project structure and install component manifests.

**Identify components from requirements:**

Based on the requirements gathered in Phase 2, identify which 3rd party components are needed:

- Search for components: `prismatic-tools find-components` with search keyword
- Scaffold: MCP `prism_integrations_init` with `name`, then `prism_install_component_manifest` for each component

**Copy requirements to the project after scaffolding:**

```bash
cp <SESSION_DIR>/requirements.json <PROJECT_DIR>/<integration-name>/requirements.json
```

### Project Structure (created by scaffold-project.ts)

```
~/<integration-name>/
├── src/
│   ├── index.ts            ← Integration definition
│   ├── componentRegistry.ts ← Component manifest registration
│   ├── flows.ts            ← Flow implementations
│   ├── configPages.ts      ← User configuration
│   └── manifests/          ← Installed component manifests
│       ├── slack/
│       └── salesforce/
├── package.json
├── tsconfig.json
└── requirements.json
```

### Important Notes

- **ALL code files go in `~/<integration-name>/src/`**
- Scripts expect FULL PATHS - don't use relative paths
- Run `npm install --prefix <project-dir>` if build fails due to missing dependencies

### ⭐ IMPORTANT: There should be a basic project structure in place with placeholder code in many of the relevant files. It is likely best to modify those existing files instead of completely overwriting them

### Files to Modify and/or Generate

1. **src/componentRegistry.ts** - Component manifest registration (REQUIRED when using 3rd party components)
   - Import manifests from `./manifests/<component>/`
   - Export `componentRegistry` using `componentManifests()`
   - See [manifest-pattern.md](manifest-pattern.md) for complete guide

2. **src/configPages.ts** - Configuration UI
   - Config variables using `configVar()`
   - Connection definitions using manifest helpers (e.g., `slackOauth2`)
   - Data source dropdowns using manifest helpers (e.g., `slackSelectChannels`)

3. **src/flows.ts** - Integration logic
   - Trigger configuration
   - Action steps using manifest import + `<component>Actions.<action>.perform()`
   - Data transformations

4. **src/index.ts** - Integration metadata
   - Name, description, and documentation import
   - Export flows, configPages, and componentRegistry

5. **src/documentation.md** - User-facing documentation
   - Markdown content describing what the integration does
   - MUST be imported by index.ts: `import documentation from "./documentation.md"`

6. **test-data/trigger-config.json** - Trigger metadata (REQUIRED)
   - Document trigger type for each flow
   - Specify expected payload format for webhook flows
   - See [trigger-metadata-spec.md](trigger-metadata-spec.md) for complete specification

7. **test-data/<flow-key>/sample-payload.<ext>** - Test payload files (for webhook flows)
   - Create actual test payload files that match trigger expectations
   - Place in `test-data/<flow-stable-key>/` subdirectory
   - Use appropriate extension (.json, .xml, .txt)

### ⭐ CRITICAL: Always Create Test Data Directory with Metadata AND Payloads

**Create the `test-data/` directory structure immediately after generating flows.ts:**

1. **`test-data/`** - Root directory for all test artifacts
2. **`test-data/trigger-config.json`** - Metadata describing what each flow expects
3. **`test-data/<flow-key>/sample-payload.<ext>`** - Actual test payload file (for webhook flows)

**For webhook flows:**

- Create subdirectory: `test-data/<flow-stable-key>/`
- Create file: `sample-payload.json` (or .xml, .txt depending on contentType)
- File content must match what your `onTrigger` code expects to parse
- The test script will look for this file during Phase 4-5

**For scheduled/manual flows:**

- Only document in `test-data/trigger-config.json` (no payload subdirectory needed)

**Directory structure example:**

```
my-integration/
├── src/
│   └── ...
└── test-data/
    ├── trigger-config.json
    └── my-webhook-flow/
        └── sample-payload.json
```

See [trigger-metadata-spec.md](trigger-metadata-spec.md) for complete specification and examples.

### Resources

- Complete guide: [code-generation-guide.md](code-generation-guide.md)
- Manifest pattern: [manifest-pattern.md](manifest-pattern.md)
- Trigger metadata: [trigger-metadata-spec.md](trigger-metadata-spec.md)
- Examples: [cni-examples/](cni-examples/)

### Using Component Manifests

**All 3rd party components are accessed via manifests.** Install manifests during scaffolding and use them in your code.

**Workflow:**

1. **Identify needed components during Phase 2:**

   Use `prismatic-tools find-components` with search keyword

2. **Install manifests during scaffolding:**

   ```bash
   scripts/integrations/scaffold-project.ts <name> --components slack,salesforce
   ```

3. **Register manifests in componentRegistry.ts:**

   ```typescript
   import { componentManifests } from "@prismatic-io/spectral";
   import slack from "./manifests/slack";
   import salesforce from "./manifests/salesforce";

   export const componentRegistry = componentManifests({ slack, salesforce });
   ```

4. **Use connection helpers in configPages.ts:**

   ```typescript
   import { slackOauth2 } from "./manifests/slack/connections/oauth2";

   "Slack Connection": slackOauth2("slack-connection", {
     clientId: { value: process.env.SLACK_CLIENT_ID || "" },
     // ...
   }),
   ```

5. **Access components in flows.ts:**

   ```typescript
   import slackActions from "../manifests/slack/actions";

   await slackActions.postMessage.perform({
     connection: context.configVars["Slack Connection"],
     channelName: context.configVars["Slack Channel"],
     message: "Hello!",
   });
   ```

**Complete guide:** See [manifest-pattern.md](manifest-pattern.md) for detailed patterns and examples.

**Ready when:** All TypeScript files generated and validated

## Pre-flight Checks Before Deployment

### 1. Verify Scoped Config Variables Exist

If your integration uses `organizationActivatedConnection({ stableKey: "xxx" })`, the scoped config variable (organization connection) **MUST exist in Prismatic before importing** the integration.

**Dependency Chain:**
```
Publish Component → Create Scoped Config Variable → Import Integration
```

**Common error if missing:**
```
Error: Scoped config variable with stableKey 'xxx' not found
```

**Resolution:**
1. Ensure the component is published: `npm run publish` in component directory
2. Create the organization connection using `create-organization-connection.ts`:
   ```bash
   npx tsx scripts/integrations/create-organization-connection.ts \
     --component-key <component> \
     --connection-key <connection> \
     --name "My Connection" \
     --stable-key <stable-key-used-in-integration>
   ```
3. Then import the integration: `npm run import`

### 2. Verify Component is Published

If the integration references a custom component via `organizationActivatedConnection`, that component must be published first.

```bash
cd integrations/components/<component-name>
npm run build && npm run publish
```

---

## Phase 4-5: Build, Deploy & Test

### Step 4.1: Build

```bash
npm run build --prefix <project-dir>
```

If build fails:

- Run `prismatic-tools diagnose-build <project-dir> --type integration` for diagnosis
- Fix issues (see [troubleshooting-errors.md](troubleshooting-errors.md))
- Rebuild

### Step 4.2: Deploy

```bash
npx tsx scripts/integrations/deploy-integration.ts <project-dir>
```

The deploy script validates the build exists, retries with exponential backoff (5 attempts, 2-20s), and waits for the integration to stabilize.

Returns:

- Integration ID (extract from output - look for `SW50ZWdyYXRpb246...` pattern)
- Integration URL

### Step 5.1: Configure Test Instance

Guide user to:

1. Open integration URL in Prismatic UI
2. Create test instance
3. Fill configuration (API keys, OAuth, etc.)
4. Save configuration

### Step 5.2: Run Test

#### Basic Testing (Scheduled/Manual Flows)

Use MCP `prism_integrations_flows_test` with the integration ID.

#### Webhook Flow Testing

Use MCP `prism_integrations_flows_test` with:
- Integration ID
- Flow name
- Test payload from `test-data/<flow-stable-key>/sample-payload.json`

**Prerequisites:**

- Integration must include `test-data/trigger-config.json` file (agent generates this in Phase 3)
- Webhook flows must have corresponding payload files in `test-data/<flow-key>/`

#### Other Testing Options

- **Manual trigger** in Prismatic UI (Configuration tab → Test Flow)
- **Send test webhook** using `curl` or Postman to flow's webhook URL
- **Scheduled flows** wait for schedule or use manual test

### Step 5.3: Review Results

Check:

- Success/failure status
- Log messages
- Error details
- Returned data
- Webhook response (for webhook triggers)

**Common webhook issues:**

- **Empty payload** - Flow expects webhook data but receives none → Ensure `test-data/trigger-config.json` exists and use `--integration-dir`
- **Wrong content type** - XML parser receives JSON or vice versa → Check trigger metadata file matches trigger implementation
- **Missing payload fields** - Flow expects specific data structure → Update sample payload file in `test-data/<flow-key>/`
- **No metadata file** - Test runs without payload → `test-data/trigger-config.json` should have been created in Phase 3
- **Payload file not found** - Script warns about missing test payload → Create `test-data/<flow-key>/sample-payload.<ext>` in Phase 3
- **Payload structure mismatch** - Trigger fails to parse sample payload → Verify sample payload matches what `onTrigger` expects

**If test artifacts are missing:**

The agent MUST create `test-data/` directory with trigger metadata and payload files during Phase 3 for ALL integrations. If testing reveals they're missing, go back and create them before continuing.

### Step 5.4: Debugging Failed Tests

**If test fails or times out:**

1. Check execution logs in output for specific errors
2. Verify configuration variables are set correctly in test instance
3. For webhook flows, ensure payload matches expected format
4. Review integration logs in Prismatic UI for more details
5. Check network connectivity for external API calls

**Ready when:** Test results reviewed

## Phase 6: Iteration

### If Issues Found

1. Review execution logs
2. Identify code changes needed
3. Update flows.ts or configPages.ts
4. Return to Phase 4-5 (rebuild/deploy/test)
5. Repeat until working

### Common Iterations

- Add error handling
- Adjust data transformations
- Fix configuration issues
- Improve logging

**Ready when:** Integration meets requirements

## Phase 7: Delivery

### Create Package (if requested)

```bash
npx tsx scripts/integrations/package-for-download.ts <project-dir> [version]
```

The script handles smart exclusions (.env, node_modules, .git), zip-with-tar-fallback, versioned filenames, and size formatting.

### Next Steps for User

- Integration deployed on Prismatic
- Source code for version control
- Deploy to production via Prismatic UI

**Ready when:** Integration deployed and tested
