import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

export default defineEvalCase({
  id: "integration-patterns/scheduled-http-to-slack",
  prompt: withSkill(
    "integration-patterns",
    `Scaffold a Code Native Integration with a single flow that is triggered on a
schedule, reads data from an HTTP endpoint using a Basic Auth connection, and
posts a message to Slack. Use the standard componentRegistry + manifest
pattern. Write the files into the current directory.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("integration-patterns")],
    idleTimeoutMs: 300_000,
    maxInterrupts: 6,
  }),
  ...scripted,
  assertions: [
    { type: "glob-count", glob: "**/*.ts", min: 2 },
    {
      type: "command-exits-zero",
      name: "invokes componentManifests()",
      command: 'grep -rq --exclude-dir=node_modules "componentManifests(" .',
    },
    {
      type: "command-exits-zero",
      name: "uses config wrapper functions",
      command:
        'grep -rqE --exclude-dir=node_modules "connectionConfigVar\\(|configVar\\(|dataSourceConfigVar\\(" .',
    },
    {
      type: "command-exits-zero",
      name: "does not reach for a raw HTTP lib instead of a component",
      command:
        '! grep -rqE --exclude-dir=node_modules "from [\'\\"](axios|node-fetch|got|undici)[\'\\"]" .',
    },
    {
      type: "rubric",
      name: "manifest action invocation pattern",
      criteria:
        'Component actions are invoked via imported manifest actions (e.g. `import fooActions from "./manifests/foo/actions"` then `await fooActions.someAction.perform({...})`) — not via raw HTTP in place of an available component, and not referenced by string keys. Config pages use the wrapper functions configVar / connectionConfigVar / dataSourceConfigVar, never raw object literals.',
    },
  ],
  meta: { skill: "integration-patterns", tags: ["cni", "schedule", "slack"] },
});
