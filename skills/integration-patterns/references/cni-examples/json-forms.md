# JSON Forms for Custom Configuration UIs

## Overview

**JSON Forms** create custom form-based configuration UIs in Prismatic integrations. Unlike regular data sources that provide dropdown options, JSON Forms allow you to build complex, multi-field forms with validation, conditional display, and custom layouts.

**Key Concepts:**

- Use `dataSourceConfigVar` (NOT `configVar`) with `dataSourceType: "jsonForm"`
- Define data structure with JSON Schema
- Control layout with UI Schema
- Provide default values
- Access other config vars via `context.configVars["var name"]`
- Can fetch dynamic schema data from APIs

**Use Cases:** Field mapping, complex multi-field settings, structured data collection, conditional forms

---

## Complete Example: Field Mapper

This example shows a real-world Jira field mapping form:

```typescript
import { dataSourceConfigVar } from "@prismatic-io/spectral";

export const jiraFieldMapperDataSource = dataSourceConfigVar({
  stableKey: "jiraFieldMapper",
  dataSourceType: "jsonForm", // CRITICAL: Use "jsonForm", NOT "dataType"

  perform: async (context) => {
    return {
      result: {
        schema: {
          type: "object",
          title: "Jira to Acme Field Mapping",
          properties: {
            projectid: {
              type: "string",
              title: "Project ID Field",
              description:
                "Jira field path for project ID (e.g., 'fields.project.id')",
            },
            issuekey: {
              type: "string",
              title: "Issue Key Field",
              description: "Jira field path for issue key (e.g., 'key')",
            },
            issuetype: {
              type: "string",
              title: "Issue Type Field",
              description:
                "Jira field path for issue type (e.g., 'fields.issuetype.name')",
            },
            summary: {
              type: "string",
              title: "Summary Field",
              description:
                "Jira field path for summary (e.g., 'fields.summary')",
            },
            status: {
              type: "string",
              title: "Status Field",
              description:
                "Jira field path for status (e.g., 'fields.status.name')",
            },
            assignee: {
              type: "string",
              title: "Assignee Field",
              description:
                "Jira field path for assignee (e.g., 'fields.assignee.displayName')",
            },
          },
          required: [
            "projectid",
            "issuekey",
            "issuetype",
            "summary",
            "status",
            "assignee",
          ],
        },
        uiSchema: {
          type: "VerticalLayout",
          elements: [
            { type: "Control", scope: "#/properties/projectid" },
            { type: "Control", scope: "#/properties/issuekey" },
            { type: "Control", scope: "#/properties/issuetype" },
            { type: "Control", scope: "#/properties/summary" },
            { type: "Control", scope: "#/properties/status" },
            { type: "Control", scope: "#/properties/assignee" },
          ],
        },
        data: {
          projectid: "fields.project.id",
          issuekey: "key",
          issuetype: "fields.issuetype.name",
          summary: "fields.summary",
          status: "fields.status.name",
          assignee: "fields.assignee.displayName",
        },
      },
    };
  },
});
```

### Use in Config Pages

```typescript
import { configPage } from "@prismatic-io/spectral";

export const configPages = {
  "Field Mapping": configPage({
    tagline: "Configure how Jira fields map to your system",
    elements: {
      "Jira Issue Field Mapper": jiraFieldMapperDataSource,
    },
  }),
};
```

### Access Values in Flow

```typescript
export const syncIssuesFlow = flow({
  name: "Sync Jira Issues",
  stableKey: "sync-issues",
  onExecution: async (context) => {
    const { configVars } = context;

    // Access the form data as an object
    const fieldMapper = configVars["Jira Issue Field Mapper"];

    // Use mappings to extract data from API responses
    const jiraIssue = await fetchJiraIssue(context);
    const mappedData = {
      projectId: getNestedValue(jiraIssue, fieldMapper.projectid),
      issueKey: getNestedValue(jiraIssue, fieldMapper.issuekey),
      summary: getNestedValue(jiraIssue, fieldMapper.summary),
      // ...
    };

    return { data: mappedData };
  },
});

// Helper for dot notation paths
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((current, key) => current?.[key], obj);
}
```

---

## Accessing Other Config Vars

The `perform` function receives a `context` object that provides access to other config variables.

