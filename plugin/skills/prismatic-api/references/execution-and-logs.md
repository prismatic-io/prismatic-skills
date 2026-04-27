# Execution Results and Logs

## Query: List Execution Results

```graphql
query listExecutionResults(
  $instance: ID
  $integration: ID
  $after: String
) {
  executionResults(
    instance: $instance
    integration: $integration
    after: $after
    first: 50
    sortBy: [{field: STARTED_AT, direction: DESC}]
  ) {
    nodes {
      id
      startedAt
      endedAt
      error
      retryCount
      retryForExecution { id }
      instance {
        id
        name
        customer { id name }
      }
      flow {
        id
        name
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

## Query: Get Execution Result with Step Results

Step results include presigned S3 URLs for downloading the actual result data.

```graphql
query getExecutionResult($id: ID!) {
  executionResult(id: $id) {
    id
    startedAt
    endedAt
    error
    stepResults(first: 100) {
      nodes {
        stepName
        resultsUrl
        startedAt
        endedAt
      }
    }
  }
}
```

**Important**: `resultsUrl` returns a presigned S3 URL. Fetch it to get the step's output data:

```bash
curl -s "$(echo $RESULTS_URL)" | jq .
```

## Mutation: Replay Execution

Re-execute a failed run with the same trigger payload.

```graphql
mutation replayExecution($id: ID!) {
  replayExecution(input: { id: $id }) {
    instanceExecutionResult {
      id
      startedAt
    }
    errors {
      field
      messages
    }
  }
}
```

## Query: List Logs

```graphql
query listLogs(
  $instance: ID
  $executionResult: ID
  $after: String
) {
  logs(
    instance: $instance
    executionResult: $executionResult
    after: $after
    first: 100
    sortBy: [{field: TIMESTAMP, direction: DESC}]
  ) {
    nodes {
      id
      timestamp
      severity
      message
      flowConfig { flow { name } }
      instance { id name }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Log Severity Levels

| Severity | Description |
|----------|-------------|
| `DEBUG` | Debug information |
| `INFO` | Informational messages |
| `WARN` | Warning conditions |
| `ERROR` | Error conditions |
| `FATAL` | Fatal errors |
| `METRIC` | Performance metrics |
| `TRACE` | Trace-level detail |

## Key Fields

### Execution Result

| Field | Type | Description |
|-------|------|-------------|
| `id` | ID | Unique identifier |
| `startedAt` | DateTime | Execution start time |
| `endedAt` | DateTime | Execution end time |
| `error` | String | Error message (null if successful) |
| `retryCount` | Int | Number of retry attempts |
| `retryForExecution` | ExecutionResult | Original execution if this is a retry |
| `instance` | Instance | Owning instance |
| `flow` | Flow | Flow that was executed |
| `stepResults` | Connection | Individual step results |

### Step Result

| Field | Type | Description |
|-------|------|-------------|
| `stepName` | String | Name of the step |
| `resultsUrl` | String | Presigned S3 URL for result data |
| `startedAt` | DateTime | Step start time |
| `endedAt` | DateTime | Step end time |
