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

### What the Setup Script Does

The setup script verifies the development environment is ready:

1. Checks if Prism CLI is installed (offers to install if not)
2. Verifies the user is logged in to Prismatic
3. Displays the authenticated user and endpoint

### Running Setup

```bash
scripts/prerequisites.py <INTEGRATION_NAME>
```

### Error Resolution

- **Prism not installed** → Accept the install prompt, or run `npm install -g @prismatic-io/prism`
- **Not logged in** → Run `prism login` to authenticate via browser
- **npm not found** → Install Node.js from nodejs.org

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

#### FOR QUESTIONS WITH `allow_inference: true`

When the script outputs a question with inference enabled, it provides:

```json
{
  "id": "source_system",
  "text": "What is the SOURCE system name?",
  "allow_inference": true,
  "inference_sources": ["systems", "data_flow"],
  "inference_context": {
    "systems": "Salesforce to Slack",
    "data_flow": "Send new Salesforce opportunities to a Slack channel"
  }
}
```

**Your decision process:**

1. **Review the `inference_context`** - Check if you can confidently determine the answer
2. **If 100% confident**: Write the answer directly using `write_answer.py`
3. **If ANY uncertainty**: Present the question to user and wait for their response

**Example of correct inference:**

- Context shows "Salesforce" explicitly in both `systems` and `data_flow`
- ✅ Write "Salesforce" directly - no ambiguity

**Example requiring user input:**

- Context shows "CRM to messaging app" (generic terms)
- ✅ Ask the user - cannot confidently determine specific system names

**Only infer when the answer is EXPLICITLY stated and UNAMBIGUOUS in the context.**

#### FOR QUESTIONS WITHOUT `allow_inference` (default)

These questions REQUIRE explicit user input with ZERO exceptions.

**Pattern you MUST follow:**

1. Run gather_requirements.py script
2. Read question from script output (no `allow_inference` field)
3. Present question to user in natural language
4. **STOP - DO NOT PROCEED - WAIT FOR USER TO TYPE THEIR ANSWER**
5. User provides answer
6. Write their answer (not your assumption) using write_answer.py
7. Go back to step 1 and repeat

**You are NOT ALLOWED to:**

- Answer questions based on the user's initial request
- Infer answers or make assumptions because they "seem obvious"
- Say "Based on your request..." and then answer
- Say "I'll use X because..." and then answer
- Skip asking questions because you think you know the answer

### Execution Steps

**1. Start the script:**

Use the session directory path output by setup_prerequisites.py:

```bash
python scripts/gather_requirements.py \
  references/requirements-questions.json \
  <SESSION_DIR>/requirements.json
```

**2. Read the script output and identify the question:**

The script outputs JSON to stdout. Read it and parse the `status` field.

If `"status": "question"`:

```json
{
  "status": "question",
  "question": {
    "id": "systems",
    "text": "What systems are you connecting?",
    "type": "text"
  }
}
```

Go to step 3 below.

If `"status": "complete"`:

```json
{"status": "complete", "answers": {...}}
```

Phase 2 is DONE. Proceed to Phase 3 (Code Generation).

**3. ASK THE USER THE QUESTION (DO NOT ANSWER IT YOURSELF):**

Read the question text from `question.text` and present it to the user in natural language.

### 🛑 MANDATORY STOP POINT - WAIT FOR USER INPUT 🛑

**YOU MUST STOP YOUR RESPONSE HERE. DO NOT CONTINUE UNTIL THE USER TYPES THEIR ANSWER.**

### THINGS YOU ARE ABSOLUTELY FORBIDDEN FROM DOING

- ❌ **NEVER** say "Based on your request, the answer is X"
- ❌ **NEVER** say "For [situation], I'll use [answer]"
- ❌ **NEVER** say "The answer is obviously X"
- ❌ **NEVER** say "This sounds like [answer]"
- ❌ **NEVER** write any answer yourself for ANY reason
- ❌ **NEVER** assume you know what the user wants
- ❌ **NEVER** infer the answer from the initial request
- ❌ **NEVER** make assumptions about the answer
- ❌ **NEVER** proceed to the next step without user input
- ❌ **NEVER** continue to the next question
- ❌ **NEVER** call write_answer.py with your own answer

