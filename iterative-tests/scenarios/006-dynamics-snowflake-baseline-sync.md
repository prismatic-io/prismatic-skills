# Scenario 006: Dynamics 365 to Snowflake Baseline + Incremental Sync

## Prompt

Build a Microsoft Dynamics 365 to Snowflake data warehouse sync. On first deployment, do a baseline load of all Accounts, Contacts, and Opportunities from Dynamics into corresponding Snowflake tables. After that, poll Dynamics every 10 minutes for changes and upsert only modified records into Snowflake. Use the Dynamics entity metadata API to dynamically discover available fields. Let the user choose which Dynamics entities and fields to sync via the config wizard.

## Patterns Exercised

- Baseline + incremental sync pattern
- Lifecycle hooks for initial bulk load (timeout risk)
- Dynamics 365 auth (Azure AD, dynamic scope URLs)
- Snowflake auth (OAuth or key-pair)
- Dynamic entity discovery via data sources
- Multi-entity cursor management in instanceState
- DDL generation for Snowflake tables
- Complex multi-page config with cascading dependencies

## Why This Is Hard

- Baseline + incremental pattern — onInstanceDeploy must handle initial bulk load (30-second timeout risk), then switch to incremental polling
- Dynamics 365 auth — Azure AD registration, dynamic scope URLs based on instance URL (`https://[dynamics-url]/.default`), `offline_access` scope critical
- Snowflake auth — OAuth or key-pair authentication, SQL execution for DDL + DML
- Dynamic entity discovery — data source that calls Dynamics metadata API and returns entity/field lists
- Multi-entity sync — user picks N entities, each needs its own cursor tracking — instanceState must manage N cursors
- DDL generation — may need to CREATE TABLE in Snowflake based on discovered Dynamics fields (or at minimum, handle schema drift)
- Config page complexity — Dynamics connection, Snowflake connection, entity selector (data source dependent on Dynamics connection), field selector per entity (dynamic, dependent on entity selection)
- State management — per-entity cursors, baseline completion flag in crossFlowState, entity-specific instanceState with cursor per entity

## Answer Key

### Integration basics
- **Name**: dynamics-snowflake-sync
- **Description**: Baseline and incremental sync from Dynamics 365 to Snowflake

### Flows
- **Main flow**: Poll Dynamics for changes per entity, upsert to Snowflake

### Lifecycle hooks
- **onInstanceDeploy**:
  - Check if baseline has been completed (flag in crossFlowState)
  - If not, fetch all records for each configured entity
  - Insert into Snowflake (batch inserts, handle 30s timeout by paginating)
  - Set baseline completion flag
  - Initialize per-entity cursors to current timestamp
- **onInstanceDelete**:
  - Optionally drop Snowflake tables (configurable)
  - Clean up state

### Connections
- **Dynamics 365**: Azure AD OAuth2 with dynamic scope (`https://{dynamics-url}/.default offline_access`)
- **Snowflake**: Snowflake OAuth or key-pair connection

### Polling
- Every 10 minutes
- Per-entity: query Dynamics with `$filter=modifiedon gt {cursor}`
- Update cursor per entity after successful sync

### Config page
- **Page 1**: Dynamics 365 connection (instance URL input + Azure AD OAuth), Snowflake connection
- **Page 2**: Entity selector (data source: calls Dynamics `EntityDefinitions` API, returns entity logical names)
- **Page 3**: Per-entity field selector (data source: calls `EntityDefinitions(LogicalName='{entity}')/Attributes`, returns field list)
- **Page 4**: Sync options — poll interval, baseline batch size, drop tables on delete toggle

### Snowflake DDL
- On baseline: CREATE TABLE IF NOT EXISTS for each entity
- Column types derived from Dynamics field types (String→VARCHAR, Integer→NUMBER, DateTime→TIMESTAMP, etc.)
- Primary key: Dynamics record GUID

### State management
- `crossFlowState.baseline_completed`: boolean flag
- `instanceState.cursors`: `{ [entityName]: lastModifiedTimestamp }`
- `instanceState.table_schemas`: cached DDL for drift detection

### Error handling
- Baseline timeout: paginate in batches of 1000, track progress in state so it can resume
- Snowflake SQL error: log the failing record, continue with batch
- Dynamics 401: token refresh should be automatic via component
- Schema drift: if a new Dynamics field appears, ALTER TABLE to add column

## Evaluation Checklist

- [ ] Baseline sync in onInstanceDeploy?
- [ ] Baseline handles 30-second timeout (pagination/batching)?
- [ ] Baseline completion flag in state?
- [ ] Per-entity cursor management?
- [ ] Dynamics auth with dynamic scope URL?
- [ ] Snowflake DDL generation?
- [ ] Data source for entity discovery?
- [ ] Data source for field discovery (dependent on entity selection)?
- [ ] Config pages in correct dependency order?
- [ ] Both component manifests installed?
- [ ] Does `npm run build` pass?
- [ ] How many questions asked?
- [ ] How many build failures before success?
