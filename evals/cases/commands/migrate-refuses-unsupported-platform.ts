import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, PLUGIN_DIR, scripted } from "../_support.ts";

// Scope refusal: the prompt names only "Workato" — "Boomi"/"Cyclr" land only by reading
// the command's detect-platform step, so the regexes aren't echoes. The predicate proves
// the refusal fires before any platform call or detect-platform run.
export default defineEvalCase({
  id: "commands/migrate-refuses-unsupported-platform",
  prompt: `/prismatic-skills:migrate-integration I have a Workato recipe export saved at
./workato-export. Before running anything against my account or on disk, answer one
question first: does this migration command actually support Workato exports, or is it
restricted to certain source platforms? Don't run any scripts or parsers yet — I only
want to know whether Workato is in scope.`,
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
      name: "names Boomi as a supported source platform",
      pattern: "Boomi",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "names Cyclr as the other supported source platform",
      pattern: "Cyclr",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "refused before running detect-platform / parse-export / any platform call",
      // Match executing the tools, not merely mentioning them: grepping the plugin
      // source legitimately puts "detect-platform" in a tool input.
      fn: (run: Run) =>
        !calledPlatform(run) &&
        !toolCallInputs(run).some((i) =>
          /(?:prismatic-tools|run\.ts)[^"]*(?:detect-platform|parse-export)/.test(i),
        ),
    },
    {
      type: "rubric",
      name: "declares Boomi+Cyclr only, refuses Workato, runs nothing",
      criteria:
        "The response states this migration command supports only Boomi and Cyclr as source platforms and that a Workato export is out of scope; it declines to proceed and does not run detect-platform, parse the export, call prism_* MCP tools, or fabricate a migration plan.",
    },
  ],
  meta: {
    command: "migrate-integration",
    priority: "P1",
    tags: ["command", "migrate", "scope", "refusal"],
  },
});
