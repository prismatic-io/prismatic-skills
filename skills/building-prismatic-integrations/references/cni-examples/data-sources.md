# Example 04: Dynamic Data Sources (Dropdowns)

## Overview

This example demonstrates **data sources** - config variables whose options are dynamically fetched from an API. Instead of users typing values, they select from a dropdown populated with real data from their connected service.

**Key Concepts:**

- dataSourceConfigVar for dynamic dropdowns
- Fetching options from authenticated APIs
- Pagination for large result sets
- Dependency on connection config vars
- picklist vs other data source types

---

## What This Does

Creates a Slack channel selector that:

1. Authenticates with Slack using OAuth connection
2. Fetches list of channels from Slack API
3. Presents channels as searchable dropdown
4. Returns selected channel ID for use in flows

**Use Case**: Any time users need to select from API data (channels, folders, users, lists, etc.)

---

## Complete Data Source Example

### Step 1: Define the Data Source

**`src/dataSources.ts`**

```typescript
import {
  Connection,
  Element,
  dataSourceConfigVar,
} from "@prismatic-io/spectral";
import { createSlackClient } from "./slackClient";
import { AxiosResponse } from "axios";

interface Channel {
  id: string;
  name: string;
}

interface ListChannelsResponse {
  ok: boolean;
  channels: Channel[];
  response_metadata?: {
    next_cursor: string;
  };
}

// ⭐ DATA SOURCE CONFIG VAR ⭐
// This creates a dropdown populated from Slack API
export const slackSelectChannelDataSource = dataSourceConfigVar({
  // ⭐ STABLE KEY ⭐
  stableKey: "slack-channel-selection",

  // ⭐ DATA SOURCE TYPE ⭐
  // "picklist" = dropdown with single selection
  dataSourceType: "picklist",

  // ⭐ PERFORM FUNCTION ⭐
  // Called when user opens the dropdown
  perform: async (context) => {
    // ⭐ ACCESS CONNECTION FROM CONTEXT ⭐
    // This data source depends on "Slack OAuth Connection" being configured first
    // Note: No type hints available due to circular reference issues, so use type assertion
    const client = createSlackClient(
      context.configVars["Slack OAuth Connection"] as Connection,
    );

    let channels: Channel[] = [];
    let cursor = null;
    let counter = 1;

    // ⭐ PAGINATION LOOP ⭐
    // Slack API returns channels in pages
    // Loop up to 10 times to avoid hitting rate limits
    do {
      const response: AxiosResponse<ListChannelsResponse> = await client.get(
        "conversations.list",
        {
          params: {
            exclude_archived: true,
            types: "public_channel",
            cursor,
            limit: 1000,
          },
        },
      );

      if (!response.data.ok) {
        throw new Error(
          `Error when fetching data from Slack: ${response.data}`,
        );
      }

      // ⭐ ACCUMULATE RESULTS ⭐
      channels = [...channels, ...response.data.channels];

      // ⭐ GET NEXT PAGE CURSOR ⭐
      cursor = response.data.response_metadata?.next_cursor;
      counter += 1;
    } while (cursor && counter < 10);

    // ⭐ TRANSFORM TO DROPDOWN OPTIONS ⭐
    // Element format: { key: value_to_store, label: text_to_display }
    const options = channels
      .sort((a, b) => (a.name < b.name ? -1 : 1))
      .map<Element>((channel) => ({
        key: channel.id, // ID stored in config (e.g., "C12345")
        label: channel.name, // Name shown to user (e.g., "#general")
      }));

    // ⭐ RETURN OPTIONS ⭐
    return { result: options };
  },
});
```

---

### Step 2: Use Data Source in Config Pages

**`src/configPages.ts`**

```typescript
import { configPage } from "@prismatic-io/spectral";
import { slackConnectionConfigVar } from "./connections";
import { slackSelectChannelDataSource } from "./dataSources";

export const configPages = {
  // ⭐ PAGE 1: CONNECTION (REQUIRED FIRST) ⭐
  Connections: configPage({
    tagline: "Authenticate with Slack",
    elements: {
      "Slack OAuth Connection": slackConnectionConfigVar,
    },
  }),

  // ⭐ PAGE 2: DATA SOURCE (DEPENDS ON PAGE 1) ⭐
  "Slack Config": configPage({
    tagline: "Select a Slack channel from a dropdown menu",
    elements: {
      // This is the data source we defined above
      "Select Slack Channel": slackSelectChannelDataSource,
    },
  }),
};
```

**IMPORTANT ORDER**:

1. Connection config MUST come before data source
2. User authorizes OAuth first
3. Then dropdown can fetch channels using that OAuth token

---

### Step 3: Use Selected Value in Flow

**`src/flows/sendMessage.ts`**

