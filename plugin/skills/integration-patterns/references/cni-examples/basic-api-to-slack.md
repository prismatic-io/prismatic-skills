# Example 01: Basic API to Slack Integration

## Overview

This example demonstrates the **fundamental building blocks** of a Prismatic Code Native Integration (CNI). It shows how to fetch data from an API and send it to Slack - the "Hello World" of integrations.

**Key Concepts:**

- Basic flow structure
- Configuration variables
- HTTP requests with axios
- Logging for debugging
- External SDK usage (Slack WebClient)
- Returning data from executions

---

## What This Integration Does

1. Fetches TODO items from a REST API endpoint (configurable)
2. Filters for incomplete items only
3. Sends each incomplete item as a message to a Slack channel
4. Logs progress and returns summary data

**Use Case**: Any scenario where you need to fetch data from an API and send notifications.

---

## Complete Working Example

### Project Structure

```
basic-api-slack/
├── src/
│   ├── index.ts                # Integration definition
│   ├── flows.ts                # Flow implementation
│   └── configPages.ts          # Configuration UI
├── package.json
├── tsconfig.json
└── webpack.config.js
```

---

## Step 1: Flow Implementation

### `src/flows.ts`

```typescript
import { flow, util } from "@prismatic-io/spectral";
import axios from "axios";
import { WebClient } from "@slack/web-api";

// Define the shape of TODO items we expect from the API
interface TodoItem {
  id: number;
  completed: boolean;
  task: string;
}

export const todoAlertsFlow = flow({
  // User-visible name in Prismatic UI
  name: "Send TODO messages to Slack",

  // ⭐ CRITICAL: stableKey NEVER changes after first deployment ⭐
  // This is how Prismatic tracks this flow across versions
  // If you change it, Prismatic thinks it's a NEW flow
  stableKey: "todo-alerts-flow",

  description: "Fetch TODO items from Acme and send incomplete ones to Slack",

  // onExecution is called when the flow runs
  // This flow doesn't have a trigger (webhook), so it's invoked manually or on a schedule
  onExecution: async (context) => {
    // ⭐ CONTEXT OBJECT ⭐
    // Contains everything you need to interact with Prismatic and user config
    const { logger, configVars } = context;

    // logger.info() appears in execution logs (visible to users)
    // Use this for important progress updates
    logger.info("Starting TODO fetch and Slack notification flow");

    // ⭐ CONFIG VARS ⭐
    // configVars contains user-configured values
    // Keys match the stableKeys defined in configPages.ts
    const apiEndpoint = util.types.toString(configVars["Acme API Endpoint"]);
    const slackToken = util.types.toString(configVars["Slack Bot Token"]);
    const slackChannel = util.types.toString(configVars["Slack Channel"]);

    // WHY util.types.toString()?
    // Config vars can be many types (string, number, connection, etc.)
    // This helper safely converts to string and handles edge cases

    logger.info(`Fetching TODO items from ${apiEndpoint}`);

    // ⭐ MAKING API REQUESTS ⭐
    try {
      // axios.get returns a response object with .data property
      const { data: todoItems } = await axios.get<TodoItem[]>(apiEndpoint);

      logger.info(`Fetched ${todoItems.length} TODO items`);

      // Initialize Slack WebClient with the user's token
      const slack = new WebClient(slackToken);

      // Track how many messages we send
      let sentCount = 0;

      // Process each TODO item
      for (const item of todoItems) {
        if (item.completed) {
          // Skip completed items (but log it for debugging)
          logger.debug(`Skipping completed item ${item.id}: ${item.task}`);
        } else {
          logger.info(`Sending Slack message for item ${item.id}`);

          try {
            // ⭐ CALLING EXTERNAL SDK ⭐
            await slack.chat.postMessage({
              channel: slackChannel,
              text: `📋 Incomplete task: ${item.task}`,
            });

            sentCount++;
          } catch (e) {
            // ⭐ ERROR HANDLING ⭐
            // If Slack call fails, log the error but continue processing other items
            const error = e as Error;
            logger.error(
              `Failed to send message for item ${item.id}: ${error.message}`,
            );

            // If you want to STOP on first error, use: throw error;
            // If you want to CONTINUE (like here), just log it
          }
        }
      }

      logger.info(`Successfully sent ${sentCount} messages to Slack`);

      // ⭐ RETURN VALUE ⭐
      // Whatever you return here appears in execution logs
      // This helps users understand what happened
      return {
        data: {
          totalItems: todoItems.length,
          incompleteItems: todoItems.filter((i) => !i.completed).length,
          messagesSent: sentCount,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (e) {
      // ⭐ FATAL ERROR HANDLING ⭐
      // If we can't fetch data, the whole flow should fail
      const error = e as Error;
      logger.error(`Fatal error: ${error.message}`);

      // Throwing here marks the execution as FAILED in Prismatic
      throw new Error(`Failed to fetch TODO items: ${error.message}`);
    }
  },
});

// ⭐ EXPORT FLOWS AS ARRAY ⭐
// Even if you only have one flow, export as array
export default [todoAlertsFlow];
```

