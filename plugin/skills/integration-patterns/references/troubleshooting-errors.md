# Common Errors and Solutions

This guide covers frequently encountered errors when building CNIs.

---

## TypeScript Compilation Errors

### Error: Cannot find module '@prismatic-io/spectral'

**Cause:** Dependencies not installed

**Solution:**

```bash
npm install
```

### Error: Property 'configVars' does not exist on type 'Context'

**Cause:** Incorrect context type or missing type inference

**Solution:**

Do NOT manually annotate the context type — the `flow()` function infers types automatically. `FlowContext` is not a public export from `@prismatic-io/spectral`.

```typescript
import { flow } from "@prismatic-io/spectral";

export const myFlow = flow({
  name: "My Flow",
  stableKey: "my-flow",
  onExecution: async (context, params) => {
    // context.configVars is automatically typed by flow()
    const apiKey = context.configVars["API Key"];
    return { data: null };
  },
});
```

If you still get this error, ensure you're using `flow()` from `@prismatic-io/spectral` and that your `@prismatic-io/spectral` dependency is installed.

### Error: Type 'string | undefined' is not assignable to type 'string'

**Cause:** Config variable might be undefined

**Solution:**

Use Spectral's utility functions for type safety:

```typescript
import { util } from "@prismatic-io/spectral";

onExecution: async (context) => {
  // Convert to string safely (throws if undefined/null)
  const apiKey = util.types.toString(context.configVars["API Key"]);

  // Or check manually
  const rawValue = context.configVars["API Key"];
  if (!rawValue) {
    throw new Error("API Key is required but not configured");
  }
  const apiKey = rawValue as string;

  return { data: null };
};
```

### Error: TS2352 - Conversion of type 'X' may be a mistake

**Cause:** Direct casting from `Record<string, unknown>` or generic types to specific interfaces fails because TypeScript doesn't see sufficient overlap.

**Example error:**
```
Conversion of type 'Record<string, unknown>' to type 'Lead' may be a mistake
because neither type sufficiently overlaps with the other.
```

**Solution:**

Use the **double-cast pattern** through `unknown`:

```typescript
// ❌ WRONG - Direct cast fails with TS2352
const data = payload.body.data as Lead;

// ✅ CORRECT - Double cast through unknown
const data = payload.body.data as unknown as Lead;
```

**Why this works:** Casting to `unknown` first removes all type information, then casting to your target type tells TypeScript "I know what I'm doing." This is safe when you've validated the structure (e.g., webhook payload from a known source).

**Common scenarios:**
- Webhook payload body data
- API response parsing
- Config variable objects
- Cross-flow state retrieval

---

## Authentication Errors

### Error: "Unauthorized" or "Invalid token"

**Causes:**

- Token expired
- Wrong token provided
- Token for wrong account/region

**Solutions:**

1. Get fresh token: `prism login` then `prism me:token`
2. Verify token: `prism me` (should show your user info)
3. Check region endpoint matches your account

### Error: "ENOTFOUND app.prismatic.io"

**Cause:** Network access to Prismatic not configured

**Solution:** See [network-configuration.md](../network-configuration.md)

---

## Build Errors

### Error: npm run build fails with syntax errors

**Common causes:**

- Missing semicolons
- Incorrect imports
- Type mismatches

**Solution:**

Common fixes:

```typescript
// Missing import
import { flow } from "@prismatic-io/spectral"; // Add this

// Incorrect arrow function syntax
onExecution: async (context) => {
  // Correct
  return { data: null };
};

// Type mismatch
const value: string = util.types.toString(configVar); // Use util functions

// Async/await
const result = await apiCall(); // Don't forget 'await'
```

### Error: "Cannot find name 'process'"

**Cause:** Using Node.js globals without types

**Solution:**

```bash
npm install --save-dev @types/node
```

---

## Deployment Errors

### Error: prism integrations:import fails

**Possible causes:**

- Build didn't complete successfully
- Missing required files
- Invalid integration structure

**Solutions:**

1. Verify `dist/` directory exists
2. Check for build errors
3. Verify all files present: index.js, flows.js, etc.