### WHAT YOU MUST DO INSTEAD

- ✅ Present the question to the user EXACTLY as written
- ✅ For choice questions, list all available options
- ✅ End your response after presenting the question
- ✅ Wait for the user to type their response in the next message
- ✅ Only proceed to step 4 after receiving the user's answer in their next message

**Question type handling:**

- `"type": "text"` → Ask the question verbatim, accept any text from user
- `"type": "choice"` → Show the choices from `choices` array, ask user to pick ONE
- `"type": "multi_choice"` → Show the choices, ask user to pick ONE OR MORE
- `"type": "dynamic_choice"` → Show the choices from `choices` array, ask user to pick ONE

**Example of CORRECT interaction:**

```
[Script outputs]: {"status": "question", "question": {"id": "systems", "text": "What systems are you connecting?", "type": "text"}}

[Your message to user]: "What systems are you connecting? (e.g., 'Salesforce to Slack')"

[END YOUR MESSAGE HERE - DO NOT TYPE ANYTHING ELSE]

[User's next message]: "Dropbox"

[Your next message]: [Now proceed to step 4 to write their answer]
```

**Example of INCORRECT interaction (DO NOT DO THIS):**

```
[Script outputs]: {"status": "question", "question": {"id": "systems", "text": "What systems are you connecting?", "type": "text"}}

[Your message to user]: "What systems are you connecting? Based on your request, the answer is Dropbox. Let me record this."

❌ THIS IS WRONG - YOU ANSWERED THE QUESTION YOURSELF
```

**Another example of INCORRECT interaction (DO NOT DO THIS):**

```
[Script outputs]: {"status": "question", "question": {"id": "trigger_type", "text": "What triggers this integration?", "type": "choice", "choices": ["webhook", "scheduled", "manual"]}}

[Your message to user]: "What triggers this integration? For listing folder contents on demand, I'll use manual trigger. Let me record this."

❌ THIS IS WRONG - YOU MADE AN ASSUMPTION AND ANSWERED
```

**4. Write the user's answer (NOT your own answer):**

```bash
python scripts/write_answer.py \
  <SESSION_DIR>/requirements.json \
  <question-id> "<user-answer>"
```

For multi_choice, use JSON array:

```bash
python scripts/write_answer.py <SESSION_DIR>/requirements.json \
  error_handling '["Retry", "Log errors"]'
```

**For dynamic_choice with `store_full_object: true`:** Write the full `value` object from the selected choice, not just the label. The question output will include a `write_instruction` field reminding you of this.

```bash
# If user selects choice with label "Slack (Customer-Activated)" and value {"stableKey": "abc123", ...}
python scripts/write_answer.py <SESSION_DIR>/requirements.json \
  source_connection_existing '{"stableKey": "abc123", "label": "Slack (Customer-Activated)", "managedBy": "CUSTOMER", "component": "slack"}'
```

**5. Return to step 1 and repeat:**

Re-run the `gather_requirements.py` script. It will output the NEXT question.

Go back to step 2 to read the output, then step 3 to present the NEW question to the user.

### 🛑 ABSOLUTE RULE FOR EVERY QUESTION 🛑

**Each question requires a NEW user response in a SEPARATE message from the user.**

**YOU ARE NOT ALLOWED TO:**

- Answer multiple questions in one response
- Answer ANY questions yourself
- Say "I think the answer is X"
- Say "Based on your request, X"
- Make educated guesses
- Infer from context
- Assume obvious answers

**EVEN IF:**

- The answer seems completely obvious
- The user already mentioned something relevant
- You're 100% confident you know what they want
- It would save time to just answer
- The question seems redundant

**YOU MUST STILL:**

- Present the question to the user
- Wait for them to type their answer
- Write only the answer they provide

**THERE ARE ZERO EXCEPTIONS TO THIS RULE.**

### Exit Codes

