import { defineEvalCase, type Run, toolCalls } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins the literal triggerType: "polling" discriminant and the
// context.polling.getState/setState cursor API. Non-tautology: the prompt is behavioral
// only, so a plain scheduled flow — the tempting wrong answer — produces neither.
export default defineEvalCase({
  id: "integration-patterns/polling-trigger-cni",
  prompt: withSkill(
    "integration-patterns",
    `Scaffold a Code Native Integration flow that checks an external API every few
minutes for records created or updated since the last time it checked, and only runs
its main processing when there is genuinely new data. It must remember where it left
off between runs so it never reprocesses the same records. Use the standard
componentRegistry + manifest pattern for any component calls. Write the TypeScript
files into the current directory. Do NOT deploy the integration and do NOT check my
Prismatic auth — just produce the code.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("integration-patterns")],
    idleTimeoutMs: 300_000,
    maxInterrupts: 6,
  }),
  ...scripted,
  assertions: [
    {
      type: "command-exits-zero",
      name: 'sets the polling trigger discriminant triggerType: "polling"',
      command: `grep -rqE --exclude-dir=node_modules "triggerType:[[:space:]]*[\\"']polling[\\"']" .`,
    },
    {
      type: "command-exits-zero",
      name: "uses context.polling.getState/setState for the cursor",
      command:
        'grep -rq --exclude-dir=node_modules "polling.getState" . && grep -rq --exclude-dir=node_modules "polling.setState" .',
    },
    {
      type: "predicate",
      name: "did not deploy or check auth",
      // Checks what the agent EXECUTED (prism_* MCP calls, Bash), not what it wrote.
      // A Bash command matching 2+ tokens is the agent grepping this list, not deploying.
      fn: (run: Run) => {
        if (calledPlatform(run)) return false;
        const tokens = [
          "integrations:import",
          "prism login",
          "instances:create",
          "graphql:query",
          "deploy-integration",
          "check-prism-access",
        ];
        return !toolCalls(run).some((c) => {
          if (c.name !== "Bash") return false;
          const cmd = JSON.stringify(c.input ?? {});
          return tokens.filter((t) => cmd.includes(t)).length === 1;
        });
      },
    },
    {
      type: "rubric",
      name: "polling trigger with cursor state + manifest actions, nothing deployed",
      criteria:
        'Judge the generated code and the agent\'s explanation. The flow is a polling trigger whose cursor logic reads the prior state and advances it so only records changed since the last poll reach onExecution (freshness gating), component calls go through imported manifest actions invoked with .perform(), and config elements use the wrapper functions rather than raw objects. The agent writes the implementation to files rather than pasting every line into the reply — do NOT penalize a detail merely because its code lives in a written file instead of the prose; separate checks already verify triggerType: "polling", context.polling.getState/setState, and that nothing was deployed. Fail only for an actually-wrong approach (a plain scheduled flow with no polling cursor, reprocessing all records, raw-object config, or deploying).',
    },
  ],
  meta: { skill: "integration-patterns", tags: ["cni", "polling", "trigger", "state"] },
});
