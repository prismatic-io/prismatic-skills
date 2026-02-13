# Connections

Connections in Prismatic are managed via **Scoped Config Variables** (templates) and **Customer Config Variables** (instances).

## Architecture

```text
Scoped Config Variable (template)
├── variableScope: "customer"     # Per-customer instances
├── managedBy: "org"              # Org manages credentials
├── connection: {component connection ID}
└── Customer Config Variables (instances)
    ├── Test instance (isTest: true)
    └── Customer instances (customer: {customerID})
```

## Query: Get Component Connections

Find available connection types for a component.

```graphql
query listComponentConnections($key: String!) {
  components(key: $key) {
    nodes {
      id
      key
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
    }
  }
}
```

## Query: List Scoped Config Variables

List existing organization connections (integration-agnostic).

```graphql
query availableConnections($managedBy: String) {
  scopedConfigVariables(managedBy: $managedBy) {
    nodes {
      id
      key
      stableKey
      description
      variableScope
      managedBy
      status
      customer {
        externalId
        name
      }
      connection {
        id
        key
        label
        component {
          key
          label
        }
      }
      customerConfigVariables {
        nodes {
          id
          isTest
          status
        }
      }
    }
  }
}
```

## Query: Check Existing Connection by Stable Key

Before creating, check if one already exists.

```graphql
query checkConnection($stableKey: String) {
  scopedConfigVariables(stableKey: $stableKey) {
    nodes {
      id
      key
      stableKey
      status
      customerConfigVariables {
        nodes {
          id
          isTest
          status
        }
      }
    }
  }
}
```

## Mutation: Create Scoped Config Variable

Creates the connection template (no actual credential values).

```graphql
mutation createScopedConfigVariable(
  $key: String!
  $description: String!
  $stableKey: String!
  $variableScope: String!
  $managedBy: String!
  $connection: ID!
  $inputs: [InputExpression]
) {
  createScopedConfigVariable(input: {
    key: $key
    description: $description
    stableKey: $stableKey
    variableScope: $variableScope
    managedBy: $managedBy
    connection: $connection
    inputs: $inputs
  }) {
    scopedConfigVariable {
      id
      key
      stableKey
      variableScope
      managedBy
      status
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
  "connection": "Q29ubmVjdGlvbjoxMjM0NQ==",
  "key": "Acme API Connection",
  "stableKey": "acme-api-key",
  "description": "Organization connection for Acme API",
  "variableScope": "customer",
  "managedBy": "org",
  "inputs": [
    {
      "name": "apiKey",
      "type": "value",
      "value": "",
      "meta": "{\"managedBy\":\"org\",\"inputScope\":\"customer\"}"
    }
  ]
}
```

**CRITICAL**: Enum values must be **lowercase strings**:

- `variableScope`: `"customer"` (NOT `"CUSTOMER"`)
- `managedBy`: `"org"` (NOT `"ORG"`)

## Mutation: Create Customer Config Variable

Creates an instance of the connection with actual credential values.

```graphql
mutation createCustomerConfigVariable(
  $scopedConfigVariable: ID!
  $customer: ID
  $isTest: Boolean
  $inputs: [InputExpression]
) {
  createCustomerConfigVariable(input: {
    scopedConfigVariable: $scopedConfigVariable
    customer: $customer
    isTest: $isTest
    inputs: $inputs
  }) {
    customerConfigVariable {
      id
      isTest
      status
      customer { id name }
    }
    errors {
      field
      messages
    }
  }
}
```

**Variables** (test connection):

```json
{
  "scopedConfigVariable": "U2NvcGVkQ29uZmlnVmFyaWFibGU6MTIzNDU=",
  "customer": null,
  "isTest": true,
  "inputs": [
    {
      "name": "apiKey",
      "type": "value",
      "value": "sk_test_123456"
    },
    {
      "name": "appBaseUrl",
      "type": "value",
      "value": "https://your-domain.ngrok-free.app"
    }
  ]
}
```

**Important**:

- `customer: null` for test connections not tied to a specific customer
- `isTest: true` for development/demo connections
- `inputs: []` to inherit all values from the scoped config variable template

## InputExpression Type

```graphql
input InputExpression {
  name: String!      # Input key from component connection
  type: String!      # Always "value" for direct values
  value: String!     # The actual credential/config value
  meta: String       # JSON string with management scope info
}
```

**Meta format**: `"{\"managedBy\":\"org\",\"inputScope\":\"customer\"}"`

## Mutation: Delete Scoped Config Variable

```graphql
mutation deleteScopedConfigVariable($id: ID!) {
  deleteScopedConfigVariable(input: { id: $id }) {
    scopedConfigVariable { id }
    errors { field messages }
  }
}
```

## Mutation: Delete Customer Config Variable

```graphql
mutation deleteCustomerConfigVariable($id: ID!) {
  deleteCustomerConfigVariable(input: { id: $id }) {
    customerConfigVariable { id }
    errors { field messages }
  }
}
```

## Connection Naming Convention

- **stableKey**: `{component}-{connectiontype}` (e.g., `acme-api-key`, `slack-oauth2`)
- **key**: Human-readable display name (e.g., `Acme API Connection`)

## Connection Workflow

1. Query component connections to get connection ID and required inputs
2. Check if scoped config variable already exists (by stableKey)
3. Create scoped config variable (template) if not exists
4. Create customer config variable (instance) with actual values
5. Reference in CNI via `organizationActivatedConnection` using stableKey