```typescript
import { Connection } from "@prismatic-io/spectral";

export const dynamicFieldMapper = dataSourceConfigVar({
  stableKey: "dynamic-mapper",
  dataSourceType: "jsonForm",
  perform: async (context) => {
    // Access other config vars by element key name
    // Note: No type hints due to circular reference issues - use type assertions
    const connection = context.configVars["API Connection"] as Connection;
    const environment = context.configVars["Environment"] as string;

    // Validate dependencies exist
    if (!connection || !connection.token?.access_token) {
      throw new Error("Please configure API Connection first");
    }

    // Use them to fetch dynamic data or customize form
    const client = createClient(connection);
    const fields = await client.get("/fields");

    // Build schema based on fetched data
    return {
      result: {
        schema: buildSchemaFromFields(fields),
        uiSchema: {
          /* ... */
        },
        data: {},
      },
    };
  },
});
```

**Important:**

- No automatic type inference (use `as Connection`, `as string`, etc.)
- Dependencies must be defined in earlier config pages
- Always validate dependencies exist before using them

### Config Page Ordering

```typescript
export const configPages = {
  // Page 1: Dependencies first
  Connection: configPage({
    elements: {
      "API Connection": connectionConfigVar,
      Environment: environmentConfigVar,
    },
  }),

  // Page 2: Forms that depend on Page 1
  "Field Mapping": configPage({
    elements: {
      "Field Mapper": dynamicFieldMapperDataSource,
    },
  }),
};
```

---

## Common Patterns

### Pattern 1: Static Field Mapping

Simple form with predefined fields and default values:

```typescript
export const fieldMapperDataSource = dataSourceConfigVar({
  stableKey: "field-mapper",
  dataSourceType: "jsonForm",
  perform: async (context) => {
    return {
      result: {
        schema: {
          type: "object",
          properties: {
            sourceField: { type: "string", title: "Source Field" },
            targetField: { type: "string", title: "Target Field" },
          },
          required: ["sourceField", "targetField"],
        },
        uiSchema: {
          type: "VerticalLayout",
          elements: [
            { type: "Control", scope: "#/properties/sourceField" },
            { type: "Control", scope: "#/properties/targetField" },
          ],
        },
        data: {
          sourceField: "id",
          targetField: "external_id",
        },
      },
    };
  },
});
```

### Pattern 2: Dynamic Schema from API

Fetch available fields from API and build schema dynamically:

