import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins the documented code-native agentic-flow example. Non-tautology: the prompt says
// only "AI agent" / "tool" / "property" — isAgentFlow and schemas.invoke come only from
// the doc, so matching them proves the answer is grounded there.
export default defineEvalCase({
  id: "prismatic-docs/agentic-flow-tool",
  prompt: withSkill(
    "prismatic-docs",
    `Find a Prismatic example showing how to build a code-native flow that an AI agent
can invoke as a tool. Which flow property turns an ordinary flow into an agent-callable
tool, and what does the flow need to declare so the agent knows how to call it? Show the
example and cite where it comes from.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("prismatic-docs")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 3,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "cites a real prismatic.io/docs or github.com/prismatic-io URL",
      pattern: "prismatic\\.io/docs|github\\.com/prismatic-io",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "names the isAgentFlow flow property",
      pattern: "isAgentFlow",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "never fetched llms-full.txt",
      // Skill's hard rule (file exceeds 10MB, times out). Check tool inputs, not prose.
      fn: (run: Run) => !toolCallInputs(run).some((i) => i.includes("llms-full.txt")),
    },
    {
      type: "rubric",
      name: "isAgentFlow + schemas.invoke, real citation, nothing invented",
      criteria:
        "The response finds the documented code-native agentic flow example: it sets isAgentFlow: true on a flow(...) from @prismatic-io/spectral and declares an invocation schema under schemas.invoke; it cites a real prismatic.io/docs or github.com/prismatic-io URL, does NOT fetch llms-full.txt, and invents no flow properties absent from the documented API.",
    },
  ],
  meta: { skill: "prismatic-docs", tags: ["docs", "agentic-flow", "citation"] },
});
