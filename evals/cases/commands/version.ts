import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { claudeCode, PLUGIN_DIR, pluginVersion, scripted } from "../_support.ts";

// Read from the manifest at load time so the case tracks version bumps.
const VERSION = pluginVersion();

// Pins that /version dispatches the real `run.ts version-check` script and reports the
// version plugin.json pins. That version isn't in the prompt, so the regex isn't an
// echo — it only lands by running the script.
export default defineEvalCase({
  id: "commands/version",
  prompt: "/prismatic-skills:version",
  driver: claudeCode({ plugin: true, readDirs: [PLUGIN_DIR], idleTimeoutMs: 120_000 }),
  ...scripted,
  assertions: [
    {
      type: "predicate",
      name: "dispatched the real version-check script",
      // Check the tool-call stream, not prose — claiming a version without
      // running the script must fail.
      fn: (run: Run) => toolCallInputs(run).some((i) => i.includes("version-check")),
    },
    {
      type: "regex",
      name: `reports the version plugin.json pins (${VERSION})`,
      pattern: VERSION.replace(/\./g, "\\."),
      against: "transcript-all",
    },
  ],
  meta: { command: "version", tags: ["command", "version", "manifest", "ci"] },
});