```typescript
import { flow } from "@prismatic-io/spectral";
import { createSlackClient } from "./slackClient";

export const sendMessageFlow = flow({
  name: "Send Message to Selected Channel",
  stableKey: "send-message",
  onExecution: async (context) => {
    const { configVars } = context;

    // ⭐ ACCESS SELECTED VALUE ⭐
    // This contains the channel ID (the "key" from Element)
    const channelId = configVars["Select Slack Channel"];

    const slackClient = createSlackClient(configVars["Slack OAuth Connection"]);

    // ⭐ USE CHANNEL ID IN API CALL ⭐
    await slackClient.post("chat.postMessage", {
      channel: channelId, // "C12345"
      text: "Hello from Prismatic!",
    });

    return { data: null };
  },
});
```

---

## Key Patterns Explained

### 1. dataSourceType Options

```typescript
dataSourceType: "picklist"; // Single selection dropdown
dataSourceType: "code"; // Multi-line code editor
dataSourceType: "string"; // Text input with suggestions
dataSourceType: "jsonForm"; // Custom form with schema-based UI (see below)
```

**MOST COMMON**: "picklist" for dropdown selectors.

**FOR COMPLEX FORMS**: Use "jsonForm" for multi-field forms, field mapping, or structured configuration. See [json-forms.md](json-forms.md) for complete guide.

### 2. Element Structure

```typescript
interface Element {
  key: string;      // Value stored in config (sent to flow)
  label: string;    // Text displayed to user
}

// Example:
{
  key: "C12345",           // Slack channel ID (internal)
  label: "#general",       // Channel name (user-friendly)
}
```

**WHY SEPARATE**:

- `key`: Technical value needed by API (IDs, UUIDs, etc.)
- `label`: Human-readable text for UI

### 3. Pagination Pattern

```typescript
let items = [];
let cursor = null;

do {
  const response = await api.get("/items", { params: { cursor } });
  items = [...items, ...response.data.items];
  cursor = response.data.next_cursor;
} while (cursor && items.length < 10000); // Safety limit
```

**WHY PAGINATE**:

- APIs limit results per request (100-1000 items)
- Large orgs might have 10,000+ channels
- Must loop to get all options

**SAFETY LIMIT**: Stop at reasonable size (10,000) to avoid:

- Rate limiting
- UI hanging (too many options)
- Long load times

### 4. Dependency on Other Config Vars

```typescript
perform: async (context) => {
  // ⭐ ACCESS OTHER CONFIG VALUES ⭐
  // Note: No automatic type hints due to circular reference issues
  // Use type assertions as needed
  const connection = context.configVars["Slack OAuth Connection"] as Connection;
  const apiUrl = context.configVars["API Endpoint"] as string;

  // Use them to fetch data source options
};
```

**PATTERN**: Data sources can depend on connections or other config vars.

**NO TYPE INFERENCE**: The `context.configVars` object won't provide automatic type hints due to circular reference issues in TypeScript. Use type assertions (e.g., `as Connection`) when needed.

**ORDER MATTERS**: In config pages, put dependencies BEFORE data sources.

---

## Common Data Source Patterns

### Pattern 1: Simple List (No Pagination)

```typescript
export const statusDataSource = dataSourceConfigVar({
  stableKey: "status-selection",
  dataSourceType: "picklist",
  perform: async (context) => {
    const connection = context.configVars["CRM Connection"];
    const client = createClient(connection);

    // ⭐ SIMPLE API CALL ⭐
    const { data } = await client.get("/statuses");

    // ⭐ MAP TO ELEMENTS ⭐
    const options = data.map((status) => ({
      key: status.id,
      label: status.name,
    }));

    return { result: options };
  },
});
```

**USE WHEN**: API returns all items in one call (< 100 items typically).

### Pattern 2: Filtered List

```typescript
export const projectDataSource = dataSourceConfigVar({
  stableKey: "project-selection",
  dataSourceType: "picklist",
  perform: async (context) => {
    const connection = context.configVars["Project Management Connection"];
    const teamId = context.configVars["Team ID"]; // Filter by team

    const client = createClient(connection);

    // ⭐ FILTERED API CALL ⭐
    const { data } = await client.get(`/teams/${teamId}/projects`);

    const options = data.projects.map((project) => ({
      key: project.id,
      label: `${project.name} (${project.status})`, // Add context to label
    }));

    return { result: options };
  },
});
```

**USE WHEN**: Options depend on other config values (team, workspace, etc.)

### Pattern 3: Hierarchical Data

```typescript
export const folderDataSource = dataSourceConfigVar({
  stableKey: "folder-selection",
  dataSourceType: "picklist",
  perform: async (context) => {
    const connection = context.configVars["Drive Connection"];
    const client = createClient(connection);

    const { data } = await client.get("/folders");

    // ⭐ SHOW HIERARCHY IN LABELS ⭐
    const options = data.folders.map((folder) => ({
      key: folder.id,
      label: `${folder.path} / ${folder.name}`, // e.g., "Root / Projects / 2024"
    }));

    return { result: options.sort((a, b) => a.label.localeCompare(b.label)) };
  },
});
```

**USE WHEN**: Items have parent/child relationships (folders, org structures).

### Pattern 4: Cached/Static Options

