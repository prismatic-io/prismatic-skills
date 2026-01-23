# Troubleshooting Errors

Common errors and solutions when building Prismatic components.

## Build Errors

### TypeScript Compilation Errors

**Error:** `TS2307: Cannot find module '@prismatic-io/spectral'`

**Solution:**
```bash
npm install @prismatic-io/spectral
```

---

**Error:** `TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'`

**Solution:** Check input types match expected types. Use type coercion:
```typescript
clean: util.types.toString,
```

---

**Error:** `TS2339: Property 'X' does not exist on type 'Connection'`

**Solution:** Access connection fields correctly:
```typescript
// For regular fields
const value = connection.fields.fieldName as string;

// For OAuth2 tokens
const token = connection.token?.access_token;
```

### Webpack Errors

**Error:** `Module not found: Error: Can't resolve './X'`

**Solution:** Check file exists and import path is correct. Ensure the file is in `src/` directory.

---

**Error:** `webpack is not recognized as a command`

**Solution:**
```bash
npm install webpack webpack-cli --save-dev
```

## Publish Errors

**Error:** `Error: Not logged in`

**Solution:**
```bash
prism login
```

---

**Error:** `Error: Component key already exists`

**Solution:** Either:
1. Update version in package.json
2. Use a different component key
3. Delete existing component in Prismatic UI

---

**Error:** `Error: Invalid component manifest`

**Solution:** Check that:
- `index.ts` exports a valid component
- All referenced files exist
- No circular dependencies

## Runtime Errors

### Authentication Errors

**Error:** `No access token available`

**Solution:** Ensure token is checked before use:
```typescript
const token = connection.token?.access_token;
if (!token) {
  throw new Error("Please reconnect to authenticate");
}
```

---

**Error:** `401 Unauthorized`

**Causes:**
1. Invalid API key
2. Expired OAuth token
3. Wrong header format

**Solution:**
```typescript
// Check your authorization header format
headers: {
  Authorization: `Bearer ${token}`,  // or just the token, depending on API
}
```

### API Request Errors

**Error:** `404 Not Found`

**Solution:** Verify endpoint path matches API documentation:
```typescript
// Check base URL
const baseUrl = "https://api.example.com/v1";  // Include version if needed

// Check path
await client.get("/users");  // Note leading slash
```

---

**Error:** `400 Bad Request`

**Solution:** Check request body format:
```typescript
// Ensure correct content type
headers: {
  "Content-Type": "application/json",
}

// Ensure body is correctly structured
await client.post("/resource", {
  field1: value1,
  field2: value2,
});
```

---

**Error:** `429 Too Many Requests`

**Solution:** Implement rate limiting or backoff:
```typescript
// Simple retry logic
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (error.response?.status === 429 && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return withRetry(fn, retries - 1);
    }
    throw error;
  }
}
```

### Webhook Errors

**Error:** `Webhook URL not found in context`

**Solution:** Ensure you're using the correct flow name:
```typescript
const webhookUrl = context.webhookUrls[context.flow.name];
if (!webhookUrl) {
  throw new Error("Webhook URL not available. Check flow configuration.");
}
```

---

**Error:** `Failed to register webhook`

**Solution:** Check webhook registration API:
1. Verify endpoint path
2. Check required fields in registration payload
3. Ensure authentication is valid

### Data Source Errors

**Error:** `Data source returned invalid result`

**Solution:** Ensure correct return format:
```typescript
return {
  result: [
    { label: "Display Text", key: "unique-key" },
  ],
};
```

## Common Mistakes

### Wrong Connection Access

**Incorrect:**
```typescript
const apiKey = connection.api_key;  // Won't work
```

**Correct:**
```typescript
const apiKey = connection.fields.api_key as string;
```

### Missing Async/Await

**Incorrect:**
```typescript
perform: (context, params) => {  // Missing async
  const result = client.get("/resource");  // Missing await
  return { data: result };
}
```

**Correct:**
```typescript
perform: async (context, params) => {
  const result = await client.get("/resource");
  return { data: result };
}
```

### Wrong Export Format

**Incorrect:**
```typescript
export { myAction };  // Named export won't work for component default
```

**Correct:**
```typescript
export default { myAction };  // Default export for action modules
```

### Input Type Mismatch

**Incorrect:**
```typescript
inputs: {
  connection: {  // Plain object won't work
    label: "Connection",
    type: "connection",
  },
}
```

**Correct:**
```typescript
inputs: {
  connection: connectionInput,  // Use input() helper
}
```

## Debugging Tips

### Enable Debug Mode

```typescript
const client = new MyClient({
  connection: params.connection,
  debug: context.debug.enabled,  // Log HTTP requests
});
```

### Use Logger

```typescript
context.logger.info("Starting action");
context.logger.debug(`Params: ${JSON.stringify(params)}`);
context.logger.error(`Error: ${error.message}`);
```

### Check Response Structure

```typescript
const response = await client.get("/resource");
context.logger.debug(`Response: ${JSON.stringify(response.data)}`);
```

### Test Incrementally

1. Test connection first
2. Test simple GET action
3. Add complexity gradually

## Getting Help

1. Check Prismatic documentation: https://prismatic.io/docs/
2. Review component examples: https://github.com/prismatic-io/examples
3. Check API documentation for the external service
4. Contact Prismatic support