**Specific error messages:**

- **"Integration must have at least one flow"**: Add a flow to your integration
- **"Invalid stableKey format"**: Use lowercase letters, numbers, hyphens only
- **"Duplicate stableKey"**: Each flow/config must have unique stableKey
- **"Missing required field"**: Check integration() and flow() definitions

**Debug steps:**

```bash
# Verify build output
ls dist/

# Build to check for errors
npm run build --prefix <integration-dir>

# Validate integration structure
cat dist/index.js | grep "export default"
```

---

## Runtime Errors

### Error: Execution fails with "Cannot read property 'token' of undefined"

**Cause:** Connection not configured by user

**Solution:**

Always check if connection exists before using:

```typescript
onExecution: async (context) => {
  const connection = context.configVars["OAuth Connection"];

  if (!connection || !connection.token) {
    throw new Error(
      "OAuth Connection is not configured. Please configure it in the integration settings.",
    );
  }

  const accessToken = connection.token.access_token;

  // Now safe to use
  const response = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return { data: response };
};
```

### Error: "Network timeout" during execution

**Causes:**

- External API slow/down
- Large data payload
- Missing error handling

**Solutions:**

Configure timeout and implement retry logic:

```typescript
import { util } from "@prismatic-io/spectral";

onExecution: async (context) => {
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(apiUrl, {
        timeout: 30000, // 30 second timeout
        signal: AbortSignal.timeout(30000),
      });

      return { data: await response.json() };
    } catch (error) {
      lastError = error;
      context.logger.warn(`Attempt ${attempt} failed`, { error });

      if (attempt < maxRetries) {
        // Exponential backoff
        await util.sleep(1000 * Math.pow(2, attempt));
      }
    }
  }

  throw new Error(`Failed after ${maxRetries} attempts: ${lastError.message}`);
};
```

### Error: TS2322 - onTrigger return type error

**Error message:**
```
TS2322: Type '(context: ActionContext<ConfigVars>, payload: TriggerPayload) => Promise<TriggerPayload>'
is not assignable to type 'TriggerPerformFunction<...>'.
Property 'payload' is missing in type 'TriggerPayload' but required in type 'TriggerBaseResult<TriggerPayload>'.
```

**Cause:** `onTrigger` must return `{ payload }` (an object with a `payload` property), not just `payload` directly.

**Solution:**

```typescript
// ❌ WRONG - Returns payload directly
onTrigger: async (context, payload) => {
  return Promise.resolve(payload);  // Missing { payload }
},

// ❌ WRONG - Returns payload without wrapper
onTrigger: async (context, payload) => {
  return payload;  // Missing { payload }
},

// ✅ CORRECT - Returns object with payload property
onTrigger: async (context, payload) => {
  return Promise.resolve({ payload });
},

// ✅ CORRECT - Also works without Promise.resolve
onTrigger: async (context, payload) => {
  return { payload };
},

// ✅ CORRECT - With HTTP response
onTrigger: async (context, payload) => {
  return {
    payload,
    response: {
      statusCode: 200,
      contentType: "application/json",
      body: JSON.stringify({ received: true }),
    },
  };
},
```

**Why this matters:** The `TriggerResult` type requires an object with a `payload` property. This allows you to optionally include an HTTP `response` alongside the payload.

---

### Error: Webhook returns 500 error

**Common causes:**

- Unhandled exception in onTrigger or onExecution
- Invalid response format
- Missing return statement

**Solutions:**

Always wrap webhook logic in try/catch:

```typescript
export const webhookFlow = flow({
  name: "Webhook Handler",
  stableKey: "webhook-handler",
  onTrigger: async (context, payload) => {
    try {
      context.logger.info("Webhook received", { payload });

      // Process payload
      const result = await processData(payload.body.data);

      // MUST return response object
      return {
        statusCode: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: result }),
      };
    } catch (error) {
      context.logger.error("Webhook processing failed", { error });

      // Return error response instead of throwing
      return {
        statusCode: 500,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: error.message,
        }),
      };
    }
  },
});
```

