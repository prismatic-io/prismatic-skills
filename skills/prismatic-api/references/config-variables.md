# Config Variables

## Instance Config Variables

Config variables store values needed by integration instances (API keys, URLs, settings).

### Query: Get Instance Config Variables

```graphql
query getInstanceConfig($id: ID!) {
  instance(id: $id) {
    id
    name
    configState
    needsDeploy
    configVariables {
      nodes {
        id
        key
        value
        status
        requiredConfigVariable {
          key
          dataType
          description
          collectionType
          orgOnly
        }
      }
    }
  }
}
```

### Mutation: Update Config Variables (Safe, Partial)

**Always use this** for config updates. Only updates specified variables; others are preserved.

```graphql
mutation updateInstanceConfigVariables(
  $instanceId: ID!
  $configVariables: [InputInstanceConfigVariable]
) {
  updateInstanceConfigVariables(input: {
    id: $instanceId
    configVariables: $configVariables
  }) {
    instance {
      id
      configState
      needsDeploy
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
  "instanceId": "SW5zdGFuY2U6MTIzNDU=",
  "configVariables": [
    {
      "key": "Slack Channel",
      "value": "#general"
    },
    {
      "key": "Enable Notifications",
      "value": "true"
    }
  ]
}
```

### WARNING: updateInstance Replaces All Config

`updateInstance` with `configVariables` replaces ALL config variables. Omitted variables reset to defaults. **Never use it for partial config updates.**

## Config Variable Input Types

```graphql
input InputInstanceConfigVariable {
  key: String!              # Config variable key (display name)
  value: String             # Simple string value
  values: [String]          # List/multi-select values
  scheduleType: String      # For schedule-type config vars
  scheduleMetaData: String  # Schedule metadata (cron expression, etc.)
}
```

## Customer Config Variables

Customer config variables are instances of scoped config variables. See `connections.md` for details.

### Query: List Customer Config Variables

```graphql
query listCustomerConfigVariables($customer: ID) {
  customerConfigVariables(customer: $customer) {
    nodes {
      id
      key
      value
      isTest
      status
      customer { id name }
      scopedConfigVariable {
        id
        key
        stableKey
      }
    }
  }
}
```

### Mutation: Update Customer Config Variable

```graphql
mutation updateCustomerConfigVariable(
  $id: ID!
  $inputs: [InputExpression]
) {
  updateCustomerConfigVariable(input: {
    id: $id
    inputs: $inputs
  }) {
    customerConfigVariable {
      id
      status
    }
    errors {
      field
      messages
    }
  }
}
```

## Deployment After Config Changes

After updating config variables, deploy to activate:

```graphql
mutation deployInstance($id: ID!) {
  deployInstance(input: { id: $id }) {
    instance {
      id
      deployedVersion
      needsDeploy
    }
    errors { field messages }
  }
}
```

Check `needsDeploy` to know if deployment is needed:
```graphql
query checkDeployState($id: ID!) {
  instance(id: $id) {
    id
    needsDeploy
    configState
  }
}
```
