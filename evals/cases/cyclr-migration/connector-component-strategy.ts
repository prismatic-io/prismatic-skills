import { defineEvalCase, type Run, toolCalls } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Non-tautology: the prompt never contains components:list, --filter=public=true, or
// createClient — those come from the skill's connector-mapping guidance, and the connector
// names only from the fixture. Predicate + regex force citing the command without executing it.
export default defineEvalCase({
  id: "cyclr-migration/connector-component-strategy",
  prompt: withSkill(
    "cyclr-migration",
    `A Cyclr export has already been parsed into ./parsed-export.json in the current
working directory. Read that file to see which connectors the cycle uses. Per the
migration skill's connector mapping guidance, what is the recommended way to implement
each of those connectors when building the Prismatic Code Native Integration? Do NOT run
any parsers, the prism CLI, or any platform tool — base your answer only on the parsed
export that is present.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("cyclr-migration")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 2,
  }),
  fixtures: { kind: "dir", path: "cyclr-parsed-export" },
  ...scripted,
  assertions: [
    {
      type: "glob-count",
      glob: "**/parsed-export.json",
      min: 1,
      name: "the parsed export was staged into the working dir",
    },
    {
      type: "regex",
      name: "cites the registry-discovery command with its public filter",
      pattern: "components:list[\\s\\S]{0,40}public=true",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "cited the prism CLI without executing it",
      // No prism_* MCP tool call and no `prism <sub>` Bash call.
      fn: (run: Run) =>
        !calledPlatform(run) &&
        !toolCalls(run)
          .filter((c) => c.name === "Bash")
          .some((c) =>
            /\bprism\s+(components|graphql|integrations|instances)\b/.test(
              JSON.stringify(c.input ?? {}),
            ),
          ),
    },
    {
      type: "rubric",
      name: "registry-first strategy with createClient as the niche fallback",
      criteria:
        "Reads the staged parsed-export.json, identifies both connectors (Salesforce and HubSpot), and recommends searching the Prismatic component registry first (prism components:list --filter=public=true) because common SaaS platforms likely have prebuilt public components — reserving direct HTTP via createClient for niche/proprietary connectors; it does not execute the prism CLI and does not conclude every connector must be hand-built with raw HTTP.",
    },
  ],
  meta: {
    skill: "cyclr-migration",
    tags: ["migration", "cyclr", "fixtures", "component-strategy"],
  },
});