```typescript
export const dynamicFieldMapper = dataSourceConfigVar({
  stableKey: "dynamic-mapper",
  dataSourceType: "jsonForm",
  perform: async (context) => {
    const connection = context.configVars["API Connection"] as Connection;

    if (!connection || !connection.token?.access_token) {
      throw new Error("Please configure API Connection first");
    }

    const client = createClient(connection);
    const availableFields = await client.get("/fields");

    // Build schema dynamically
    const properties: Record<string, any> = {};
    const uiElements: any[] = [];

    availableFields.data.forEach((field: any) => {
      properties[field.key] = {
        type: "string",
        title: field.label,
        description: `Map to: ${field.description}`,
      };
      uiElements.push({
        type: "Control",
        scope: `#/properties/${field.key}`,
      });
    });

    return {
      result: {
        schema: { type: "object", properties },
        uiSchema: { type: "VerticalLayout", elements: uiElements },
        data: {},
      },
    };
  },
});
```

### Pattern 3: Conditional Fields

Show/hide fields based on other field values:

```typescript
export const conditionalForm = dataSourceConfigVar({
  stableKey: "conditional-form",
  dataSourceType: "jsonForm",
  perform: async (context) => {
    return {
      result: {
        schema: {
          type: "object",
          properties: {
            authType: {
              type: "string",
              enum: ["apiKey", "oauth"],
              title: "Authentication Type",
            },
            apiKey: {
              type: "string",
              title: "API Key",
            },
            clientId: {
              type: "string",
              title: "OAuth Client ID",
            },
          },
        },
        uiSchema: {
          type: "VerticalLayout",
          elements: [
            { type: "Control", scope: "#/properties/authType" },
            {
              type: "Control",
              scope: "#/properties/apiKey",
              rule: {
                effect: "SHOW",
                condition: {
                  scope: "#/properties/authType",
                  schema: { const: "apiKey" },
                },
              },
            },
            {
              type: "Control",
              scope: "#/properties/clientId",
              rule: {
                effect: "SHOW",
                condition: {
                  scope: "#/properties/authType",
                  schema: { const: "oauth" },
                },
              },
            },
          ],
        },
        data: { authType: "apiKey" },
      },
    };
  },
});
```

### Pattern 4: Tabbed Multi-Section Form

Organize many fields into tabbed categories:

```typescript
export const complexConfigDataSource = dataSourceConfigVar({
  stableKey: "complex-config",
  dataSourceType: "jsonForm",
  perform: async (context) => {
    return {
      result: {
        schema: {
          type: "object",
          properties: {
            name: { type: "string", title: "Name" },
            enabled: { type: "boolean", title: "Enabled" },
            timeout: { type: "integer", title: "Timeout (ms)" },
            retries: { type: "integer", title: "Max Retries" },
          },
        },
        uiSchema: {
          type: "Categorization",
          elements: [
            {
              type: "Category",
              label: "Basic",
              elements: [
                { type: "Control", scope: "#/properties/name" },
                { type: "Control", scope: "#/properties/enabled" },
              ],
            },
            {
              type: "Category",
              label: "Advanced",
              elements: [
                { type: "Control", scope: "#/properties/timeout" },
                { type: "Control", scope: "#/properties/retries" },
              ],
            },
          ],
        },
        data: { enabled: true, timeout: 30000, retries: 3 },
      },
    };
  },
});
```

---

## Error Handling

### Validate Dependencies

```typescript
perform: async (context) => {
  const connection = context.configVars["API Connection"] as Connection;

  if (!connection || !connection.token?.access_token) {
    throw new Error(
      "Please configure your API connection before setting up this form",
    );
  }

  // Continue with form generation...
};
```

### Handle Schema Building Errors

```typescript
perform: async (context) => {
  try {
    const schema = buildSchema();

    if (!schema.properties || Object.keys(schema.properties).length === 0) {
      throw new Error("Schema must have at least one property");
    }

    return { result: { schema, uiSchema: buildUISchema(), data: {} } };
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to generate form schema: ${err.message}`);
  }
};
```

---

## Testing

### Build and Deploy

```bash
npm run build
prism integrations:import
```

### Test in Prismatic UI

1. Open integration configuration
2. Navigate to page with JSON form
3. Verify form renders correctly
4. Fill in fields and test validation
5. Save configuration

### Verify Data Structure in Flow

```typescript
const formData = configVars["My JSON Form"];
logger.info("Form data received:", formData);
// Should show object with all form fields
```

---

## Common Issues

### Issue: Type errors with configVar

**Cause:** Using `configVar` instead of `dataSourceConfigVar`

**Fix:**

```typescript
// ❌ WRONG
export const myForm = configVar({
  /* ... */
});

// ✅ CORRECT
export const myForm = dataSourceConfigVar({
  stableKey: "my-form",
  dataSourceType: "jsonForm",
  perform: async (context) => {
    /* ... */
  },
});
```

### Issue: Using "as any" to bypass type errors

**Cause:** Wrong function/property names

**Fix:** Use proper types - never bypass with `as any`

### Issue: Form doesn't display

**Cause:** Incorrect return structure

**Fix:**

```typescript
// ❌ WRONG
return { schema, uiSchema, data };

// ✅ CORRECT
return {
  result: { schema, uiSchema, data },
};
```

---

## Key Rules Summary

### Must Do

- ✅ Use `dataSourceConfigVar` (NOT `configVar`)
- ✅ Use `dataSourceType: "jsonForm"` (NOT `dataType`)
- ✅ Return `{ result: { schema, uiSchema, data } }`
- ✅ Root schema must have `type: "object"`
- ✅ All properties need `type` field
- ✅ Use type assertions for `context.configVars` (e.g., `as Connection`)

### Never Do

- ❌ Never use `configVar` for JSON forms
- ❌ Never use `as any` to bypass type checking
- ❌ Never skip schema validation
- ❌ Never forget to validate dependencies

---

## Additional Resources

- **Schema/UI Reference**: See [json-forms-schema-guide.md](json-forms-schema-guide.md) for all available field types, layout options, and validation rules
- **Official Docs**: <https://prismatic.io/docs/integrations/data-sources/json-forms/>
- **JSON Schema Spec**: <https://json-schema.org/>
- **Regular Data Sources**: See [data-sources.md](data-sources.md) for dropdown/picklist patterns
