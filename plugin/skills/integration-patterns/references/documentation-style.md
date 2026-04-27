# Documentation Style Guide

Rules for generated `src/documentation.md` files in CNI projects.

---

## Voice

- **No second-person pronouns.** Never use "you", "your", "you'll", "you're".
  - Wrong: "You need to configure your Shopify credentials"
  - Right: "Configure the Shopify credentials in the connection panel"
  - Right: "The integration requires a Shopify API key"

- **No product name references.** Never mention "Prismatic" in generated documentation. The docs are shown inside the platform — naming it is redundant and couples the content to the brand.
  - Wrong: "This Prismatic integration syncs orders"
  - Right: "This integration syncs orders"
  - Wrong: "Configure in the Prismatic config page"
  - Right: "Configure in the integration config page"

- **Active voice for instructions.** Lead with the verb.
  - Wrong: "The API key can be found in the settings panel"
  - Right: "Find the API key in the settings panel"

---

## Structure

Generated `documentation.md` should follow this order:

1. **Overview** — One paragraph: what the integration does, which systems it connects, what triggers it.
2. **Configuration** — Each config variable with its purpose, expected format, and where to find the value.
3. **Connections** — Each connection with auth type and setup steps.
4. **Flows** — Each flow with trigger type, what it does, and expected behavior.
5. **Troubleshooting** — Common issues and resolutions (optional, include if the API has known gotchas).

---

## Formatting

- **Headers:** Use `##` for major sections, `###` for subsections. Do not use `#` (reserved for the document title).
- **Field names and UI labels:** Bold. Example: **API Key**, **Sync Interval**.
- **Code values and API paths:** Backticks. Example: `orders/create`, `Bearer`, `application/json`.
- **URLs in prose:** Markdown hyperlinks when the reader should click them. Backticks when showing an API base URL or endpoint path that isn't clickable.
  - Clickable: `[Shopify Admin](https://admin.shopify.com)`
  - Reference: `https://api.shopify.com/admin/api/2024-01/`

---

## Content Rules

- **Be specific about where to find values.** Don't say "enter the API key" — say "find the API key in **Settings > API Credentials** in the Shopify admin panel."
- **Document the trigger payload shape** if the integration uses webhooks. Include 2-3 key fields the user will see in execution logs.
- **List required vs optional config variables.** Mark which ones have defaults.
- **Don't document internal implementation.** The user doesn't need to know about componentRegistry, manifest imports, or TypeScript patterns. Document what they configure and what they see.
