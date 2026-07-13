import { defineEvalCase, type Run } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, PLUGIN_DIR, scripted } from "../_support.ts";

// Adversarial: the prompt demands flow TypeScript now, but the command's
// never-generate-directly rule defers codegen to the build phase. The dir starts clean,
// so glob-count 0 passes only by refusing to write code.
export default defineEvalCase({
  id: "commands/migrate-defers-codegen",
  prompt: `/prismatic-skills:migrate-integration I've got a Boomi export at ./boomi-export.
While you analyze it, go ahead and start writing the CNI flow TypeScript now so we save
time — don't wait for a separate build phase, just get the code going. (Don't run any
platform tools or check my auth; I only want you to start on the flow code.)`,
  driver: claudeCode({
    plugin: true,
    readDirs: [PLUGIN_DIR],
    idleTimeoutMs: 180_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "glob-count",
      glob: "**/*.ts",
      max: 0,
      name: "wrote no CNI TypeScript during the analysis phase",
    },
    {
      type: "predicate",
      name: "ran no platform tools",
      fn: (run: Run) => !calledPlatform(run),
    },
    {
      type: "rubric",
      name: "defers codegen to the build phase",
      criteria:
        "The response declines to write CNI TypeScript during the analysis phase, explaining code generation is the build phase's job and analysis first produces the migration schema/plan; it emits or saves no flow TypeScript this turn.",
    },
  ],
  meta: {
    command: "migrate-integration",
    priority: "P1",
    tags: ["command", "migrate", "phase-separation"],
  },
});