- **0** = Question ready (continue loop)
- **1** = Complete (go to Phase 3 Code Generation)
- **2** = Error (check stderr, debug the issue)

### What Gets Captured

The script automatically:

- Searches for components via `search_components.py`
- Discovers connections via `search_connections.py`
- Asks conditional questions based on previous answers
- Stores structured data in `requirements.json`

### After Completion

You'll have `<SESSION_DIR>/requirements.json` with all answers.

Use the requirements data in Phase 3 to guide:

- Trigger type selection
- Connection configuration (if `source_connection_existing` or `destination_connection_existing` objects exist, use their `stableKey` values)
- Error handling setup
- Component code integration

**Ready when:** Exit code 1 (status: "complete")

## Phase 3: Code Generation

Note: Project scaffolding happens after Phase 2. Run `scripts/integrations/scaffold_project.py <name> --components <comp1,comp2>` to create the project structure and install component manifests.

**Identify components from requirements:**

Based on the requirements gathered in Phase 2, identify which 3rd party components are needed:

```bash
# Search for available components
python scripts/integrations/search_components.py <keyword>

# Scaffold with manifests
scripts/integrations/scaffold_project.py <name> --components slack,salesforce
```

**Copy requirements to the project after scaffolding:**

```bash
cp <SESSION_DIR>/requirements.json <PROJECT_DIR>/<integration-name>/requirements.json
```

### Project Structure (created by scaffold_project.py)

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
- Run `install_dependencies.py` if build fails due to missing dependencies

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
   - Action steps using `context.components.<componentKey>.<action>()`
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

   ```bash
   python scripts/integrations/search_components.py <keyword>
   ```

2. **Install manifests during scaffolding:**

   ```bash
   scripts/integrations/scaffold_project.py <name> --components slack,salesforce
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
   await context.components.slack.postMessage({
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
2. Create the organization connection using `create_organization_connection.py`:
   ```bash
   python scripts/integrations/create_organization_connection.py \
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
scripts/integrations/build_integration.py <dir>
```

If build fails:

- Parse TypeScript errors
- Fix issues (see [troubleshooting-errors.md](troubleshooting-errors.md))
- Rebuild

### Step 4.2: Deploy

```bash
scripts/integrations/deploy_integration.py <dir>
```

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

```bash
scripts/integrations/test_integration.py <integration-id>
```

#### Webhook Flow Testing (Automatic Payloads)

**The script automatically uses trigger metadata to provide appropriate test payloads:**

```bash
scripts/integrations/test_integration.py <integration-id> <flow-name> --integration-dir <path-to-source>
```

**How it works:**

- Reads `test-data/trigger-config.json` (created during Phase 3)
- Identifies trigger type and expected payload format
- Looks for `test-data/<flow-stable-key>/sample-payload.<ext>`
- Automatically passes payload to `prism integrations:flows:test`

**Prerequisites:**

- Integration must include `test-data/trigger-config.json` file (agent generates this in Phase 3)
- Webhook flows must have corresponding payload files in `test-data/<flow-key>/`

**For automatic single-flow testing:**

If integration has only one flow, you can omit the flow name:

```bash
scripts/integrations/test_integration.py <integration-id> --integration-dir <path-to-source>
```

The script will automatically discover the flow name and load appropriate trigger metadata.

#### Custom Payload Testing

**For custom payloads or when auto-detection isn't available:**

```bash
# JSON payload
scripts/integrations/test_integration.py <id> <flow> --payload /path/to/payload.json

# XML payload
scripts/integrations/test_integration.py <id> <flow> --payload /path/to/data.xml --content-type application/xml

# Custom content type
scripts/integrations/test_integration.py <id> <flow> --payload /path/to/data.txt --content-type text/plain
```

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

### Create Package

```bash
scripts/integrations/package_for_download.py <dir> <version>
```

### Provide Download

File saved to `/mnt/user-data/outputs/` or current working directory.

### Next Steps for User

- Integration deployed on Prismatic
- Source code for version control
- Deploy to production via Prismatic UI

**Ready when:** Package delivered to user