### Key Patterns Explained

#### 1. The `stableKey` Field

```typescript
stableKey: "todo-alerts-flow",
```

**CRITICAL RULE**: Once you deploy this integration, **NEVER** change the `stableKey`.

**WHY**: Prismatic uses `stableKey` to identify flows across different versions:

- First deployment: Prismatic sees `stableKey: "todo-alerts-flow"` → creates new flow
- Update deployment: Prismatic sees same `stableKey` → updates existing flow
- If you change it: Prismatic thinks it's a NEW flow → old flow gets orphaned

**WHEN TO CHANGE**: Only if you're intentionally creating a completely different flow alongside the existing one.

#### 2. The Context Object

```typescript
onExecution: async (context) => {
  const { logger, configVars } = context;
};
```

**Available in context:**

- `logger` - For logging (info, debug, warn, error)
- `configVars` - User's configuration values
- `executionId` - Unique ID for this execution
- `instanceId` - Unique ID for this instance
- `webhookUrls` - URLs for webhook flows (if applicable)
- `stepId` - Current step ID (for multi-step flows)

**WHY context instead of globals**: Makes testing easier and keeps your code pure.

#### 3. Logging Best Practices

```typescript
logger.info(); // Important progress updates (users see this)
logger.debug(); // Detailed debugging info (verbose mode only)
logger.warn(); // Non-fatal issues
logger.error(); // Errors (shows execution as failed)
```

**DON'T use `console.log()`**:

- Won't appear in Prismatic execution logs
- Goes to server logs you can't see
- Not captured for debugging

**DO use `logger.info()` for**:

- Start of execution
- Major steps completed
- Summary of results

#### 4. Error Handling Strategy

**Non-Fatal Errors** (continue processing):

```typescript
try {
  await slack.chat.postMessage({ ... });
} catch (e) {
  logger.error(`Failed: ${e.message}`);
  // Don't throw - continue with next item
}
```

**Fatal Errors** (stop execution):

```typescript
try {
  const { data } = await axios.get(apiEndpoint);
} catch (e) {
  logger.error(`Cannot continue: ${e.message}`);
  throw new Error(`Fatal error: ${e.message}`);
}
```

**RULE**: If you can't complete the flow's purpose, throw. If one item fails but others can succeed, log and continue.

#### 5. Return Value

```typescript
return {
  data: {
    totalItems: 10,
    sentCount: 7,
  },
};
```

**IMPORTANT**: Always return an object with a `data` property.

**WHERE IT APPEARS**:

- Prismatic execution logs (users can see it)
- Can be accessed by subsequent flows
- Helps with debugging

---

## Step 2: Configuration Pages

### `src/configPages.ts`

```typescript
import {
  configPage,
  configVar,
  connectionConfigVar,
  OAuth2Type,
} from "@prismatic-io/spectral";

export const configPages = {
  // ⭐ CONFIGURATION PAGE 1: Slack Connection ⭐
  "Slack Connection": configPage({
    tagline: "Connect to your Slack workspace",
    elements: {
      // ⭐ CONNECTION CONFIG VAR ⭐
      // For services requiring authentication, use connectionConfigVar
      // Note: dataType: "password" is NOT valid for configVar() - use a connection instead
      "Slack Connection": connectionConfigVar({
        stableKey: "slack-connection",
        dataType: "connection",
        inputs: {
          botToken: {
            label: "Bot Token",
            type: "password", // "password" IS valid for connection inputs
            required: true,
            comments: "Your Slack bot token (starts with xoxb-)",
          },
        },
      }),
    },
  }),

  // ⭐ CONFIGURATION PAGE 2: Integration Settings ⭐
  "Integration Settings": configPage({
    tagline: "Configure the API endpoint and Slack channel",
    elements: {
      "Acme API Endpoint": configVar({
        stableKey: "acme-api-endpoint",
        dataType: "string",
        description: "The REST API endpoint to fetch TODO items from",
        defaultValue:
          "https://my-json-server.typicode.com/prismatic-io/placeholder-data/todo",
      }),

      "Slack Channel": configVar({
        stableKey: "slack-channel",
        dataType: "string",
        description: "The Slack channel to post messages to (e.g., #general)",
        defaultValue: "#general",
      }),
    },
  }),
};
```

### Key Patterns Explained

#### 1. Config Pages Structure

```typescript
export const configPages = {
  "Page Name": configPage({ ... }),
  "Another Page": configPage({ ... }),
};
```

