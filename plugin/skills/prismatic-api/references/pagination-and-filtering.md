# Pagination and Filtering

## Cursor-Based Pagination (Relay Style)

All collection queries return paginated results using Relay cursor-based pagination.

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `first` | Int | Page size (max 100, default 100) |
| `after` | String | Cursor for next page |
| `last` | Int | Get last N results |
| `before` | String | Cursor for previous page |
| `offset` | Int | Skip N results |

### Response Structure

```graphql
query($after: String) {
  resources(after: $after, first: 100) {
    nodes {
      id
      name
    }
    pageInfo {
      hasNextPage
      endCursor
    }
    totalCount
    edges {
      node { id name }
      cursor
    }
  }
}
```

### Iterating All Pages

Pass `endCursor` as the `after` parameter for subsequent pages. Continue until `hasNextPage` is `false`.

```graphql
# Page 1
query { resources(first: 100) { nodes { id } pageInfo { hasNextPage endCursor } } }
# Returns endCursor: "abc123"

# Page 2
query { resources(first: 100, after: "abc123") { nodes { id } pageInfo { hasNextPage endCursor } } }
# Continue until hasNextPage: false
```

**Important**: Use consistent sort order across requests to avoid duplicates or omissions.

### Sorting

```graphql
query {
  instances(
    sortBy: [{field: CREATED_AT, direction: ASC}]
    first: 10
  ) {
    nodes { id name createdAt }
    pageInfo { hasNextPage endCursor }
  }
}
```

## Query Filtering

### Filter Suffixes

Prismatic supports Django-style filter suffixes on query parameters:

| Suffix | Description | Example |
|--------|-------------|---------|
| `_Icontains` | Case-insensitive contains | `name_Icontains: "sales"` |
| (none) | Exact match | `name: "Salesforce"` |
| (none) | Exact match on key/ID | `key: "slack"`, `id: "abc123"` |

### Common Filter Parameters

**Customers**:
```graphql
customers(
  name: String              # exact match
  description: String       # exact match
  externalId: String        # external system ID
  # Timestamp range filters available
)
```

**Integrations**:
```graphql
integrations(
  name: String
  name_Icontains: String    # case-insensitive search
  description: String
  # category, labels, customer filters
)
```

**Instances**:
```graphql
instances(
  customer: ID              # filter by customer
  integration: ID           # filter by integration
  enabled: Boolean          # active/inactive
  # Status, deployment, timestamp filters
)
```

**Components**:
```graphql
components(
  key: String               # exact component key
  allVersions: Boolean      # include all versions (default: latest only)
  # Category, public, customer filters
)
```

### JSONString Filters

Some queries accept `filterQuery` as a JSONString for complex filtering:

```graphql
query searchComponents($filterQuery: JSONString, $after: String) {
  components(filterQuery: $filterQuery, after: $after) {
    nodes { id key label }
    pageInfo { hasNextPage endCursor }
  }
}
```

Variable:
```json
{
  "filterQuery": "{\"key_Icontains\": \"slack\"}"
}
```
