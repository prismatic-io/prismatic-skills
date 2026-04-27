# Error Handling Patterns for CNI

Production-ready error handling strategies for Prismatic Code Native Integrations.

---

## Fatal vs Non-Fatal Errors

```typescript
onExecution: async (context) => {
  const { logger } = context;

  // ⭐ FATAL ERROR - Stop execution ⭐
  try {
    const { data } = await axios.get(apiEndpoint);
  } catch (e) {
    logger.error("Cannot proceed without data");
    throw new Error(`Fatal: Failed to fetch data - ${e.message}`);
  }

  // ⭐ NON-FATAL ERROR - Continue processing ⭐
  for (const item of data) {
    try {
      await processItem(item);
    } catch (e) {
      // Log error but continue with next item
      logger.warn(`Failed to process item ${item.id}: ${e.message}`);
      // Don't throw - continue loop
    }
  }
};
```

**RULE**: Throw if you can't complete the flow's primary purpose. Log and continue if one item fails but others can succeed.

## User-Friendly Error Messages

```typescript
// ❌ BAD: Technical error exposed to user
throw error;

// ✅ GOOD: Clear, actionable message
throw new Error(
  `Failed to sync contacts: ${error.message}. ` +
    `Please check your API credentials and try again.`,
);

// ✅ BETTER: Specific guidance
if (error.response?.status === 401) {
  throw new Error(
    "Authentication failed. Please reconnect your Salesforce account " +
      "in the integration configuration.",
  );
}
```

## Retry Logic

```typescript
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (e) {
      if (attempt === maxRetries) throw e;

      // Exponential backoff
      const delay = delayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Max retries exceeded");
}

// Usage:
const data = await retryOperation(() => axios.get(url), 3);
```

## Partial Failure Handling

```typescript
const results = {
  successful: [],
  failed: [],
};

for (const record of records) {
  try {
    const result = await createRecord(record);
    results.successful.push({ record, result });
    logger.info(`Created record ${record.id}`);
  } catch (e) {
    results.failed.push({ record, error: e.message });
    logger.error(`Failed to create record ${record.id}: ${e.message}`);
  }
}

// ⭐ RETURN SUMMARY ⭐
return {
  data: {
    total: records.length,
    successful: results.successful.length,
    failed: results.failed.length,
    failures: results.failed,
  },
};
```

---

## Common Troubleshooting Checklist

### Integration Won't Import

- [ ] Run `npm run build` successfully?
- [ ] No TypeScript errors?
- [ ] All dependencies installed?
- [ ] Logged in to prism CLI? (`prism login`)

### OAuth Connection Fails

- [ ] Client ID/Secret correct?
- [ ] Redirect URI matches Prismatic's?
- [ ] Scopes include `refresh_token`?
- [ ] Re-authorize after scope changes?

### Webhook Not Triggering

- [ ] Instance deployed?
- [ ] Webhook URL correct?
- [ ] External service configured to send webhooks?
- [ ] Signature verification passing?

### Data Source Dropdown Empty

- [ ] OAuth connection configured first?
- [ ] API returning data? (check logs)
- [ ] Elements mapped correctly?
- [ ] No errors in perform() function?

### Flow Execution Fails

- [ ] Check execution logs for error details
- [ ] Verify all config vars are set
- [ ] Test API calls independently
- [ ] Add more logger.info() statements

---

## Best Practices

- ✅ Use try/catch for all external calls
- ✅ Provide user-friendly error messages
- ✅ Log errors with context
- ✅ Distinguish fatal vs non-fatal errors
- ✅ Implement retries for transient failures

---

## Additional Resources

- **Error Handling**: https://prismatic.io/docs/spectral/error-handling/
- **Debugging**: https://prismatic.io/docs/spectral/debugging/