**WHY PAGES**: Organize related config into logical groups. Users see tabs in the UI.

**NAMING**: Use descriptive names that make sense to end users configuring the integration.

#### 2. Config Variable Types

Valid `dataType` values for `configVar()`:

```typescript
dataType: "string"; // Plain text input
dataType: "number"; // Number input
dataType: "boolean"; // Checkbox
dataType: "code"; // Multi-line code editor (requires codeLanguage)
dataType: "date"; // Date picker
dataType: "timestamp"; // Timestamp picker
dataType: "picklist"; // Dropdown (requires pickList array)
dataType: "schedule"; // Schedule selector
dataType: "objectSelection"; // Object selection
dataType: "objectFieldMap"; // Field mapping
dataType: "jsonForm"; // JSON Form
dataType: "htmlElement"; // HTML element
```

**⚠️ IMPORTANT**: `"text"` and `"password"` are NOT valid for `configVar()`.

**For secrets**: Use `connectionConfigVar()` with `type: "password"` inputs:

```typescript
"API Connection": connectionConfigVar({
  stableKey: "api-connection",
  dataType: "connection",
  inputs: {
    apiKey: {
      label: "API Key",
      type: "password",  // Valid for connection inputs
      required: true,
    },
  },
}),
```

**For multi-line text**: Use `dataType: "code"` with `codeLanguage`:

```typescript
"Config JSON": configVar({
  stableKey: "config-json",
  dataType: "code",
  codeLanguage: "json",
  description: "Configuration in JSON format",
}),
```

#### 3. The `stableKey` for Config Vars

```typescript
stableKey: "slack-bot-token",
```

**SAME RULE AS FLOWS**: Never change `stableKey` after deployment.

**WHY**: If you change it:

- Users' existing config values are lost
- They have to reconfigure everything
- You'll get support tickets

**WHEN TO CHANGE**: Only if you're intentionally creating a NEW config field.

#### 4. Default Values

```typescript
defaultValue: "https://api.example.com/todos",
```

**HELPFUL FOR**:

- Example values that show the expected format
- Reasonable defaults that work for most users
- Pre-filling test endpoints during development

**OPTIONAL**: Not all config vars need defaults.

---

## Step 3: Integration Definition

### `src/index.ts`

```typescript
import { integration } from "@prismatic-io/spectral";
import flows from "./flows";
import { configPages } from "./configPages";

export default integration({
  // ⭐ INTEGRATION METADATA ⭐
  name: "Basic API to Slack Integration",
  description: "Fetch TODO items from an API and send incomplete ones to Slack",

  // Category helps users find your integration
  category: "Communication",

  // Labels for filtering and organization
  labels: ["slack", "notifications", "todos"],

  // Icon path (optional) - place icon.png in project root
  iconPath: "icon.png",

  // ⭐ LINK TO FLOWS AND CONFIG ⭐
  flows,
  configPages,

  // Version follows semantic versioning
  version: "1.0.0",
});
```

### Key Patterns Explained

#### 1. Integration Metadata

**name**: User-visible name in Prismatic marketplace and instance list
**description**: Helps users understand what this integration does
**category**: Groups integrations logically (e.g., "Communication", "CRM", "Accounting")

#### 2. Categories

Common categories:

- `"Communication"` - Slack, Teams, Email
- `"CRM"` - Salesforce, HubSpot
- `"Marketing"` - Mailchimp, SendGrid
- `"Data & Storage"` - Databases, S3, FTP
- `"Productivity"` - Google Workspace, Office 365
- `"Accounting"` - QuickBooks, Xero

#### 3. Versioning

```typescript
version: "1.0.0",  // Major.Minor.Patch
```

**BEST PRACTICE**: Increment version on every deployment:

- **Patch** (1.0.1): Bug fixes, no new features
- **Minor** (1.1.0): New features, backward compatible
- **Major** (2.0.0): Breaking changes

---

## Step 4: Dependencies

### `package.json`

```json
{
  "name": "basic-api-slack",
  "version": "1.0.0",
  "main": "index.js",
  "private": true,
  "scripts": {
    "build": "webpack",
    "import": "npm run build && prism integrations:import",
    "test": "jest",
    "lint": "eslint --ext .ts ."
  },
  "dependencies": {
    "@prismatic-io/spectral": "^10.6.3",
    "@slack/web-api": "^7.0.0",
    "axios": "^1.7.2"
  },
  "devDependencies": {
    "@prismatic-io/eslint-config-spectral": "2.1.0",
    "@types/jest": "29.5.12",
    "copy-webpack-plugin": "12.0.2",
    "jest": "29.7.0",
    "ts-jest": "29.1.2",
    "ts-loader": "9.5.1",
    "typescript": "5.5.3",
    "webpack": "5.98.0",
    "webpack-cli": "6.0.1"
  }
}
```

