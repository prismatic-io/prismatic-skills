import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir } from "../_support.ts";

// Pins the no-component-found rule: surface both paths (custom component vs direct HTTP)
// and defer the architectural choice to the user. Non-tautology: the prompt never says
// "custom component" or "HTTP", so the regex proves the agent supplied the options.
export default defineEvalCase({
  id: "agents/cni-builder-no-component-found",
  prompt: `We searched the Prismatic component registry for the 'Blorptech' system and it
came back empty — there's no Prismatic component for Blorptech. Don't run anything right
now — just walk me through what happens next and how you want to proceed.`,
  driver: claudeCode({
    agent: "cni-builder",
    readDirs: [skillDir("integration-patterns")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "offers building a custom component first as an option",
      // Allows a system name between the words, e.g. "custom Blorptech component".
      pattern: "custom\\s+(\\w+\\s+)?component",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "ran nothing",
      fn: (run: Run) =>
        !calledPlatform(run) && !toolCallInputs(run).some((i) => i.includes("prismatic-tools")),
    },
    {
      type: "rubric",
      name: "presents both paths and defers the choice to the user",
      criteria:
        "Because no Prismatic component was found, the agent presents the architectural options and asks the user to choose: (1) research the API and build direct HTTP calls, or (2) build a custom Prismatic component first; it treats the choice as the user's and does NOT unilaterally commit to HTTP without asking. An answer that simply declares it will proceed with HTTP without offering the custom-component alternative and asking, fails.",
    },
  ],
  meta: {
    agent: "cni-builder",
    priority: "P1",
    tags: ["cni-builder", "no-component-found", "decision"],
  },
});
