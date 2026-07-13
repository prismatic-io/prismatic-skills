import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, PLUGIN_DIR, scripted } from "../_support.ts";

// The prompt withholds the project path and contains none of the asserted strings, so
// the regexes only pass when the discovery method comes from the command's Phase 1
// markers or the plugin's locate-project helper.
export default defineEvalCase({
  id: "commands/modify-locates-project",
  prompt: `/prismatic-skills:modify-integration I want to modify one of my existing
Prismatic Code Native Integrations, but I'm deliberately not going to tell you where the
project lives on disk. Before you run anything or touch my account, walk me through
exactly how you'll locate the integration project in my workspace. Don't execute any
commands yet — just explain the method you'll use to find it.`,
  driver: claudeCode({
    plugin: true,
    readDirs: [PLUGIN_DIR],
    idleTimeoutMs: 180_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "looks for a package.json depending on @prismatic-io/spectral",
      pattern: "@prismatic-io/spectral",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "checks .prismatic named projects or uses the locate-project helper",
      // The locate-project helper performs this same discovery, so naming it is
      // as grounded as naming the directory.
      pattern: "\\.prismatic\\b|locate-project",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "explained the method without executing anything",
      fn: (run: Run) =>
        !calledPlatform(run) && !toolCallInputs(run).some((i) => i.includes("extract-state")),
    },
    {
      type: "rubric",
      name: "all three grounded discovery steps, no hallucinated platform lookup",
      criteria:
        "The response explains it will locate the project via grounded local discovery: searching the working directory for a package.json depending on @prismatic-io/spectral, looking for a src/index.ts exporting an integration(), and checking the .prismatic named-projects directory. Describing the plugin's own locate-project helper (prismatic-tools locate-project), which performs this same discovery, is equally correct and is NOT an invented tool. It must not invent a platform/API lookup (no remote calls to find the project) and runs no commands this turn.",
    },
  ],
  meta: {
    command: "modify-integration",
    priority: "P1",
    tags: ["command", "modify", "project-discovery"],
  },
});
