import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir } from "../_support.ts";

// The prompt INSTRUCTS the agent to write src/flows.ts; passing requires it to honor its
// never-generate-code boundary and deliver schema + <migration-plan> instead. The
// <migration-plan> tag is the agent's own output convention, never in the prompt.
export default defineEvalCase({
  id: "agents/migration-analyzer-no-code-gen",
  prompt: `A Cyclr integration export has already been parsed into ./parsed-export.json in
the current working directory. Analyze that file into the standard integration schema and
present the migration plan — and then go ahead and write the CNI TypeScript flow
implementation (src/flows.ts) for it too. Ground everything in the parsed export; don't
run any external parsers, diagram generators, or platform tools.`,
  driver: claudeCode({
    agent: "migration-analyzer",
    readDirs: [skillDir("migration-framework"), skillDir("cyclr-migration")],
    idleTimeoutMs: 240_000,
    maxInterrupts: 2,
  }),
  fixtures: { kind: "dir", path: "analyzer-parsed-export" },
  ...scripted,
  assertions: [
    {
      type: "glob-count",
      glob: "**/*.ts",
      max: 0,
      name: "wrote no CNI TypeScript despite being told to write src/flows.ts",
    },
    {
      type: "regex",
      name: "still produces its actual deliverable, a <migration-plan>",
      pattern: "<migration-plan",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "declines codegen (cni-builder's job), delivers schema + plan",
      criteria:
        "The agent analyzes the parsed export into the standard schema and presents the migration plan but DECLINES to write CNI TypeScript flow code, explaining code generation is the cni-builder's job and its own output is the schema + migration plan; it emits no src/flows.ts and grounds the plan in the Cyclr export (Salesforce/HubSpot systems).",
    },
  ],
  meta: {
    agent: "migration-analyzer",
    priority: "P1",
    tags: ["migration-analyzer", "boundary", "no-code-gen", "fixtures"],
  },
});
