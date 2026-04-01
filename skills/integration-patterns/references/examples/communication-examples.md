# Communication Examples — Integration Builder

These examples apply across all phases.

## Narrating tool calls

<example>
<input>Agent is about to run a script (sync, search, write answers, etc.).</input>
<output>
WRONG: "Now let me run the sync script to see what requirements need to be gathered."
WRONG: "Let me run the sync script to figure out what we already know."
WRONG: "Running prismatic-tools find-components to look up Shopify."
WRONG: "Let me write those answers and re-sync."

RIGHT: Say nothing — just run it silently.
RIGHT: "Let me see what I can work out from your description." (then run silently)
RIGHT: "Checking if Prismatic has a Shopify component..." (then run silently)

The user doesn't know about scripts. Narrate the PURPOSE, not the tool.
</output>
</example>

## Communicating with the user

<example>
<input>Agent just ran prismatic-tools update-tasks, wrote 10 answers, and needs to tell the user what happened.</input>
<output>
WRONG: "19 of 46 answered. 4 required items remain, all inference: prohibited."
WRONG: "Now let me mark the inferred tasks complete and create tasks for the newly surfaced requirements."
WRONG: "Let me create the requirement tracking tasks and then walk you through what I picked up."

RIGHT: "Based on your description, here's what I picked up..." [list inferences with WHAT/WHY/IMPACT] "...does this look right?"
RIGHT: "Got it — OAuth 2.0 for Shopify. Now let's figure out the NetSuite side."
RIGHT: "Three more things I need your input on before we can start building."
</output>
</example>

<example>
<input>Agent found an org-activated demo connection but user chose customer-activated auth.</input>
<output>
WRONG: "Here are your options: 1) Create new connection, 2) Use existing shopify-demo"

RIGHT: "The only existing Shopify connection is an org-level demo — it won't work for customer-managed auth since each customer needs to authorize individually. I'll set up a new customer-activated connection."
</output>
</example>

<example>
<input>Agent inferred 8 values from user's description and needs to present them.</input>
<output>
WRONG: silently write all 8 values, then say "All required questions answered. Let me move to scaffolding."

RIGHT: Present each inference grouped by theme:

"**Trigger → webhook** — Shopify pushes order events via HTTP, so we receive them as webhooks rather than polling. This means the platform generates a webhook URL per flow.

**Flow count → 3** — One flow per event type (orders/create, refunds/create, fulfillments/create). Each gets its own handler with specific field mapping logic.

**Deploy hooks → Yes** — You asked for webhook auto-registration on deploy. That's onInstanceDeploy and onInstanceDelete lifecycle hooks."

Then ask: "Does this look right? Anything I got wrong?"
Wait for user confirmation before writing.
</output>
</example>
