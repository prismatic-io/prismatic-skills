# JSON Forms Schema & UI Reference

Comprehensive reference for JSON Schema and UI Schema options in Prismatic JSON Forms.

**See also:** [json-forms.md](json-forms.md) for practical examples and patterns.

---

## JSON Schema Reference

### Schema Structure

Root schema must be an object:

```typescript
schema: {
  type: "object",           // Required: root must be "object"
  title: "Form Title",      // Optional: displayed at top
  description: "Help text", // Optional: form description
  properties: {             // Required: field definitions
    fieldName: { /* field definition */ },
  },
  required: ["fieldName"],  // Optional: list required fields
}
```

---

## Field Types

### String Fields

Basic text input:

```typescript
{
  type: "string",
  title: "Field Label",
  description: "Help text shown below field",
  minLength: 1,
  maxLength: 100,
  pattern: "^[A-Za-z0-9]+$",  // Regex validation
  default: "default value",
}
```

**With format:**

```typescript
{
  type: "string",
  format: "email",  // or "uri", "hostname", "ipv4", "ipv6"
  title: "Email Address",
}
```

### Number & Integer Fields

```typescript
{
  type: "number",  // or "integer" for whole numbers only
  title: "Timeout",
  description: "In seconds",
  minimum: 1,
  maximum: 300,
  default: 30,
  multipleOf: 5,  // Must be multiple of 5
}
```

### Boolean Fields

Checkbox:

```typescript
{
  type: "boolean",
  title: "Enable Feature",
  description: "Turn on/off",
  default: true,
}
```

### Enum Fields (Dropdown)

Fixed list of options:

```typescript
{
  type: "string",
  title: "Environment",
  enum: ["development", "staging", "production"],
  default: "development",
}
```

**With labels (using oneOf):**

```typescript
{
  type: "string",
  title: "Log Level",
  oneOf: [
    { const: "debug", title: "Debug" },
    { const: "info", title: "Information" },
    { const: "warn", title: "Warning" },
    { const: "error", title: "Error" },
  ],
  default: "info",
}
```

### Date & Time Fields

```typescript
// Date only
{
  type: "string",
  format: "date",  // YYYY-MM-DD
  title: "Start Date",
}

// Time only
{
  type: "string",
  format: "time",  // HH:mm:ss
  title: "Start Time",
}

// Date and time
{
  type: "string",
  format: "date-time",  // ISO 8601
  title: "Timestamp",
}
```

### Array Fields

Simple array:

```typescript
{
  type: "array",
  title: "Tags",
  items: {
    type: "string",
  },
  minItems: 1,
  maxItems: 10,
  uniqueItems: true,  // No duplicates
  default: [],
}
```

Array of objects (repeating fields):

```typescript
{
  type: "array",
  title: "Contacts",
  items: {
    type: "object",
    properties: {
      name: { type: "string", title: "Name" },
      email: { type: "string", format: "email", title: "Email" },
      role: {
        type: "string",
        enum: ["admin", "user", "viewer"],
        title: "Role",
      },
    },
    required: ["name", "email"],
  },
  default: [],
}
```

### Nested Objects

```typescript
{
  type: "object",
  title: "Address",
  properties: {
    street: { type: "string", title: "Street" },
    city: { type: "string", title: "City" },
    zip: { type: "string", title: "ZIP Code", pattern: "^\\d{5}$" },
    country: {
      type: "string",
      enum: ["US", "CA", "UK"],
      title: "Country",
    },
  },
  required: ["street", "city", "country"],
}
```

---

## Validation Rules

### String Validation

```typescript
{
  type: "string",
  minLength: 5,
  maxLength: 50,
  pattern: "^[a-z0-9-]+$",  // Lowercase, numbers, hyphens only
}
```

**Common patterns:**

```typescript
// Email
pattern: "^[^@]+@[^@]+\\.[^@]+$";

// URL
pattern: "^https?://.*";

// Phone (US)
pattern: "^\\d{3}-\\d{3}-\\d{4}$";

// Alphanumeric
pattern: "^[A-Za-z0-9]+$";

// Slug
pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$";
```

### Number Validation

```typescript
{
  type: "number",
  minimum: 0,
  maximum: 100,
  exclusiveMinimum: 0,      // > 0 (not >= 0)
  exclusiveMaximum: 100,    // < 100 (not <= 100)
  multipleOf: 0.5,          // Must be 0, 0.5, 1.0, 1.5, etc.
}
```

### Array Validation

```typescript
{
  type: "array",
  minItems: 1,              // At least 1 item
  maxItems: 10,             // At most 10 items
  uniqueItems: true,        // No duplicates
}
```

---

## UI Schema Reference

### Layout Types

#### Vertical Layout

Fields stack vertically (most common):

