# Scenario 003: Bidirectional HubSpot-Salesforce Contact Sync

## Prompt

Build a bidirectional contact sync between HubSpot and Salesforce. When a contact is created or updated in either system, sync it to the other. Use polling triggers for both directions. Make sure changes synced FROM one system don't trigger a sync back — prevent infinite loops. Let the user configure field mappings on the config page.

## Patterns Exercised

- Two polling flows in opposite directions
- Loop prevention via state tracking
- State race conditions (concurrent crossFlowState writes)
- Dynamic field mapping config (JSON Forms or key-value list)
- Two OAuth connections of the same pattern
- Scheduled triggers with independent cron schedules
- Data sources from both components

## Why This Is Hard

- Two polling flows in opposite directions — both need instanceState cursors
- Loop prevention — must track "synced-by-integration" records in state to avoid re-syncing changes the integration itself made (no built-in mechanism)
- State race conditions — if both polls run concurrently and both write to crossFlowState, one overwrites the other's changes entirely
- Dynamic field mapping config — likely needs JSON Forms or a key-value list config var for user-defined field mappings
- Two OAuth connections of the same pattern (both are OAuth2) — config page naming/ordering matters
- Scheduled triggers — two independent cron schedules
- Data sources from both components — Salesforce record type selector + HubSpot property selector

## Answer Key

### Integration basics
- **Name**: hubspot-salesforce-contact-sync
- **Description**: Bidirectional contact sync between HubSpot and Salesforce with loop prevention

### Flows
- **Flow 1 — HubSpot→Salesforce**: Poll HubSpot for new/updated contacts, upsert to Salesforce
- **Flow 2 — Salesforce→HubSpot**: Poll Salesforce for new/updated contacts, upsert to HubSpot

### Connections
- **HubSpot**: Prismatic HubSpot OAuth2 connection
- **Salesforce**: Prismatic Salesforce OAuth2 connection

### Polling
- HubSpot: Poll every 5 minutes using `lastmodifieddate` cursor
- Salesforce: Poll every 5 minutes using `SystemModstamp` cursor

### Loop prevention strategy
- When syncing a record, store its ID + a hash of synced fields in crossFlowState under a `synced_records` map
- Before syncing a record, check if the current change matches a known synced hash — if so, skip it
- Use flow-specific state keys to avoid race conditions: `hubspot_synced` and `salesforce_synced`

### Field mappings
- Default mappings: email↔Email, firstname↔FirstName, lastname↔LastName, phone↔Phone, company↔Account.Name
- User should be able to add/remove/modify mappings on config page

### Config page
- Page 1: HubSpot connection + Salesforce connection
- Page 2: Sync direction toggles (HubSpot→SF, SF→HubSpot, or both)
- Page 3: Field mapping configuration
- Page 4: Poll interval for each direction

### Error handling
- If upsert fails for a single record, log and continue with remaining records
- If auth token expires mid-batch, the component should handle refresh automatically

## Evaluation Checklist

- [ ] Two separate polling flows with independent cursors?
- [ ] Loop prevention mechanism implemented?
- [ ] State race condition addressed (separate state keys or locking)?
- [ ] Field mapping configurable on config page?
- [ ] Both component manifests installed?
- [ ] Config page ordering correct (connections before data sources)?
- [ ] Scheduled triggers configured?
- [ ] Does `npm run build` pass?
- [ ] How many questions asked?
- [ ] How many build failures before success?
