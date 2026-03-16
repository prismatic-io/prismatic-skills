# Scenario 005: Stripe-to-QuickBooks with Teams Alerts (3 Components + Idempotency)

## Prompt

Build a Stripe-to-QuickBooks integration. Listen for Stripe webhook events (payment_intent.succeeded, charge.refunded, invoice.payment_failed). For successful payments, create an invoice and payment in QuickBooks. For refunds, create a credit note. For failed payments, send an alert to a Microsoft Teams channel. Track all processed Stripe event IDs to ensure idempotency — never process the same event twice.

## Patterns Exercised

- 3 components with different auth types
- Stripe auto-managed webhooks
- Cross-flow state for idempotency
- Event deduplication with size management
- Multiple data sources (Teams, QuickBooks, Stripe)
- Error handling branches per event type

## Why This Is Hard

- 3 components — Stripe, QuickBooks, Microsoft Teams — all with different auth types
- Stripe auto-managed webhooks — registers endpoints on deploy, reuses existing matching ones, validates webhook signatures
- QuickBooks dual webhook format — CloudEvents vs legacy format normalization (though we're primarily writing TO QuickBooks, the OAuth setup is still complex)
- Microsoft Teams auth — 4 different connection types, must choose correctly for posting to a channel
- Cross-flow state for idempotency — processed event IDs stored in state, but state race conditions if multiple webhooks arrive simultaneously
- Event deduplication at the state level with size management (can't store infinite event IDs — need TTL or rolling window)
- Multiple data sources — Teams channel/team selectors, QuickBooks customer/account selectors, Stripe product selectors
- Error handling branches — different flows or code paths for success vs refund vs failure, each with different destination actions

## Answer Key

### Integration basics
- **Name**: stripe-quickbooks-teams-sync
- **Description**: Processes Stripe payment events into QuickBooks with Teams alerting for failures

### Flows
- **Preprocess/Router flow**: Receives Stripe webhook, verifies signature, checks idempotency, routes by event type
- **Flow 1 — Payment Success**: Creates QuickBooks Invoice + Payment
- **Flow 2 — Refund**: Creates QuickBooks Credit Note
- **Flow 3 — Payment Failed**: Sends Microsoft Teams alert

### Connections
- **Stripe**: Stripe API key connection (for webhook management + signature verification)
- **QuickBooks**: Prismatic QuickBooks Online OAuth2 connection
- **Microsoft Teams**: Use "Bot" connection type (for posting to channels)

### Idempotency
- Store processed Stripe event IDs in crossFlowState
- Before processing, check if event ID exists in state
- Use a rolling window: keep last 10,000 event IDs, drop oldest when limit reached
- Key: `processed_events` as an array of `{id, timestamp}` objects

### Webhook handling
- Verify Stripe webhook signature using the signing secret
- Register webhook endpoint on deploy for events: `payment_intent.succeeded`, `charge.refunded`, `invoice.payment_failed`

### Config page
- Page 1: Stripe connection, QuickBooks connection, Teams connection
- Page 2: Teams channel selector (data source dependent on Teams connection)
- Page 3: QuickBooks income account selector (data source dependent on QB connection)

### Teams alert format
- Card with: event type, amount, customer email, failure reason (if applicable), link to Stripe dashboard

### Error handling
- QuickBooks 429: retry with backoff
- Teams post failure: log warning, don't block payment processing
- Duplicate event: skip silently, return 200 to Stripe

## Evaluation Checklist

- [ ] All 3 component manifests installed?
- [ ] Correct Teams connection type chosen (Bot, not OAuth)?
- [ ] Stripe webhook signature verification?
- [ ] Idempotency mechanism with size management?
- [ ] Preprocess flow routing by event type?
- [ ] QuickBooks Invoice + Payment creation (not just invoice)?
- [ ] Teams alert includes useful context?
- [ ] Cross-flow state used correctly?
- [ ] Does `npm run build` pass?
- [ ] How many questions asked?
- [ ] How many build failures before success?
