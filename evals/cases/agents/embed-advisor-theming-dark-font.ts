import { defineEvalCase, type Run, toolCallInputs, toolCalls } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir } from "../_support.ts";

// Pins theming: theme: "DARK" + fontConfiguration in code, actual colors in org settings,
// and no WebFetch of Prismatic docs. Non-tautology: the prompt says "dark mode" / "Inter"
// but never fontConfiguration, the uppercase "DARK" enum, or where colors live.
export default defineEvalCase({
  id: "agents/embed-advisor-theming-dark-font",
  prompt: `Our app is dark-themed and uses the Inter font everywhere. For the embedded
Prismatic marketplace, how do I force it into dark mode and make it use Inter so it
matches the rest of our UI? And where do the actual dark-mode colors get set? Don't run
anything against my org — just show me the code and explain.`,
  driver: claudeCode({
    agent: "embedded-advisor",
    readDirs: [skillDir("embedded-patterns")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "registers Inter via fontConfiguration",
      pattern: "fontConfiguration",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: 'forces dark mode with the uppercase theme: "DARK" enum',
      pattern: "theme\\s*[:=]\\s*[\"']DARK[\"']",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "did not run against the org or WebFetch Prismatic docs",
      fn: (run: Run) =>
        !toolCallInputs(run).some((i) =>
          /prism (organization|graphql|translations|integrations|components|me|login)/.test(i),
        ) &&
        !toolCalls(run)
          .filter((c) => c.name === "WebFetch")
          .some((c) => JSON.stringify(c.input ?? {}).includes("prismatic.io")),
    },
    {
      type: "rubric",
      name: "theme DARK + fontConfiguration in code; colors set in org settings",
      criteria:
        'The code forces dark mode via theme: "DARK" and registers Inter via fontConfiguration.google.families, and the agent ALSO explains the actual theme colors are configured in the Prismatic org settings under the Theme tab (Embedded Dark/Light), not in code — code only selects which theme mode is shown; it shows code only and neither runs against the org nor fetches Prismatic docs.',
    },
  ],
  meta: {
    agent: "embedded-advisor",
    priority: "P2",
    tags: ["embed-advisor", "theming", "decision"],
  },
});