**KEY DEPENDENCIES**:

- `@prismatic-io/spectral` - **Required** for all CNI integrations
- `axios` - HTTP client (or use native `fetch`)
- `@slack/web-api` - Official Slack SDK

**WHY THESE VERSIONS**: Use `^` to allow minor/patch updates automatically.

---

## Step 5: TypeScript Configuration

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**IMPORTANT SETTINGS**:

- `strict: true` - Enables strict type checking (recommended)
- `target: "ES2020"` - Modern JavaScript features
- `module: "commonjs"` - Required for Prismatic

**DON'T CHANGE** unless you know what you're doing.

---

## Testing This Integration

### 1. Initialize Project

```bash
prism integrations:init basic-api-slack
cd basic-api-slack
```

### 2. Add the Code

Copy all the files above into the appropriate locations.

### 3. Install Dependencies

```bash
npm install
```

### 4. Build

```bash
npm run build
```

**WHAT THIS DOES**:

- Compiles TypeScript to JavaScript
- Bundles everything into `dist/`
- Runs webpack to package for Prismatic

**COMMON BUILD ERRORS**:

- TypeScript errors: Fix type issues in your code
- Missing dependencies: Run `npm install <package>`
- Webpack errors: Usually means syntax errors

### 5. Deploy to Prismatic

```bash
prism integrations:import
```

**WHAT THIS DOES**:

- Uploads your integration to Prismatic
- Opens integration in browser automatically
- You'll see the integration in your organization

**TROUBLESHOOTING**:

- Not authenticated? Run `prism login` first
- Build not found? Run `npm run build` first

### 6. Configure in Prismatic UI

1. Click "Configure" on your integration
2. **Slack Connection** page:
   - Enter your Slack bot token (get from <https://api.slack.com/apps>)
3. **Integration Settings** page:
   - API endpoint is pre-filled with test endpoint
   - Change Slack channel to your desired channel

### 7. Test Execution

Click "Test Integration" in Prismatic UI.

**EXPECTED RESULTS**:

- Execution shows "Success"
- Logs show each step (fetching, processing, sending)
- Return value shows summary (items fetched, messages sent)
- Check Slack - you should see messages!

**IF IT FAILS**:

- Check execution logs for error messages
- Verify Slack token is correct
- Verify Slack channel exists and bot has access
- Verify API endpoint returns expected data structure

---

## Common Variations

### Using Different APIs

```typescript
// REST API with authentication
const { data } = await axios.get(apiEndpoint, {
  headers: {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  },
});

// GraphQL API
const { data } = await axios.post(graphqlEndpoint, {
  query: `
    query {
      todos {
        id
        task
        completed
      }
    }
  `,
});
```

### Using Different Messaging Platforms

```typescript
// Microsoft Teams
import { WebhookClient } from "@microsoft/teams-webhook";
const client = new WebhookClient(webhookUrl);
await client.send({ text: message });

// Discord
import { WebhookClient } from "discord.js";
const webhook = new WebhookClient({ url: webhookUrl });
await webhook.send({ content: message });
```

### Adding Pagination

```typescript
let page = 1;
let allItems: TodoItem[] = [];

while (true) {
  const { data } = await axios.get(`${apiEndpoint}?page=${page}`);

  if (data.items.length === 0) break;

  allItems = allItems.concat(data.items);
  page++;
}
```

---

## Summary: Basic CNI Pattern

### Core Structure

1. ✅ **flows.ts** - Define flows with `onExecution`
2. ✅ **configPages.ts** - Define user-configurable settings
3. ✅ **index.ts** - Link everything together
4. ✅ **package.json** - Dependencies
5. ✅ **tsconfig.json** - TypeScript config

### Key Rules

- ✅ **Never change `stableKey`** after first deployment
- ✅ **Always use `logger`**, never `console.log`
- ✅ **Return `{ data: {...} }`** from flows
- ✅ **Use `util.types.toString()`** for config vars
- ✅ **Handle errors appropriately** (fatal vs non-fatal)

### When to Use This Pattern

Use this basic pattern for:

- Simple API → Notification flows
- Scheduled data syncs
- One-way data transfers
- Any integration that doesn't need OAuth or complex authentication

### Next Steps

- **Example 02**: Learn OAuth connection patterns
- **Example 03**: Build multi-flow integrations
- **Example 06**: Use Prismatic Components instead of SDKs

---

## Additional Resources

- **Spectral SDK Docs**: <https://prismatic.io/docs/spectral/>
- **Slack Web API Docs**: <https://api.slack.com/web>
- **GitHub Example**: <https://github.com/prismatic-io/examples/tree/main/integrations/code-native-integrations>
