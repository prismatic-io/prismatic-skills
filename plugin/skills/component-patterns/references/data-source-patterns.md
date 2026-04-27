# Data Source Patterns

Data source patterns for custom components. Data sources provide dynamic picklist
values for dropdown inputs in the integration config UI.

---

## Picklist Data Source

```typescript
import { dataSource, type Element } from "@prismatic-io/spectral";
import { createClient } from "./client";
import { connectionInput } from "./inputs";

const selectItem = dataSource({
  display: { label: "Select Item", description: "Choose an item" },
  dataSourceType: "picklist",
  inputs: { connection: connectionInput },
  perform: async (context, { connection }) => {
    const client = createClient(connection, false);
    const items = await client.items.list();
    return {
      result: items
        .map((item): Element => ({ label: item.name, key: item.id }))
        .sort((a, b) => ((a.label ?? "") < (b.label ?? "") ? -1 : 1)),
    };
  },
});

export default { selectItem };
```

Element shape: `{ label: string, key: string }` (import `type Element` from spectral). Always sort alphabetically by label using `.sort((a, b) => ((a.label ?? "") < (b.label ?? "") ? -1 : 1))`.

DataSource labels must start with an action verb (e.g., "Select Bucket", not "Buckets").

`dataSourceType: "picklist"` is required for all picklist data sources.

---

## Static Data Source

When options are fixed (not fetched from an API), no connection input is needed:

```typescript
const selectPriority = dataSource({
  display: { label: "Priority", description: "Select a priority level" },
  dataSourceType: "picklist",
  inputs: {},
  perform: async () => {
    return {
      result: [
        { label: "Low", key: "low" },
        { label: "Medium", key: "medium" },
        { label: "High", key: "high" },
        { label: "Critical", key: "critical" },
      ],
    };
  },
});
```

---

## Cascading Data Source

Depends on a previous data source selection. Add an input for the parent value:

```typescript
const selectSubCategory = dataSource({
  display: { label: "Sub-Category", description: "Select a sub-category" },
  dataSourceType: "picklist",
  inputs: {
    connection: connectionInput,
    category: input({ label: "Category", type: "string", required: true, clean: util.types.toString }),
  },
  perform: async (context, { connection, category }) => {
    const client = createClient(connection, false);
    const subCategories = await client.categories.listChildren(category);
    return {
      result: subCategories
        .map((sc): Element => ({ label: sc.name, key: sc.id }))
        .sort((a, b) => ((a.label ?? "") < (b.label ?? "") ? -1 : 1)),
    };
  },
});
```

---

## Data Source Types

| Type | Return shape | Use |
|------|-------------|-----|
| `"picklist"` | `{ result: { label: string, key: string }[] }` | Single-select dropdown |
| `"jsonForm"` | `{ result: { schema: object, uiSchema?: object } }` | JSON Forms schema |
| `"objectSelection"` | `{ result: { objects: object[], metadata: object } }` | Object picker |
| `"objectFieldMap"` | `{ result: { fields: object[] } }` | Field mapping |

Most components use `"picklist"`. Use others only when the integration requires
structured config input (field mapping, nested forms).
