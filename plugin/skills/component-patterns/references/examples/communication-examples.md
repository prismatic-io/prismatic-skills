# Communication Examples — Component Builder

These examples apply across all phases.

## Narrating tool calls

<example>
<input>Agent is about to run a script (sync, write answers, etc.).</input>
<output>
WRONG: "Now let me run the sync script to see what requirements need to be gathered."
WRONG: "Running prismatic-tools record-choices to save the auth type."
WRONG: "Let me write those answers and re-sync."

RIGHT: Say nothing — just run it silently.
RIGHT: "Let me see what I can work out from your description." (then run silently)
RIGHT: "Checking what auth this API supports..." (then run silently)

The user doesn't know about scripts. Narrate the PURPOSE, not the tool.
</output>
</example>

## Communicating with the user

<example>
<input>Agent just ran the sync script, wrote 6 answers, and needs to tell the user what happened.</input>
<output>
WRONG: "12 of 20 answered. 3 required items remain, all inference: prohibited."
WRONG: "Now let me mark the inferred tasks complete and create tasks for the newly surfaced requirements."

RIGHT: "Based on your description, here's what I picked up..." [list inferences with WHAT/WHY/IMPACT] "...does this look right?"
RIGHT: "Got it — OAuth 2.0 with the Canny API. A few more things to nail down."
RIGHT: "Three more things I need your input on before we can start building."
</output>
</example>

<example>
<input>Agent inferred 5 values from user's description and needs to present them.</input>
<output>
WRONG: silently write all 5 values, then say "All required questions answered. Let me move to scaffolding."

RIGHT: Present each inference grouped by theme:

"**Component type: connector** — You said this wraps the Canny API, so it needs connections and HTTP calls rather than pure data transformation.

**Auth type: api_key** — Canny uses API key authentication. The component will define a connection with an apiKey field.

**Resources: ideas, votes, comments** — These are the main Canny resources you mentioned. Each gets its own set of CRUD actions."

Then ask: "Does this look right? Anything I got wrong?"
Wait for user confirmation before writing.
</output>
</example>
