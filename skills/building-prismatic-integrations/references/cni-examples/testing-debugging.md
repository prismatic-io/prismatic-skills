# Testing and Debugging CNI

Comprehensive guide for testing and debugging Prismatic Code Native Integrations.

---

## Testing with prism CLI

```bash
# ⭐ TEST EXECUTION ⭐
prism executions:test \
  --integration="My Integration" \
  --flow="My Flow" \
  --payload='{"data": "test"}'

# ⭐ TEST WITH FILE PAYLOAD ⭐
prism executions:test \
  --integration="My Integration" \
  --flow="My Flow" \
  --payload-file=./test-payload.json

# ⭐ VIEW LOGS ⭐
prism logs \
  --integration="My Integration" \
  --follow  # Stream logs in real-time

# ⭐ LIST RECENT EXECUTIONS ⭐
prism executions:list \
  --integration="My Integration" \
  --limit=10

# ⭐ GET SPECIFIC EXECUTION ⭐
prism executions:get EXECUTION_ID

# ⭐ VIEW EXECUTION LOGS ⭐
prism executions:get EXECUTION_ID --output-logs
```

## Local Development Workflow

```bash
# 1. Make code changes
vim src/flows/myFlow.ts

# 2. Build
npm run build

# 3. Import to Prismatic
prism integrations:import

# 4. Test
prism executions:test --integration="My Integration" --flow="My Flow"

# 5. Review logs
prism logs --integration="My Integration" --follow
```

## Debugging Common Issues

### Issue: "Cannot find module"

```bash
# ⭐ FIX: Install missing dependencies ⭐
npm install missing-package
npm run build
prism integrations:import
```

### Issue: "Execution failed" with no details

```typescript
// ⭐ ADD MORE LOGGING ⭐
onExecution: async (context) => {
  const { logger } = context;

  logger.info("Starting execution");
  logger.info(`Config vars: ${JSON.stringify(context.configVars)}`);

  try {
    const result = await someOperation();
    logger.info(`Operation succeeded: ${JSON.stringify(result)}`);
  } catch (e) {
    logger.error(`Operation failed: ${e.message}`);
    logger.error(`Stack trace: ${e.stack}`);
    throw e;
  }
};
```

### Issue: OAuth token not working

```typescript
// ⭐ DEBUG TOKEN ⭐
const connection = configVars["OAuth Connection"];

logger.info(`Token exists: ${!!connection?.token}`);
logger.info(`Access token exists: ${!!connection?.token?.access_token}`);
logger.info(`Token issued at: ${connection?.token?.issued_at}`);

if (!connection?.token?.access_token) {
  throw new Error("Please authorize your connection in the configuration");
}
```

### Issue: Data source dropdown empty

```typescript
// ⭐ DEBUG DATA SOURCE ⭐
perform: async (context) => {
  try {
    const connection = context.configVars["Connection"];

    console.log("Connection:", connection); // Shows in build logs
    console.log("Has token:", !!connection?.token);

    const response = await client.get("/items");

    console.log("API response:", response.data);
    console.log("Items count:", response.data.items.length);

    const elements = response.data.items.map(/* ... */);

    console.log("Elements:", elements);

    return { result: elements };
  } catch (e) {
    console.error("Data source error:", e);
    throw e;
  }
};
```

## Unit Testing Flows

```typescript
// tests/flows.test.ts
import { getMyOpportunities } from "../src/flows/getMyOpportunities";

describe("getMyOpportunities", () => {
  it("should fetch opportunities", async () => {
    // Mock context
    const context = {
      logger: {
        info: jest.fn(),
        error: jest.fn(),
      },
      configVars: {
        "Salesforce Connection": {
          token: {
            access_token: "test-token",
            instance_url: "https://test.salesforce.com",
          },
        },
      },
    };

    // Mock params
    const params = {
      onTrigger: {
        results: {
          body: { data: {} },
        },
      },
    };

    // Execute flow
    const result = await getMyOpportunities.onExecution(context, params);

    // Assert
    expect(result.data.opportunities).toBeDefined();
    expect(context.logger.info).toHaveBeenCalled();
  });
});
```

## Integration Testing

```bash
# Create test instance
prism instances:create \
  --integration="My Integration" \
  --name="Test Instance" \
  --customer="Test Customer"

# Configure instance
prism instances:update INSTANCE_ID \
  --config-var="API Endpoint=https://test-api.com"

# Test webhook flow
curl -X POST https://hooks.prismatic.io/trigger/WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Check execution results
prism executions:list --instance=INSTANCE_ID

# Clean up
prism instances:delete INSTANCE_ID
```

---

## Best Practices

- ✅ Test locally with prism CLI
- ✅ Add comprehensive logging
- ✅ Write unit tests for complex logic
- ✅ Create test instances for integration testing
- ✅ Test error scenarios
- ✅ Use logger liberally during development
- ✅ Check execution logs first
- ✅ Verify config vars are set correctly
- ✅ Test OAuth connections independently
- ✅ Add console.log in data sources (shows in build)

---

## Additional Resources

- **Testing Guide**: https://prismatic.io/docs/spectral/testing/
- **Debugging Guide**: https://prismatic.io/docs/spectral/debugging/
- **prism CLI Reference**: https://prismatic.io/docs/prism/
