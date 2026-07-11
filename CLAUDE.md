<orchestration>
## Agent Orchestration: cni-builder ↔ Orby

When the cni-builder agent (spawned by `/build-integration` or `/modify-integration`) outputs
a request for Orby, follow this pattern:

1. The cni-builder will output a message containing `<orby-request>` tags with a specific task
2. Invoke the Orby skill: `Skill("prismatic-skills:orby", "<the task from the request>")`
3. Orby runs with its MCP tools and returns results
4. Resume the cni-builder via `SendMessage` with Orby's results

Example:
```
cni-builder output: "I need platform help.
<orby-request>Fetch the last 5 execution logs for the github-zendesk-sync integration</orby-request>"

You should then:
1. Invoke Skill("prismatic-skills:orby", "Fetch the last 5 execution logs for the github-zendesk-sync integration")
2. SendMessage to the cni-builder agent with Orby's response
```

Do NOT ask the user to invoke Orby manually — handle the handoff automatically.
</orchestration>

<skill-authoring>
When creating or editing a skill (`plugin/skills/**`), read `docs/skill-authoring-rubric.md`.
</skill-authoring>
