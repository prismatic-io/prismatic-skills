# Integrations

## Query: List Integrations

```graphql
query listIntegrations($after: String) {
  integrations(after: $after, first: 100) {
    nodes {
      id
      name
      description
      category
      versionNumber
      labels
      starred
      customer { id name }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Search by Name

```graphql
query searchIntegrations($search: String) {
  integrations(name_Icontains: $search) {
    nodes {
      id
      name
      description
      versionNumber
    }
  }
}
```

## Query: Get Integration with Flows

```graphql
query getIntegration($id: ID!) {
  integration(id: $id) {
    id
    name
    description
    versionNumber
    flows {
      nodes {
        id
        name
        description
        stableKey
        isSynchronous
      }
    }
    instances {
      nodes {
        id
        name
        customer { id name }
        enabled
        deployedVersion
      }
    }
  }
}
```

## Mutation: Create Integration

```graphql
mutation createIntegration($name: String!, $description: String) {
  createIntegration(input: {
    name: $name
    description: $description
  }) {
    integration {
      id
      name
    }
    errors {
      field
      messages
    }
  }
}
```

## Mutation: Publish Integration

Publishes a new version of the integration, making it available for deployment.

```graphql
mutation publishIntegration($id: ID!) {
  publishIntegration(input: { id: $id }) {
    integration {
      id
      name
      versionNumber
    }
    errors {
      field
      messages
    }
  }
}
```

## Mutation: Delete Integration

```graphql
mutation deleteIntegration($id: ID!) {
  deleteIntegration(input: { id: $id }) {
    integration { id }
    errors { field messages }
  }
}
```

## Mutation: Fork Integration

Creates a copy of an existing integration.

```graphql
mutation forkIntegration($id: ID!) {
  forkIntegration(input: { id: $id }) {
    integration {
      id
      name
    }
    errors {
      field
      messages
    }
  }
}
```

## Mutation: Test Integration Flow

```graphql
mutation testIntegrationFlow($integrationId: ID!, $flowName: String, $payload: String) {
  testIntegrationFlow(input: {
    id: $integrationId
    flowName: $flowName
    payload: $payload
  }) {
    executionResult {
      id
      startedAt
      endedAt
      error
    }
    errors {
      field
      messages
    }
  }
}
```

## Mutation: Bulk Update Instances to Latest Version

Upgrades all instances of an integration to the latest published version.

```graphql
mutation bulkUpdateInstancesToLatestIntegrationVersion($integrationId: ID!) {
  bulkUpdateInstancesToLatestIntegrationVersion(input: {
    id: $integrationId
  }) {
    integration {
      id
      name
      versionNumber
    }
    errors {
      field
      messages
    }
  }
}
```

## Mutation: Import Integration (YAML)

```graphql
mutation importIntegration($definition: String!) {
  importIntegration(input: {
    definition: $definition
  }) {
    integration {
      id
      name
    }
    errors {
      field
      messages
    }
  }
}
```

## Mutation: Set Marketplace Availability

Controls whether an integration appears in the customer-facing marketplace.

```graphql
mutation setMarketplaceAvailability($integrationId: ID!, $config: String!) {
  updateIntegrationMarketplaceConfiguration(input: {
    integration: $integrationId
    marketplaceConfiguration: $config
  }) {
    integration {
      id
      name
      marketplaceConfiguration
    }
    errors {
      field
      messages
    }
  }
}
```

**Variables**: `config` is one of `"AVAILABLE"` or `"HIDDEN"`.

## Key Fields

| Field                | Type       | Description                          |
|----------------------|------------|--------------------------------------|
| `id`                 | ID         | Base64-encoded unique identifier     |
| `name`               | String     | Integration name                     |
| `description`        | String     | Integration description              |
| `category`           | String     | Category grouping                    |
| `versionNumber`      | Int        | Current version number               |
| `versionSequenceId`  | String     | Version sequence identifier          |
| `definition`         | JSONString | Full integration definition          |
| `flows`              | Connection | Integration flows                    |
| `instances`          | Connection | Deployed instances                   |
| `labels`             | [String]   | Tags                                 |
| `starred`            | Boolean    | Favorited                            |
| `customer`           | Customer   | Owner customer (null for org-level)  |
| `attachments`        | Connection | Attached files                       |

## Integration Lifecycle

1. **Create/Import** integration
2. **Configure** flows, triggers, actions, config pages
3. **Publish** a version
4. **Create instance** for a customer
5. **Configure** instance config variables
6. **Deploy** instance to activate
7. **Test** flow execution
8. **Monitor** execution results and logs
