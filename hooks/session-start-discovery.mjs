/**
 * SessionStart hook: reads tool-manifest.json and injects a tool registry
 * so agents auto-discover available synthetic tools and know which tools
 * require explicit invocation.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, "tool-manifest.json");

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
} catch {
  process.stdout.write("{}");
  process.exit(0);
}

// --- Build synthetic tools section ---
const syntheticLines = Object.entries(manifest.synthetic)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, entry]) => {
    const usage = entry.usage ? ` ${entry.usage}` : "";
    return `- \`prismatic-tools ${name}${usage}\` — ${entry.desc}`;
  })
  .join("\n");

// --- Build explicit tools section ---
const explicitLines = Object.entries(manifest.explicit)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, reason]) => `- \`${name}\` — ${reason}`)
  .join("\n");

// --- Compose context ---
const context = `## Prismatic Synthetic Tools

<synthetic-tools>
Call these as Bash commands. They auto-execute with no permission prompt.
When a tool accepts \`--session <name>\`, ALWAYS use it instead of passing full file paths.
The session name comes from the prerequisites output (e.g., "sftp-csv-to-mysql").

When calling these tools, set the Bash \`description\` parameter to explain the PURPOSE, not the tool name.
Good: "Searching for SFTP components" · Bad: "run find-components"
Good: "Recording trigger type answer" · Bad: "write record-choices"

${syntheticLines}
</synthetic-tools>

<explicit-tools>
## Explicit Tools (require confirmation)

These must be invoked via \`npx tsx \${CLAUDE_PLUGIN_ROOT}/scripts/run.ts <name> [args]\`.
Do NOT use the \`prismatic-tools\` prefix for these — they need user confirmation.

${explicitLines}
</explicit-tools>`;

// --- Output ---
const result = {
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: context,
  },
};

process.stdout.write(JSON.stringify(result));
