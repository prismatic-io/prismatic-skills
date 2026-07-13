import { defineEvalCase } from "@prismatic-io/lux";
import { AGENTS_DIR, claudeCode, scripted, skillDir } from "../_support.ts";

// Pins the API Research handoff: with the docs URL known and no existing component,
// component-builder spawns external-api-researcher with BOTH the URL and the
// api-research.json output path. Non-tautology: the prompt names neither identifier.
export default defineEvalCase({
  id: "agents/component-builder-researcher-spawn",
  prompt: `We're building a custom Prismatic component for "Widgetco". I've already
confirmed there is no existing Prismatic component for it, and here are its API docs:
https://developers.widgetco.com/reference . What is your very next step before writing
any code? Name the specific sub-agent you hand off to and the exact output artifact it
produces, and state this as your definitive plan — don't run any setup scripts or
actually spawn anything yet, and don't ask me to confirm.`,
  driver: claudeCode({
    agent: "component-builder",
    readDirs: [skillDir("component-patterns")],
    idleTimeoutMs: 150_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "names the external-api-researcher agent as the handoff",
      pattern: "external-api-researcher",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "hands the researcher an api-research.json output path",
      pattern: "api-research\\.json",
      against: "transcript-all",
    },
    {
      type: "command-exits-zero",
      name: "static: component-builder frontmatter declares AskUserQuestion and the component-patterns skill",
      command: `f='${AGENTS_DIR}/component-builder.md'; grep -Eq '^tools:.*AskUserQuestion' "$f" && grep -Eq '^[[:space:]]*-[[:space:]]*component-patterns' "$f"`,
      timeoutMs: 15_000,
    },
    {
      type: "rubric",
      name: "next step is to spawn the researcher with URL + output path, not to guess the API",
      criteria:
        "The agent's next step is to hand the Widgetco API off to a dedicated research sub-agent, passing it BOTH the docs URL (https://developers.widgetco.com/reference) AND an output location for the structured JSON research, and to wait for those results before making downstream decisions. The agent must NOT fabricate the Widgetco API's auth method, endpoints, or webhook support from memory, and must NOT start writing component code yet. Grade only on that substance: it is fine if the agent uses a role name like 'API researcher' rather than the exact agent id, and fine if it offers to proceed — do not fail it for either.",
    },
  ],
  meta: {
    agent: "component-builder",
    priority: "P0",
    tags: ["component-builder", "api-research", "handoff"],
  },
});
