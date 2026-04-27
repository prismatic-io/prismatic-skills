# Components

## Query: List Components

```graphql
query listComponents($after: String) {
  components(after: $after, first: 100) {
    nodes {
      id
      key
      label
      description
      category
      public
      versionNumber
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

## Query: Get Component by Key

```graphql
query getComponent($key: String!) {
  components(key: $key) {
    nodes {
      id
      key
      label
      description
      category
      public
      versionNumber
      connections {
        nodes {
          id
          key
          label
          inputs {
            nodes {
              id
              key
              label
              type
              default
              required
              comments
            }
          }
        }
      }
      actions {
        nodes {
          id
          key
          label
          description
        }
      }
    }
  }
}
```

## Query: Search Components

Used by both CNI builder and low-code builder for component discovery.

```graphql
query searchComponents($filterQuery: JSONString, $after: String) {
  components(filterQuery: $filterQuery, after: $after) {
    nodes {
      id
      key
      label
      description
      public
      category
      versionNumber
      connections {
        nodes {
          key
          label
          inputs {
            nodes {
              key
              label
              required
              default
              type
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

**Variables** (search by keyword):
```json
{
  "filterQuery": "{\"key_Icontains\": \"slack\"}"
}
```

## Query: Search Component Actions

```graphql
query searchActions($searchTerms: String!) {
  componentActionSearchResults(searchTerms: $searchTerms) {
    nodes {
      component { key label }
      action { key label description }
    }
  }
}
```

## Query: Get Action Input Schema

Critical for YAML generation - always query the schema before generating action inputs.

```graphql
query getActionInputs($componentKey: String!, $actionKey: String!) {
  components(key: $componentKey, allVersions: false) {
    nodes {
      key
      label
      actions(key: $actionKey) {
        nodes {
          key
          label
          description
          inputs {
            nodes {
              key
              label
              type
              required
              default
              comments
              collection
            }
          }
        }
      }
    }
  }
}
```

**Important**: Never guess input names. Always query the schema first. Common mistakes:
- Using `invoiceId` when schema uses `id`
- Using `query` when schema uses `queryString`
- Adding inputs that don't exist in the component schema

## Query: List Component Actions (via CLI)

```bash
prism components:actions:list {component-key}
```

## Mutation: Delete Component

```graphql
mutation deleteComponent($id: ID!) {
  deleteComponent(input: { id: $id }) {
    component { id }
    errors { field messages }
  }
}
```

## Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | ID | Base64-encoded unique identifier |
| `key` | String | Unique component key (e.g., `slack`, `acme`) |
| `label` | String | Display name |
| `description` | String | Component description |
| `category` | String | Category grouping |
| `public` | Boolean | Whether component is public |
| `versionNumber` | Int | Current version number |
| `signature` | String | SHA1 hash for version verification |
| `connections` | Connection | Available connection types |
| `actions` | Connection | Available actions |
| `forCodeNativeIntegration` | Boolean | Whether designed for CNI usage |
| `iconUrl` | String | Component icon URL |

## Connection Input Fields

| Field | Type | Description |
|-------|------|-------------|
| `key` | String | Input identifier |
| `label` | String | Display label |
| `type` | String | Input type (string, password, etc.) |
| `default` | String | Default value |
| `required` | Boolean | Whether input is required |
| `comments` | String | Help text / description |
