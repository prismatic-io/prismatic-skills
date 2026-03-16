# Scenario 002: Shopify-to-NetSuite Order Sync (Multi-Flow + Lifecycle Hooks)

## Prompt

Build a Shopify-to-NetSuite order sync. Shopify sends webhooks for new orders, refunds, and fulfillment updates. Route each event type to a separate flow for processing. Create the corresponding order, credit memo, or item fulfillment in NetSuite. Register the Shopify webhooks automatically on deploy and clean them up on delete.

## Patterns Exercised

- Preprocess flow routing (flowNameField)
- 3 separate flows + 1 preprocess flow
- NetSuite authentication (certificate-based JWT or 7-day expiring tokens)
- Lifecycle hooks (onInstanceDeploy / onInstanceDelete)
- HMAC webhook signature verification in onTrigger
- Webhook-only pattern (no Prismatic polling trigger for Shopify in CNI)

## Why This Is Hard

- Preprocess flow routing — shared webhook endpoint must inspect payload and route to the correct flow via `preprocessFlowConfig.flowNameField`
- Multi-flow file organization — 4 flows total
- NetSuite has the most complex auth in the catalog
- Lifecycle hooks must register webhooks on deploy and clean up on delete (must not throw)
- HMAC webhook signature verification in onTrigger
- No Prismatic polling trigger for Shopify in CNI — must handle webhook-only pattern

## Answer Key

### Integration basics
- **Name**: shopify-netsuite-order-sync
- **Description**: Syncs Shopify orders, refunds, and fulfillments to NetSuite

### Flows
- **Preprocess flow**: Inspects `X-Shopify-Topic` header or payload topic field, routes to correct flow
- **Flow 1 — New Order**: Creates Sales Order in NetSuite
- **Flow 2 — Refund**: Creates Credit Memo in NetSuite
- **Flow 3 — Fulfillment**: Creates Item Fulfillment in NetSuite

### Connections
- **Shopify**: Custom connection with API key + shop domain (for webhook registration API)
- **NetSuite**: Use Prismatic NetSuite component's connection (SuiteTalk/REST)

### Webhook registration
- On deploy: POST to Shopify Admin API to register webhook URLs for `orders/create`, `refunds/create`, `fulfillments/create`
- On delete: DELETE the registered webhooks (don't throw if they're already gone)

### Webhook verification
- Verify `X-Shopify-Hmac-Sha256` header against shared secret in onTrigger

### Config page
- Shopify shop domain (text input)
- Shopify API credentials (connection)
- NetSuite connection
- NetSuite subsidiary (if applicable)

### Error handling
- If NetSuite API returns 409 (duplicate), log and skip
- If webhook verification fails, return 401
- Lifecycle hook cleanup must not throw

## Evaluation Checklist

- [ ] Correctly structured preprocess flow with flowNameField routing?
- [ ] All 3 processing flows + preprocess flow present?
- [ ] Lifecycle hooks for webhook registration/cleanup?
- [ ] onInstanceDelete wrapped in try/catch (must not throw)?
- [ ] HMAC verification in onTrigger?
- [ ] NetSuite component manifest installed?
- [ ] Multi-flow file organization correct?
- [ ] Does `npm run build` pass?
- [ ] How many questions asked?
- [ ] How many build failures before success?