```typescript
export const regionDataSource = dataSourceConfigVar({
  stableKey: "region-selection",
  dataSourceType: "picklist",
  perform: async (context) => {
    // ⭐ NO API CALL - STATIC LIST ⭐
    const options = [
      { key: "us-east-1", label: "US East (N. Virginia)" },
      { key: "us-west-2", label: "US West (Oregon)" },
      { key: "eu-west-1", label: "EU (Ireland)" },
      { key: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
    ];

    return { result: options };
  },
});
```

**USE WHEN**: Options rarely change (regions, plans, fixed categories).

**WHY USE DATA SOURCE**: Provides searchable dropdown instead of free text.

---

## Error Handling

### Handle Missing Dependencies

```typescript
import { Connection } from "@prismatic-io/spectral";

perform: async (context) => {
  // ⭐ ACCESS CONNECTION ⭐
  // No type hints due to circular references, use type assertion
  const connection = context.configVars["API Connection"] as Connection;

  // ⭐ VALIDATE DEPENDENCY EXISTS ⭐
  if (!connection || !connection.token?.access_token) {
    throw new Error(
      "Please configure your API connection before selecting options",
    );
  }

  // Proceed with fetching data...
};
```

**WHY**: Provides clear error message when user hasn't set up prerequisites.

**NOTE**: Always validate dependencies exist before using them, since config vars are accessed by string key names without compile-time checking.

### Handle API Errors

```typescript
perform: async (context) => {
  try {
    const { data } = await client.get("/channels");
    return { result: data.map(/* ... */) };
  } catch (e) {
    const error = e as Error;

    // ⭐ USER-FRIENDLY ERROR ⭐
    throw new Error(
      `Failed to fetch channels: ${error.message}. ` +
        `Please check your connection and try again.`,
    );
  }
};
```

**BEST PRACTICE**: Always wrap API calls in try/catch and provide actionable errors.

---

## Testing Data Sources

### 1. Build and Deploy

```bash
npm run build
prism integrations:import
```

### 2. Configure Connection First

In Prismatic UI:

1. Open integration
2. Go to "Connections" page
3. Authorize OAuth connection
4. Save configuration

### 3. Test Data Source

1. Go to next config page with data source
2. Click dropdown
3. Options should load from API
4. Select an option
5. Save configuration

### 4. Verify in Logs

```bash
# View integration logs
prism logs --integration="Your Integration"

# Look for data source perform() calls
# Should see successful API requests
```

---

## Common Issues

### Issue: "Cannot read property 'token' of undefined"

**CAUSE**: Connection not configured before data source loads

**FIX**:

1. Ensure connection config comes BEFORE data source in configPages
2. Add validation in perform():

   ```typescript
   if (!connection?.token) {
     throw new Error("Please connect your account first");
   }
   ```

### Issue: Dropdown is empty

**CAUSE**: API returned no results or mapping failed

**FIX**:

1. Add logging to see what API returns:

   ```typescript
   console.log("API response:", data);
   ```

2. Check mapping logic converts to Element format
3. Verify API authentication is working

### Issue: Dropdown takes forever to load

**CAUSE**: Too many API calls or no pagination limit

**FIX**:

1. Add counter to limit pages:

   ```typescript
   while (cursor && counter < 10)  // Stop after 10 pages
   ```

2. Add limit to API requests:

   ```typescript
   params: {
     limit: 1000;
   } // Max per request
   ```

3. Consider caching if data doesn't change often

---

## Summary: Data Source Pattern

### Core Components

1. ✅ **dataSourceConfigVar** - Define dynamic dropdown
2. ✅ **perform function** - Fetch options from API
3. ✅ **Element mapping** - Convert API data to { key, label }
4. ✅ **Pagination** - Handle large result sets
5. ✅ **Error handling** - Validate dependencies

### Key Rules

- ✅ **Put connections BEFORE data sources** in config pages
- ✅ **Return { result: Element[] }** from perform()
- ✅ **Add pagination** for large datasets
- ✅ **Limit total results** to avoid UI hangs
- ✅ **Provide clear errors** when dependencies missing

### When to Use Data Sources

Use data sources for:

- Selecting from API lists (channels, folders, users)
- Multi-tenant scenarios (workspaces, organizations)
- Dynamic options that change per user
- Improving UX over free text input

**DON'T use for**:

- Static lists (use regular configVar with UI hints instead)
- Values that need free text input
- Options that never change

---

## Next Steps

- **JSON Forms**: For complex form-based configuration UIs - [json-forms.md](json-forms.md)
- **Example 05**: Error handling patterns
- **Example 08**: Data transformation techniques
- **Example 09**: Testing and debugging

---

## Additional Resources

- **Data Sources Docs**: <https://prismatic.io/docs/spectral/data-sources/>
- **JSON Forms Docs**: <https://prismatic.io/docs/integrations/data-sources/json-forms/>
- **GitHub Example**: <https://github.com/prismatic-io/examples/tree/main/integrations/code-native-integrations/slack-cni-integration/src/dataSources.ts>