---

## Component Errors

### Error: Component action fails with undefined

**Cause:** Component manifest not installed or not registered

**Solution:**

Install the component manifest and register it:

```bash
# Install manifest
prismatic-tools install-manifest slack --project-dir <project-dir>

# Ensure componentRegistry.ts includes the manifest
# See: references/manifest-pattern.md
```

Also verify:
1. Manifest is imported in `src/componentRegistry.ts`
2. `componentRegistry` is included in `src/index.ts`

### Error: "Cannot find module './manifests/slack'"

**Cause:** Component manifest not installed

**Solution:**

Install the component manifest:

```bash
prismatic-tools install-manifest slack --project-dir <project-dir>

# Or scaffold with manifests from the start
npx tsx scripts/integrations/scaffold-project.ts <name> --components slack
```

Example package.json update:

```json
{
  "dependencies": {
    "@prismatic-io/spectral": "^10.6.3",
    "@slack/web-api": "^6.9.0"
  }
}
```

---

## Configuration Errors

### Error: dataSourceConfigVar returns empty list

**Causes:**

- API call in dataSource function failing
- Authentication not set up
- Wrong API endpoint

**Solutions:**

Debug the dataSource function:

```typescript
import { dataSourceConfigVar } from "@prismatic-io/spectral";

export const configPages = {
  "Select Option": configPage({
    elements: {
      "Dynamic Dropdown": dataSourceConfigVar({
        stableKey: "dynamic-dropdown",
        dataType: "picklist",
        dataSource: async (context) => {
          try {
            context.logger.info("Fetching dropdown options");

            const connection = context.configVars["API Connection"];
            if (!connection) {
              context.logger.warn("No connection configured");
              return [{ label: "Configure connection first", value: "" }];
            }

            const response = await fetch(apiUrl, {
              headers: {
                Authorization: `Bearer ${connection.token.access_token}`,
              },
            });

            if (!response.ok) {
              throw new Error(`API returned ${response.status}`);
            }

            const data = await response.json();
            context.logger.info("Options fetched", { count: data.length });

            return data.map((item) => ({
              label: item.name,
              value: item.id,
            }));
          } catch (error) {
            context.logger.error("Failed to fetch options", { error });
            return [{ label: "Error loading options", value: "" }];
          }
        },
      }),
    },
  }),
};
```

---

## Getting Help

If errors persist:

1. **Check execution logs** in Prismatic UI
2. **Review error messages** carefully
3. **Simplify code** to isolate issue
4. **Test components** independently
5. **Consult documentation**: <https://prismatic.io/docs/>
6. **Contact support**: <https://prismatic.io/contact/>

---

## Error Message Reference

### Spectral SDK Errors

- **"Invalid stableKey"**: Use lowercase letters, numbers, hyphens only
- **"Flow must return data"**: onExecution/onTrigger must return object with `data` field
- **"Connection type mismatch"**: Verify connection component and key match
- **"Missing required field"**: Check all required fields in integration(), flow(), configVar()

### Prism CLI Errors

- **"Not authenticated"**: Run `prism login` or set PRISMATIC_REFRESH_TOKEN
- **"Integration not found"**: Check integration ID is correct
- **"ENOTFOUND"**: Network access to \*.prismatic.io blocked
- **"Invalid token"**: Token expired, get fresh token with `prism me:token`

### Platform Errors

- **"Execution timeout"**: Flow took longer than platform limit (typically 5 minutes)
- **"Memory limit exceeded"**: Flow used too much memory, optimize data processing
- **"Rate limit exceeded"**: Too many API calls, implement backoff/caching
- **"Invalid webhook response"**: onTrigger must return object with statusCode, body

### Component Source Extraction Errors

- **"Component not found"**: Component key incorrect when downloading source
- **"Missing dependency"**: Review component's package.json and add needed deps to your CNI
- **"Cannot find module"**: Install dependencies with `npm install --prefix <project-dir>`
- **"Type errors in extracted code"**: Add proper TypeScript types to wrapper functions

For detailed explanations and additional errors, see the official Prismatic documentation.
