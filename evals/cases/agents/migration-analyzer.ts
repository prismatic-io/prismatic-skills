import { defineEvalCase } from "@prismatic-io/lux";
import { AGENTS_DIR, claudeCode, scripted, skillDir } from "../_support.ts";

// Pins deterministic-first (read the staged parsed-export.json, run no parsers) and
// no-component-preemption (report systems/auth/API only, never pick a component).
// Non-tautology: "Sync New Leads" and <migration-plan> exist only in the fixture/agent.
export default defineEvalCase({
  id: "agents/migration-analyzer",
  prompt: `A Cyclr integration export has already been parsed into ./parsed-export.json
in the current working directory. Analyze THAT file into the standard integration
schema and present the migration plan. Do not run any external parsers, diagram
generators, or other platform tools — ground everything in the parsed export that is
already present.`,
  driver: claudeCode({
    agent: "migration-analyzer",
    readDirs: [skillDir("migration-framework"), skillDir("cyclr-migration")],
    idleTimeoutMs: 300_000,
    maxInterrupts: 2,
  }),
  fixtures: { kind: "dir", path: "analyzer-parsed-export" },
  ...scripted,
  assertions: [
    { type: "glob-count", glob: "**/parsed-export.json", min: 1, name: "parsed export was staged" },
    { type: "tool-called", name: "Read", minTimes: 1 },
    {
      type: "regex",
      name: "presents the plan in the agent's <migration-plan> XML format",
      pattern: "<migration-plan",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "names the actual cycle found in the staged export",
      pattern: "Sync New Leads",
      against: "transcript-all",
    },
    {
      type: "not-contains",
      name: "does not preempt component selection with 'HTTP component'",
      text: "HTTP component",
      against: "transcript-all",
    },
    {
      type: "not-contains",
      name: "does not preempt component selection with 'HTTP Component'",
      text: "HTTP Component",
      against: "transcript-all",
    },
    {
      type: "command-exits-zero",
      name: "static: migration-analyzer frontmatter declares the cyclr-migration and migration-framework skills",
      command: `f='${AGENTS_DIR}/migration-analyzer.md'; grep -Eq '^[[:space:]]*-[[:space:]]*cyclr-migration' "$f" && grep -Eq '^[[:space:]]*-[[:space:]]*migration-framework' "$f"`,
      timeoutMs: 15_000,
    },
    {
      type: "rubric",
      name: "grounded schema; reports systems without preempting a component choice",
      criteria:
        "The analysis is grounded in the staged parsed-export.json: it identifies the 'Sync New Leads' cycle, reports the two systems (Salesforce source with oauth2, HubSpot destination with api_key) and the polling trigger, and represents mappings/steps as populated arrays (not string placeholders). CRUCIALLY it must NOT recommend or decide a Prismatic component — no 'we'll use the HTTP component', 'use direct HTTP', or 'use direct API calls'; component selection is left to the build flow. It reports system names, auth types, and API patterns only.",
    },
  ],
  meta: {
    agent: "migration-analyzer",
    priority: "P0",
    tags: ["migration-analyzer", "cyclr", "no-component-preemption"],
  },
});
