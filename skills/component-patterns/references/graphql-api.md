# Prismatic GraphQL API Reference

This file contains GraphQL queries and mutations for managing component connections.

## Connection Types Overview

The recommended pattern is **Scoped Config Variables** with `variableScope: "customer"` and `managedBy: "org"`. This creates:

1. **Scoped Config Variable** (template) - Defines the connection structure, per-customer instances managed by org
2. **Customer Config Variable** (instance) - Contains actual credential values

This allows per-customer connection instances while keeping credentials org-managed (customers don't see/configure them).

## Query: Get Component Connections

Use this query to fetch all connections available for a specific component.

**GraphQL Query:**

```graphql
query getComponentConnections($componentKey: String!) {
  components(key: $componentKey) {
    nodes {
      id
      label
      description
      connections {
        nodes {
          id
          key
          label
          inputs {
            nodes {
              key
              label
              default
              required
              comments
            }
          }
        }
      }
    }
  }
}
```

**Example using prism CLI:**

```bash
prism graphql:query  '{
  components(key: "acme") {
    nodes {
      id
      label
      description
      connections {
        nodes {
          id
          key
          label
          inputs {
            nodes {
              key
              label
              default
              required
              comments
            }
          }
        }
      }
    }
  }
}'
```

**Response Structure:**

```json
{
  "data": {
    "components": {
      "nodes": [
        {
          "id": "Q29tcG9uZW50OjEyMzQ=",
          "label": "Acme",
          "description": "Acme component description",
          "connections": {
            "nodes": [
              {
                "id": "Q29ubmVjdGlvbjoxMjM0NQ==",
                "key": "apiKey",
                "label": "API Key Connection",
                "inputs": {
                  "nodes": [
                    {
                      "key": "apiKey",
                      "label": "API Key",
                      "default": "",
                      "required": true,
                      "comments": "Your Acme API key"
                    }
                  ]
                }
              }
            ]
          }
        }
      ]
    }
  }
}
```

## Mutation: Create Scoped Config Variable (Connection)

Use this mutation to create a new connection configuration for a component.

**GraphQL Mutation:**

```graphql
mutation createScopedConfigVariable(
  $key: String!
  $description: String!
  $stableKey: String!
  $variableScope: String!
  $managedBy: String!
  $connection: ID!
  $inputs: [InputExpression]
  $oAuthRedirectConfig: OAuthRedirectConfigInput
) {
  createScopedConfigVariable(
    input: {
      key: $key
      description: $description
      stableKey: $stableKey
      variableScope: $variableScope
      managedBy: $managedBy
      connection: $connection
      inputs: $inputs
      oAuthRedirectConfig: $oAuthRedirectConfig
    }
  ) {
    scopedConfigVariable {
      id
      key
      stableKey
      variableScope
      managedBy
      description
      status
      connection {
        id
        key
        label
        component {
          id
          key
          label
        }
      }
      inputs {
        nodes {
          name
          value
          type
          meta
        }
      }
    }
    errors {
      field
      messages
    }
  }
}
```

**Example Variables:**

```json
{
  "connection": "Q29ubmVjdGlvbjoxMjM0NQ==",
  "key": "Acme API Connection",
  "stableKey": "acme-api-key",
  "description": "Organization connection for Acme API",
  "variableScope": "customer",
  "managedBy": "org",
  "inputs": [
    {
      "name": "apiKey",
      "value": "sk_test_123456",
      "type": "value",
      "meta": "{\"managedBy\":\"org\",\"inputScope\":\"customer\"}"
    }
  ]
}
```

**Example using prism CLI:**

```bash
prism graphql:query  'mutation createScopedConfigVariable(...) { ... }' \
  --variables '{"connection": "...", "key": "...", ...}'
```

**Important Notes:**

- `connection`: The connection ID (base64 encoded) from the component query
- `stableKey`: Use naming convention `{component}-{connectiontype}` (e.g., "acme-api-key", "prosperix-api-key")
- `variableScope`: Use "customer" for customer-scoped connections
- `managedBy`: Use "org" for organization-managed connections
- `inputs`: Array of input values matching the connection's required inputs
- `meta`: JSON string with management scope information, format: `"{\"managedBy\":\"org\",\"inputScope\":\"customer\"}"`

**IMPORTANT: Enum values must be lowercase strings.**

Despite GraphQL introspection showing uppercase enum values like `ORG`, `CUSTOMER`, the API requires lowercase strings:

- `variableScope`: `"customer"` (not `"CUSTOMER"`)
- `managedBy`: `"org"` (not `"ORG"`)

Example:
```json
{
  "variableScope": "customer",
  "managedBy": "org"
}
```

**Response Structure:**

```json
{
  "data": {
    "createScopedConfigVariable": {
      "scopedConfigVariable": {
        "id": "U2NvcGVkQ29uZmlnVmFyaWFibGU6MTIzNDU=",
        "key": "Acme API Connection",
        "stableKey": "acme-api-key",
        "variableScope": "customer",
        "managedBy": "org",
        "description": "Organization connection for Acme API",
        "status": "ACTIVE",
        "connection": {
          "id": "Q29ubmVjdGlvbjoxMjM0NQ==",
          "key": "apiKey",
          "label": "API Key Connection"
        },
        "inputs": {
          "nodes": [
            {
              "name": "apiKey",
              "value": "sk_test_123456",
              "type": "value",
              "meta": "{\"managedBy\":\"org\",\"inputScope\":\"customer\"}"
            }
          ]
        }
      },
      "errors": []
    }
  }
}
```

## Mutation: Create Customer Config Variable

Use this mutation to create a customer-specific connection instance from a scoped config variable template.

**GraphQL Mutation:**

```graphql
mutation createCustomerConfigVariable(
  $scopedConfigVariable: ID!
  $customer: ID
  $isTest: Boolean
  $inputs: [InputExpression]
) {
  createCustomerConfigVariable(
    input: {
      scopedConfigVariable: $scopedConfigVariable
      customer: $customer
      isTest: $isTest
      inputs: $inputs
    }
  ) {
    customerConfigVariable {
      id
      isTest
      status
      customer {
        id
        name
      }
      inputs {
        nodes {
          name
          value
          type
        }
      }
    }
    errors {
      field
      messages
    }
  }
}
```

**Example Variables:**

```json
{
  "scopedConfigVariable": "U2NvcGVkQ29uZmlnVmFyaWFibGU6ZGZkYjA2ZDYtYjk0YS00Y2E2LWJhYjctOWU3NGViZjVmMTZm",
  "customer": null,
  "isTest": true,
  "inputs": []
}
```

**Example using prism CLI:**

```bash
prism graphql:query 'mutation createCustomerConfigVariable($scopedConfigVariable: ID!, $customer: ID, $isTest: Boolean, $inputs: [InputExpression]) {
  createCustomerConfigVariable(
    input: {
      scopedConfigVariable: $scopedConfigVariable
      customer: $customer
      isTest: $isTest
      inputs: $inputs
    }
  ) {
    customerConfigVariable {
      id
      isTest
      status
    }
    errors {
      field
      messages
    }
  }
}' --variables '{
  "scopedConfigVariable": "U2NvcGVkQ29uZmlnVmFyaWFibGU6ZGZkYjA2ZDYtYjk0YS00Y2E2LWJhYjctOWU3NGViZjVmMTZm",
  "customer": null,
  "isTest": true,
  "inputs": []
}'
```

**Important Notes:**

- `scopedConfigVariable`: The ID of the scoped config variable (from createScopedConfigVariable mutation)
- `customer`: Optional customer ID. Use `null` for test connections not tied to a specific customer
- `isTest`: Set to `true` for test connections, `false` for production
- `inputs`: Array of input overrides. Use empty array `[]` to inherit all values from the scoped config variable

**Response Structure:**

```json
{
  "data": {
    "createCustomerConfigVariable": {
      "customerConfigVariable": {
        "id": "Q3VzdG9tZXJDb25maWdWYXJpYWJsZToxMjM0NQ==",
        "isTest": true,
        "status": "ACTIVE",
        "customer": null
      },
      "errors": []
    }
  }
}
```