```typescript
uiSchema: {
  type: "VerticalLayout",
  elements: [
    { type: "Control", scope: "#/properties/field1" },
    { type: "Control", scope: "#/properties/field2" },
    { type: "Control", scope: "#/properties/field3" },
  ],
}
```

#### Horizontal Layout

Fields appear side-by-side:

```typescript
uiSchema: {
  type: "HorizontalLayout",
  elements: [
    { type: "Control", scope: "#/properties/firstName" },
    { type: "Control", scope: "#/properties/lastName" },
  ],
}
```

#### Group Layout

Group related fields with border and label:

```typescript
uiSchema: {
  type: "Group",
  label: "Authentication Settings",
  elements: [
    { type: "Control", scope: "#/properties/username" },
    { type: "Control", scope: "#/properties/password" },
  ],
}
```

#### Categorization (Tabs)

Create tabbed interface:

```typescript
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
}
```

### Nested Layouts

Combine layouts for complex forms:

```typescript
uiSchema: {
  type: "VerticalLayout",
  elements: [
    { type: "Control", scope: "#/properties/title" },
    {
      type: "HorizontalLayout",  // Nested horizontal layout
      elements: [
        { type: "Control", scope: "#/properties/startDate" },
        { type: "Control", scope: "#/properties/endDate" },
      ],
    },
    {
      type: "Group",
      label: "Contact Info",
      elements: [
        { type: "Control", scope: "#/properties/email" },
        { type: "Control", scope: "#/properties/phone" },
      ],
    },
  ],
}
```

---

## Array UI Options

### Accordion Layout

Arrays of objects displayed as accordion:

```typescript
uiSchema: {
  type: "Control",
  scope: "#/properties/contacts",
  options: {
    layout: "Accordion",
    elementLabelProp: "name",  // Use "name" property as label
  },
}
```

### Table Layout

Arrays displayed as table (limited support):

```typescript
uiSchema: {
  type: "Control",
  scope: "#/properties/items",
  options: {
    layout: "Table",
  },
}
```

---

## Conditional Display

### Basic Rule

Show field based on another field's value:

```typescript
{
  type: "Control",
  scope: "#/properties/apiKey",
  rule: {
    effect: "SHOW",  // or "HIDE", "ENABLE", "DISABLE"
    condition: {
      scope: "#/properties/authType",
      schema: { const: "apiKey" },
    },
  },
}
```

### Multiple Conditions (AND)

```typescript
rule: {
  effect: "SHOW",
  condition: {
    type: "AND",
    conditions: [
      {
        scope: "#/properties/enabled",
        schema: { const: true },
      },
      {
        scope: "#/properties/environment",
        schema: { const: "production" },
      },
    ],
  },
}
```

### Multiple Conditions (OR)

```typescript
rule: {
  effect: "SHOW",
  condition: {
    type: "OR",
    conditions: [
      {
        scope: "#/properties/authType",
        schema: { const: "oauth" },
      },
      {
        scope: "#/properties/authType",
        schema: { const: "jwt" },
      },
    ],
  },
}
```

### Enum Condition

Show when value is in list:

```typescript
rule: {
  effect: "SHOW",
  condition: {
    scope: "#/properties/region",
    schema: { enum: ["us-east-1", "us-west-2"] },  // Show for US regions
  },
}
```

---

## Advanced Schema Patterns

### Dependent Fields

Field appears based on another field:

```typescript
schema: {
  type: "object",
  properties: {
    hasAccount: { type: "boolean", title: "Have an account?" },
    accountId: { type: "string", title: "Account ID" },
  },
  dependencies: {
    accountId: ["hasAccount"],  // accountId depends on hasAccount
  },
}
```

### Conditional Schema

Different schema based on value (advanced):

```typescript
schema: {
  type: "object",
  properties: {
    accountType: {
      type: "string",
      enum: ["personal", "business"],
    },
  },
  allOf: [
    {
      if: {
        properties: { accountType: { const: "business" } },
      },
      then: {
        properties: {
          companyName: { type: "string", title: "Company Name" },
          taxId: { type: "string", title: "Tax ID" },
        },
        required: ["companyName", "taxId"],
      },
    },
  ],
}
```

### Read-Only Fields

Display value but don't allow editing:

```typescript
{
  type: "string",
  title: "Account ID",
  readOnly: true,
  default: "auto-generated-id",
}
```

### Hidden Fields

Store value but don't display:

```typescript
uiSchema: {
  type: "Control",
  scope: "#/properties/internalId",
  options: {
    hidden: true,
  },
}
```

---

## Field Options

### Placeholder Text

```typescript
uiSchema: {
  type: "Control",
  scope: "#/properties/email",
  options: {
    placeholder: "user@example.com",
  },
}
```

### Multi-line Text

```typescript
uiSchema: {
  type: "Control",
  scope: "#/properties/description",
  options: {
    multi: true,
    rows: 5,
  },
}
```

### Autocomplete

Enable browser autocomplete:

