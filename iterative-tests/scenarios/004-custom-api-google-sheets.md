# Scenario 004: Custom API to Google Sheets with Dynamic Config

## Prompt

Build an integration that syncs data from our internal REST API to Google Sheets. Our API uses OAuth2 with a custom token endpoint and requires a tenant-specific base URL (e.g., https://{tenant}.ourapi.com/v2). On the config page, fetch the available data models from our API and let the user pick which model to sync and configure field-to-column mappings using a dynamic form. Poll every 15 minutes for changes.

## Patterns Exercised

- Custom API with no existing component
- Templated connection inputs (tenant-specific OAuth URLs)
- Custom OAuth2 connection (manual inputs configuration)
- JSON Forms data source (dynamic form schema)
- Google Sheets data sources (spreadsheet/worksheet/column selectors)
- Multi-page config page with dependencies
- Incremental polling with cursor management

## Why This Is Hard

- No existing component for the custom API — triggers API research, must produce an API spec
- Templated connection inputs — tenant-specific OAuth URLs derived from user input
- Custom OAuth2 connection — must use OAuth2Type.AuthorizationCode with manual inputs configuration (different property names: `default` not `defaultValue`, `comments` not `description`)
- JSON Forms data source — dynamic form schema fetched from the authenticated API at config time, with conditional fields based on selected data model
- Google Sheets data sources — spreadsheet/worksheet/column selectors that depend on the Google connection
- Config page ordering — connections on page 1, API model selector on page 2 (depends on custom connection), Sheets selector on page 3 (depends on Google connection), field mapping on page 4 (depends on both)
- Incremental polling with cursor management in instanceState

## Answer Key

### Integration basics
- **Name**: custom-api-sheets-sync
- **Description**: Syncs data from a custom REST API to Google Sheets with dynamic field mapping

### Custom API details
- **Base URL pattern**: `https://{tenant}.ourapi.com/v2`
- **Auth**: OAuth2 Authorization Code flow
- **Token endpoint**: `https://{tenant}.ourapi.com/oauth/token`
- **Authorize endpoint**: `https://{tenant}.ourapi.com/oauth/authorize`
- **Scopes**: `read:models read:data`
- **Endpoints used**:
  - `GET /models` — returns list of available data models
  - `GET /models/{modelId}/schema` — returns field definitions for a model
  - `GET /models/{modelId}/records?since={cursor}` — returns records modified since cursor

### Connections
- **Custom API**: OAuth2 with tenant-specific URLs (templated inputs)
- **Google Sheets**: Prismatic Google Sheets OAuth2 connection

### Config page ordering
- **Page 1**: Custom API connection (tenant domain input + OAuth) + Google Sheets connection
- **Page 2**: Data model selector (data source that calls GET /models using custom connection)
- **Page 3**: Google Sheets spreadsheet + worksheet selector
- **Page 4**: Field-to-column mapping (JSON Forms, dynamic based on selected model's schema)

### Polling
- Every 15 minutes
- Use `modifiedSince` cursor stored in instanceState
- First run: full sync (no cursor = fetch all)

### Error handling
- If custom API returns 429, respect Retry-After header
- If Google Sheets quota exceeded, retry with backoff
- If a record fails to write, log and continue

## Evaluation Checklist

- [ ] Custom component or inline HTTP calls for the custom API?
- [ ] OAuth2 connection with templated tenant-specific URLs?
- [ ] OAuth2 `inputs` use correct property names (`default`, `comments`)?
- [ ] Data source that fetches models from the custom API?
- [ ] JSON Forms dynamic config for field mapping?
- [ ] Google Sheets component manifest installed?
- [ ] Config pages in correct dependency order?
- [ ] Incremental polling with cursor in instanceState?
- [ ] Does `npm run build` pass?
- [ ] How many questions asked?
- [ ] How many build failures before success?
