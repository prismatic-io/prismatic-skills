# Documentation Style

Standards for component display text, descriptions, and comments.

---

## Voice Rules

- No second-person pronouns. Never use "you", "your", "you'll".
- No product name. Never mention "Prismatic" in display text or comments.
- Active voice, present tense. Lead with the verb.

---

## Component Display

- **label**: Short noun phrase. Example: "Acme CRM"
- **description**: One sentence, no product name. Example: "Interact with the Acme CRM API to manage contacts and deals"

---

## Action Display

Imperative verb phrase. Describe the operation, not the implementation.

| Good | Bad |
|------|-----|
| "Create a contact" | "This action creates a contact in the system" |
| "List all deals" | "Use this to get deals from the API" |
| "Delete a webhook subscription" | "Deletes your webhook" |

---

## Input Comments

Describe the expected value, not instructions.

| Good | Bad |
|------|-----|
| "The unique identifier for the contact" | "Enter the contact ID here" |
| "Space-separated list of OAuth scopes" | "You should enter your scopes separated by spaces" |
| "API base URL (default: https://api.example.com)" | "Your API endpoint URL" |

---

## Connection Descriptions

State the auth method. Include format hints for sensitive fields.

- "Connect using an API key"
- "Connect using OAuth 2.0 Authorization Code flow"
- "Connect using username and password"

---

## Rate Limiting

If the API has documented rate limits, note them in the component description
or relevant action comments:

- "The API allows 100 requests per minute per token"
- "Bulk operations are limited to 500 records per request"
