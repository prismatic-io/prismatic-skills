# Scenario 001: Slack Notification on CRM Deal Close

## Prompt

Build a Code Native Integration that sends a Slack message when a deal is closed
in a CRM system. The integration should:

- Be triggered by a webhook from the CRM
- Extract the deal name, amount, and sales rep from the webhook payload
- Format a rich Slack message with the deal details
- Post to a configurable Slack channel
- Include a config page where the user selects their Slack connection and specifies the channel

## Why This Scenario

Exercises the core plugin capabilities:
- Webhook trigger configuration
- Component manifest usage (Slack)
- Connection setup
- Config page with user inputs
- Data transformation between webhook payload and Slack message format
- Type-safe code generation from Spectral types

## Answer Key

Use these responses when the agent asks questions, to keep comparisons consistent.

### Integration basics
- **Name**: crm-deal-slack-notify
- **Description**: Sends a Slack notification when a CRM deal is closed
- **Customer/use case**: Internal sales team wants real-time deal close alerts

### Trigger
- **Trigger type**: Webhook
- **Webhook payload format**: JSON
- **Example payload**:
  ```json
  {
    "event": "deal.closed",
    "deal": {
      "id": "deal-12345",
      "name": "Acme Corp Enterprise License",
      "amount": 50000,
      "currency": "USD",
      "closed_by": {
        "name": "Jane Smith",
        "email": "jane@company.com"
      },
      "closed_at": "2026-03-09T15:30:00Z"
    }
  }
  ```

### Connections
- **Slack connection**: Use the standard Prismatic Slack OAuth 2.0 connection
- **CRM connection**: None needed (webhook push, not pull)

### Configuration
- **Slack channel**: User-configurable text input, default `#sales-wins`
- **Include amount**: User-configurable boolean toggle, default true
- **Mention sales rep**: User-configurable boolean toggle, default false

### Slack message format
- Use Slack Block Kit (sections + context)
- Bold the deal name
- Show amount formatted as currency if "include amount" is enabled
- Show the closer's name
- Include a timestamp

### Error handling
- If the webhook payload is missing required fields, log a warning and skip
- If the Slack post fails, throw so Prismatic retries

### Testing
- Don't deploy, just make sure it builds

## Evaluation Checklist

After each run, note:

- [ ] Did the agent ask for the integration name or infer it?
- [ ] Did it correctly identify Slack as a component to install?
- [ ] Did it set up the webhook trigger correctly?
- [ ] Did it create a config page with the right fields?
- [ ] Did it use the Slack component manifest correctly?
- [ ] Does the generated code type-check? (`npm run build`)
- [ ] How many questions did the agent ask?
- [ ] How many build failures before success?
- [ ] Were any questions redundant given the scenario description?
- [ ] Did the agent handle the CRM payload extraction correctly?
- [ ] Quality of the Slack Block Kit message formatting?
- [ ] Total approximate time from start to successful build?

## Recording Results

Save results to `../results/001/` with:
- `{branch-name}/` — the generated integration project
- `{branch-name}-notes.md` — answers to the evaluation checklist + observations
