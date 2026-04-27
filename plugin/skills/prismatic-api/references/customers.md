# Customers

## Query: List Customers

```graphql
query listCustomers($after: String) {
  customers(after: $after, first: 100) {
    nodes {
      id
      name
      description
      externalId
      labels
      createdAt
      updatedAt
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

## Query: Get Customer by ID

```graphql
query getCustomer($id: ID!) {
  customer(id: $id) {
    id
    name
    description
    externalId
    labels
    instances {
      nodes {
        id
        name
        integration { id name }
        enabled
        deployedVersion
      }
    }
    users {
      nodes {
        id
        email
        name
      }
    }
    createdAt
    updatedAt
  }
}
```

## Mutation: Create Customer

```graphql
mutation createCustomer($name: String!, $description: String, $externalId: String) {
  createCustomer(input: {
    name: $name
    description: $description
    externalId: $externalId
  }) {
    customer {
      id
      name
      externalId
    }
    errors {
      field
      messages
    }
  }
}
```

**Variables**:
```json
{
  "name": "Acme Corp",
  "description": "Demo customer for Acme",
  "externalId": "acme-001"
}
```

## Mutation: Update Customer

```graphql
mutation updateCustomer($id: ID!, $name: String, $description: String, $externalId: String) {
  updateCustomer(input: {
    id: $id
    name: $name
    description: $description
    externalId: $externalId
  }) {
    customer {
      id
      name
      description
      externalId
    }
    errors {
      field
      messages
    }
  }
}
```

## Mutation: Delete Customer

```graphql
mutation deleteCustomer($id: ID!) {
  deleteCustomer(input: { id: $id }) {
    customer { id }
    errors { field messages }
  }
}
```

## Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | ID | Base64-encoded unique identifier |
| `name` | String | Customer display name |
| `description` | String | Optional description |
| `externalId` | String | External system identifier (for mapping to your system) |
| `labels` | [String] | Tags for organization |
| `instances` | Connection | Deployed integration instances |
| `users` | Connection | Customer users |
| `allowEmbeddedDesigner` | Boolean | Whether embedded designer is enabled |
| `concurrentExecutionLimit` | Int | Max concurrent executions |

## Query: List Customer Labels

```graphql
query {
  customerLabels
}
```

Returns a flat array of unique label strings used across all customers.

## Nested Queries

Retrieve customers with their instances and integration details:

```graphql
query {
  customers {
    nodes {
      id
      name
      instances {
        nodes {
          id
          name
          enabled
          integration {
            id
            name
            versionNumber
          }
          deployedVersion
          lastDeployedAt
        }
      }
    }
  }
}
```
