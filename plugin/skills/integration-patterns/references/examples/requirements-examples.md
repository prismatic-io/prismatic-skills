# Requirements Phase Examples — Integration Builder

## Writing answers correctly

<example>
<input>User said "each event routes to a separate flow." Spec item `endpoint_type` has choices: [flow_specific, instance_specific, shared_instance].</input>
<output>
Infer `endpoint_type=flow_specific` because user explicitly said "separate flow" per event, which maps directly to `flow_specific`.
Command: `prismatic-tools record-choices --session <name> endpoint_type=flow_specific`
</output>
</example>

<example>
<input>User chose OAuth for Shopify. prismatic-tools find-components returned a connection object: {"key":"shopify-oauth2","label":"Shopify OAuth 2.0","auth_type":"OAuth2","required_inputs":["apiKey","apiSecretKey"],"inputs":[...]}</input>
<output>
Write the FULL object, not just the key:
`prismatic-tools record-choices --session <name> 'source_connection_type={"key":"shopify-oauth2","label":"Shopify OAuth 2.0","auth_type":"OAuth2","required_inputs":["apiKey","apiSecretKey"],"inputs":[...]}'`
NOT: `source_connection_type=shopify-oauth2`
NOT: `source_connection_type="Shopify OAuth 2.0"`
</output>
</example>

<example>
<input>Spec item `error_handler_type` has choices: [fail, ignore, retry]. Agent needs to present these to the user.</input>
<output>
Read the spec item first. The choices array says: fail, ignore, retry. Present ONLY those, using the implications field:

"Here's a choice that matters for reliability: what should happen when the flow's main function throws an error?

- **fail** — stops the flow and marks the execution as failed. Simplest option — works well with external monitoring. No automatic recovery.
- **ignore** — continues running as if nothing happened. The error is captured in the result but the flow keeps going. Risky for critical operations.
- **retry** — retries up to N times with configurable delay between attempts. Most common choice for production — catches transient failures like rate limits and brief outages."

NOT: "Raise error", "Log and ignore", "Custom error handler flow" — these don't exist in the spec and won't compile.
</output>
</example>

<example>
<input>User said "customer-managed". Spec item `source_connection` has choices: [customer_activated, org_activated, no_connection].</input>
<output>
Map "customer-managed" to the spec slug `customer_activated` (not `customer_managed`, not `customer`, not `managed`).
Command: `prismatic-tools record-choices --session <name> source_connection=customer_activated`
</output>
</example>

## Using the right tools

<example>
<input>Agent needs to find if Prismatic has a Shopify component in the registry.</input>
<output>
search-COMPONENTS (registry lookup): `prismatic-tools find-components shopify`
NOT search-connections (that searches existing org connections, not the component registry).
NOT MCP `prism_components_list` — it returns incomplete data and a hook will deny it.
</output>
</example>

<example>
<input>Agent needs to find existing org-level connections for Shopify after user chose a connection management strategy.</input>
<output>
search-CONNECTIONS (org connection lookup): `prismatic-tools search-connections shopify`
NOT find-components (that searches the component registry, not org connections).
</output>
</example>
