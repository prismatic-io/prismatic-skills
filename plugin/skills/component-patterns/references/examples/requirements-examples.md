# Requirements Phase Examples — Component Builder

## Writing answers correctly

<example>
<input>User said "it's a connector for the Canny API." Spec item `component_type` has choices: [connector, utility].</input>
<output>
Infer `component_type=connector` because user explicitly said "connector for the Canny API", which maps directly to `connector`.
Command: `prismatic-tools record-choices --session <name> --type component component_type=connector`
</output>
</example>

<example>
<input>User chose OAuth2 for auth. Spec item `auth_type` has choices: [oauth2, api_key, bearer_token, basic_auth].</input>
<output>
Write the exact slug:
`prismatic-tools record-choices --session <name> --type component auth_type=oauth2`
NOT: `auth_type=OAuth2`
NOT: `auth_type=oauth`
</output>
</example>

<example>
<input>Spec item `error_handling` has choices: [throw, return_error, retry]. Agent needs to present these to the user.</input>
<output>
Read the spec item first. The choices array says: throw, return_error, retry. Present ONLY those, using the implications field:

"How should actions handle errors from the external API?

- **throw** — raises an error that stops the integration flow. Simplest option — works well when the caller handles retries.
- **return_error** — wraps the error in a structured response and returns it. The caller can inspect and decide what to do.
- **retry** — retries the API call with configurable backoff. Best for transient failures like rate limits."

NOT: "Raise exception", "Log and continue", "Custom error handler" — these don't exist in the spec and won't compile.
</output>
</example>