```typescript
uiSchema: {
  type: "Control",
  scope: "#/properties/email",
  options: {
    autocomplete: true,
  },
}
```

### Trim Whitespace

```typescript
uiSchema: {
  type: "Control",
  scope: "#/properties/username",
  options: {
    trim: true,
  },
}
```

---

## Complete Examples

### User Profile Form

```typescript
{
  result: {
    schema: {
      type: "object",
      properties: {
        firstName: { type: "string", title: "First Name", minLength: 1 },
        lastName: { type: "string", title: "Last Name", minLength: 1 },
        email: { type: "string", format: "email", title: "Email" },
        phone: { type: "string", title: "Phone", pattern: "^\\d{3}-\\d{3}-\\d{4}$" },
        age: { type: "integer", title: "Age", minimum: 18, maximum: 120 },
        newsletter: { type: "boolean", title: "Subscribe to newsletter" },
      },
      required: ["firstName", "lastName", "email"],
    },
    uiSchema: {
      type: "VerticalLayout",
      elements: [
        {
          type: "HorizontalLayout",
          elements: [
            { type: "Control", scope: "#/properties/firstName" },
            { type: "Control", scope: "#/properties/lastName" },
          ],
        },
        { type: "Control", scope: "#/properties/email" },
        { type: "Control", scope: "#/properties/phone" },
        { type: "Control", scope: "#/properties/age" },
        { type: "Control", scope: "#/properties/newsletter" },
      ],
    },
    data: {
      newsletter: false,
    },
  },
}
```

### API Configuration Form

```typescript
{
  result: {
    schema: {
      type: "object",
      properties: {
        authType: {
          type: "string",
          enum: ["apiKey", "oauth", "basic"],
          title: "Authentication Type",
        },
        apiKey: {
          type: "string",
          title: "API Key",
          minLength: 10,
        },
        oauthClientId: {
          type: "string",
          title: "OAuth Client ID",
        },
        oauthClientSecret: {
          type: "string",
          title: "OAuth Client Secret",
        },
        username: {
          type: "string",
          title: "Username",
        },
        password: {
          type: "string",
          title: "Password",
        },
      },
      required: ["authType"],
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
          type: "Group",
          label: "OAuth Settings",
          elements: [
            { type: "Control", scope: "#/properties/oauthClientId" },
            { type: "Control", scope: "#/properties/oauthClientSecret" },
          ],
          rule: {
            effect: "SHOW",
            condition: {
              scope: "#/properties/authType",
              schema: { const: "oauth" },
            },
          },
        },
        {
          type: "Group",
          label: "Basic Auth",
          elements: [
            { type: "Control", scope: "#/properties/username" },
            { type: "Control", scope: "#/properties/password" },
          ],
          rule: {
            effect: "SHOW",
            condition: {
              scope: "#/properties/authType",
              schema: { const: "basic" },
            },
          },
        },
      ],
    },
    data: {
      authType: "apiKey",
    },
  },
}
```

### Contact List with Arrays

```typescript
{
  result: {
    schema: {
      type: "object",
      properties: {
        contacts: {
          type: "array",
          title: "Notification Contacts",
          items: {
            type: "object",
            properties: {
              name: { type: "string", title: "Name" },
              email: { type: "string", format: "email", title: "Email" },
              role: {
                type: "string",
                enum: ["admin", "user", "viewer"],
                title: "Role",
              },
              enabled: { type: "boolean", title: "Enabled" },
            },
            required: ["name", "email", "role"],
          },
          minItems: 1,
        },
      },
    },
    uiSchema: {
      type: "VerticalLayout",
      elements: [
        {
          type: "Control",
          scope: "#/properties/contacts",
          options: {
            layout: "Accordion",
            elementLabelProp: "name",
          },
        },
      ],
    },
    data: {
      contacts: [
        {
          name: "",
          email: "",
          role: "user",
          enabled: true,
        },
      ],
    },
  },
}
```

---

## Best Practices

### Schema Design

- Use descriptive titles and descriptions
- Apply appropriate validation rules
- Set sensible defaults
- Mark required fields explicitly
- Use enums for fixed option lists
- Validate format for emails, URLs, etc.

### UI Schema Design

- Group related fields together
- Use horizontal layouts for name fields (first/last)
- Use tabs for complex forms with many fields
- Apply conditional display to reduce clutter
- Use accordion layout for arrays of objects
- Provide helpful placeholder text

### Validation

- Validate early (client-side via schema)
- Provide clear error messages in descriptions
- Use pattern validation for structured data
- Set reasonable min/max constraints
- Require only essential fields

---

## Additional Resources

- **Practical Guide**: [json-forms.md](json-forms.md)
- **Official Docs**: <https://prismatic.io/docs/integrations/data-sources/json-forms/>
- **JSON Schema Spec**: <https://json-schema.org/>
- **JSON Forms Project**: <https://jsonforms.io/>
