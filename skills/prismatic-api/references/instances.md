# Instances

An instance is a deployed integration configured for a specific customer.

## Query: List Instances

```graphql
query listInstances($after: String, $customer: ID, $integration: ID) {
  instances(
    after: $after
    first: 100
    customer: $customer
    integration: $integration
    sortBy: [{field: CREATED_AT, direction: ASC}]
  ) {
    nodes {
      id
      name
      description
      enabled
      deployedVersion
      needsDeploy
      inFailedState
      configState
      lastDeployedAt
      lastExecutedAt
      customer { id name }
      integration { id name versionNumber }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

## Query: Get Instance with Config

```graphql
query getInstance($id: ID!) {
  instance(id: $id) {
    id
    name
    description
    enabled
    deployedVersion
    needsDeploy
    configState
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
    flowConfigs {
      nodes {
        id
        flow { id name stableKey }
        apiKeys
        webhookUrl
      }
    }
  }
}
```

## Mutation: Create Instance

```graphql
mutation createInstance(
  $integration: ID!
  $customer: ID!
  $name: String!
  $description: String
  $configVariables: [InputInstanceConfigVariable]
) {
  createInstance(input: {
    integration: $integration
    customer: $customer
    name: $name
    description: $description
    configVariables: $configVariables
  }) {
    instance {
      id
      name
      customer { id name }
    }
    errors {
      field
      messages
    }
  }
}
```

## Mutation: Update Instance Config Variables (Safe, Partial)

**Always use this** instead of `updateInstance` for config changes. This mutation only updates the specified variables; unspecified variables retain their existing values.

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
      "key": "My Config Var",
      "value": "new-value"
    }
  ]
}
```

**WARNING**: `updateInstance` with `configVariables` replaces ALL config variables. Any omitted variables reset to their defaults. Always prefer `updateInstanceConfigVariables` for partial updates.

## Mutation: Deploy Instance

Activates configuration changes. Must be called after updating config variables.

```graphql
mutation deployInstance($id: ID!) {
  deployInstance(input: { id: $id }) {
    instance {
      id
      name
      enabled
      deployedVersion
      lastDeployedAt
    }
    errors {
      field
      messages
    }
  }
}
```

## Mutation: Delete Instance

```graphql
mutation deleteInstance($id: ID!) {
  deleteInstance(input: { id: $id }) {
    instance { id }
    errors { field messages }
  }
}
```

## Query: Get Test (System) Instance

The test instance is auto-created when an integration is imported. Use `isSystem: true` to find it.

```graphql
query getTestInstance($integrationId: ID!) {
  instances(integration: $integrationId, isSystem: true) {
    nodes {
      id
      name
      enabled
      needsDeploy
      configState
      configVariables {
        nodes {
          id
          key
          value
          status
          requiredConfigVariable {
            key
            dataType
          }
        }
      }
      flowConfigs {
        nodes {
          id
          flow { id name stableKey }
          webhookUrl
        }
      }
    }
  }
}
```

The designer URL for the test instance: `https://app.prismatic.io/designer/<instance-id>`

## Mutation: Clear Instance Persisted State

Resets `crossFlowState` or per-flow `instanceState`. Useful for re-running a full backfill after fixing polling logic.

```graphql
# Clear cross-flow state
mutation clearCrossFlowState($instanceId: ID!) {
  updateInstance(input: {
    id: $instanceId
    persistedData: "{}"
  }) {
    instance { id }
    errors { field messages }
  }
}
```

For per-flow state, update each flow config:
```graphql
mutation clearFlowState($flowConfigId: ID!) {
  updateInstanceFlowConfig(input: {
    id: $flowConfigId
    persistedData: "{}"
  }) {
    instanceFlowConfig { id }
    errors { field messages }
  }
}
```

## Instance Config Variable Types

```graphql
input InputInstanceConfigVariable {
  key: String!            # Config variable key
  value: String           # Simple value
  values: [String]        # List values
  scheduleType: String    # For schedule config vars
  scheduleMetaData: String # Schedule metadata
}
```

## Key Fields

| Field              | Type       | Description                         |
|--------------------|------------|-------------------------------------|
| `id`               | ID         | Base64-encoded unique identifier    |
| `name`             | String     | Instance name                       |
| `enabled`          | Boolean    | Whether instance is active          |
| `deployedVersion`  | Int        | Currently deployed version          |
| `needsDeploy`      | Boolean    | Config changed, needs redeployment  |
| `configState`      | String     | Config completion state             |
| `inFailedState`    | Boolean    | Instance has errors                 |
| `systemSuspended`  | Boolean    | Suspended by system                 |
| `globalDebug`      | Boolean    | Debug logging enabled               |
| `configVariables`  | Connection | Config variable values              |
| `flowConfigs`      | Connection | Flow-specific configurations        |
| `executionResults` | Connection | Past execution results              |
| `logs`             | Connection | Log entries                         |
| `monitors`         | Connection | Alert monitors                      |
| `lastDeployedAt`   | DateTime   | Last deployment timestamp           |
| `lastExecutedAt`   | DateTime   | Last execution timestamp            |

## Deployment Workflow

1. Create instance with `createInstance`
2. Configure variables with `updateInstanceConfigVariables`
3. Deploy with `deployInstance`
4. Check `needsDeploy` after config changes
5. Redeploy as needed
