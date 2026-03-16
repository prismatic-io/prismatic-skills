# Common API Patterns

## Parameterized Variables

Always use parameterized variables instead of string concatenation:

```graphql
# CORRECT
mutation updateCustomerName($customerId: ID!, $customerName: String) {
  updateCustomer(input: { id: $customerId, name: $customerName }) {
    customer { id name }
    errors { field messages }
  }
}

# WRONG - Never concatenate strings into queries
# mutation { updateCustomer(input: { id: "${customerId}" ... }) }
```

## Aliased Batch Operations

Execute multiple mutations in a single request using aliases:

```graphql
mutation {
  c1: createCustomer(input: { name: "Customer One" }) {
    customer { id }
    errors { field messages }
  }
  c2: createCustomer(input: { name: "Customer Two" }) {
    customer { id }
    errors { field messages }
  }
}
```

## Nested Queries

Avoid N+1 queries by fetching related data in a single request:

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
          integration { id name versionNumber }
          enabled
          deployedVersion
          lastDeployedAt
        }
      }
    }
  }
}
```

## Error Handling

### GraphQL Errors

All authenticated requests return HTTP 200. Check the response body for errors:

```json
{
  "data": null,
  "errors": [
    {
      "message": "Something went wrong",
      "locations": [{"line": 1, "column": 1}],
      "path": ["mutation"]
    }
  ]
}
```

### Mutation Errors

Mutations return field-level errors in the response:

```json
{
  "data": {
    "createCustomer": {
      "customer": null,
      "errors": [
        {
          "field": "name",
          "messages": ["This field is required."]
        }
      ]
    }
  }
}
```

**Always check both** `errors` at the top level and `errors` within mutation responses.

## Enum Values

**CRITICAL**: Despite GraphQL introspection showing uppercase enum values, the Prismatic API requires **lowercase strings**:

| Parameter | Correct | Wrong |
|-----------|---------|-------|
| `variableScope` | `"customer"` | `"CUSTOMER"` |
| `managedBy` | `"org"` | `"ORG"` |

## Using Prism CLI for GraphQL

```bash
# Execute raw GraphQL query
prism graphql:query 'query { authenticatedUser { id email name } }'

# With variables
prism graphql:query 'mutation createCustomer($name: String!) {
  createCustomer(input: { name: $name }) {
    customer { id name }
    errors { field messages }
  }
}' --variables '{"name": "Acme Corp"}'
```

## ID Format

All Prismatic IDs are **base64-encoded strings** (e.g., `Q29tcG9uZW50OjEyMzQ=`). Decoding reveals the type and numeric ID (e.g., `Component:1234`).

## Rate Limiting

- Rate limits return HTTP 429
- Retry with exponential backoff (recommended: 1-10s delays, 5 max attempts)
- The `shared/graphql.ts` wrapper (via `prism-retry.ts`) handles this automatically

## Common Workflows

### Deploy Integration End-to-End

1. Import/update integration
2. Publish integration version
3. Create instance for customer
4. Configure instance config variables
5. Deploy instance
6. Test flow execution

### Create Organization Connection

1. Query component connections (get connection ID + required inputs)
2. Check if scoped config variable exists (by stableKey)
3. Create scoped config variable (template)
4. Create customer config variable (with actual credentials)
5. Reference in CNI config via stableKey

### Verify Deployment

```graphql
query verifyDeployment($instanceId: ID!) {
  instance(id: $instanceId) {
    id
    name
    enabled
    deployedVersion
    needsDeploy
    configState
    inFailedState
    lastDeployedAt
    flowConfigs {
      nodes {
        flow { name }
        webhookUrl
      }
    }
  }
}
```
