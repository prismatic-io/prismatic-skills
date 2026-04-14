/**
 * PreToolUse hook for Bash commands. Handles TWO concerns:
 *
 * 1. Synthetic tool dispatch — intercepts prismatic<name> commands, runs the
 *    real script via run.ts, returns output via updatedInput (auto-allow).
 * 2. Destructive action gating — asks for confirmation on scaffold/deploy.
 *
 * Combined into one hook to avoid chaining issues where a second hook's
 * passthrough output could override the first hook's updatedInput.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(__dirname);
const MANIFEST_PATH = join(__dirname, "tool-manifest.json");

function deny(reason) {
  const out = {
    hookSpecificOutput: {
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
  process.stderr.write(JSON.stringify(out));
  process.exit(2);
}

function ask(reason) {
  const out = {
    hookSpecificOutput: {
      permissionDecision: "ask",
      permissionDecisionReason: reason,
    },
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// --- Read stdin ---
let input;
try {
  input = JSON.parse(readFileSync(0, "utf-8"));
} catch {
  process.stdout.write("{}");
  process.exit(0);
}

const command = input?.tool_input?.command ?? "";

// =============================================
// 1. Synthetic tool dispatch (prismatic prefix)
// =============================================
// Match with or without ANSI color codes
const PREFIX = "prismatic-tools ";

if (command.startsWith(PREFIX)) {
  const remainder = command.slice(PREFIX.length);
  const spaceIdx = remainder.indexOf(" ");
  const toolName = spaceIdx === -1 ? remainder : remainder.slice(0, spaceIdx);
  const toolArgs = spaceIdx === -1 ? "" : remainder.slice(spaceIdx + 1);

  // Reject chained commands — each prismatic-tools call must be a separate Bash command
  if (toolArgs.includes("&&") || toolArgs.includes("; prismatic")) {
    deny("Cannot chain multiple prismatic-tools calls in one command. Run each as a separate Bash command.");
  }

  // Load manifest
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    deny(`Tool manifest not found at ${MANIFEST_PATH}`);
  }

  // Look up in synthetic section
  const entry = manifest.synthetic?.[toolName];

  if (!entry) {
    const explicitReason = manifest.explicit?.[toolName];
    if (explicitReason) {
      deny(
        `'${toolName}' requires explicit invocation via npx tsx. Reason: ${explicitReason}`
      );
    }
    deny(
      `Unknown synthetic tool: '${toolName}'. Use prismatic-tools <name> where name is a registered synthetic tool.`
    );
  }

  const scriptName = entry.script;
  const timeout = (entry.timeout ?? 30) * 1000;

  // Execute via run.ts
  const runScript = join(PLUGIN_ROOT, "scripts", "run.ts");
  const cmd = toolArgs
    ? `npx tsx "${runScript}" ${scriptName} ${toolArgs}`
    : `npx tsx "${runScript}" ${scriptName}`;

  const startMs = Date.now();
  let stdout;
  try {
    stdout = execSync(cmd, {
      timeout,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    if (err.killed) {
      deny(`Tool '${toolName}' timed out after ${entry.timeout ?? 30}s`);
    }
    // Tools with allowNonZeroExit return their output even on non-zero exit
    // (e.g., validate-phase exits 1 with structured JSON about gaps — that's informational)
    if (entry.allowNonZeroExit && !err.killed) {
      stdout = (err.stdout || "") + (err.stderr || "");
    } else {
      const output = (err.stdout || "") + (err.stderr || "");
      const preview = output.split("\n").slice(0, 5).join(" ").slice(0, 500);
      deny(`Tool '${toolName}' failed (exit ${err.status ?? 1}) after ${elapsed}s: ${preview}`);
    }
  }
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

  // Write result to temp file with plain header, rewrite command to cat it
  const pluginManifest = JSON.parse(readFileSync(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  const version = pluginManifest.version || "N/A";
  const desc = entry.desc || "";

  // Title Case the tool name: "update-tasks" → "Update Tasks"
  const titleCase = toolName
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const header =
    `Prismatic Skills v${version} · ${titleCase} · ${elapsed}s\n` +
    (desc ? `${desc}\n` : "") +
    `${"─".repeat(40)}\n`;
  const tmpFile = join(tmpdir(), `tool-result-${process.pid}.txt`);
  writeFileSync(tmpFile, header + stdout);

  const result = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput: {
        command: `${process.platform === "win32" ? "type" : "cat"} "${tmpFile}"`,
      },
    },
  };

  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}

// =============================================
// 2. Destructive action gating (non-prismatic)
// =============================================
if (command.includes("scaffold-project") || command.includes("scaffold-component")) {
  ask("Scaffolding creates project files on disk.");
} else if (command.includes("deploy-integration")) {
  ask("Deploying pushes code to the Prismatic platform.");
} else if (command.includes("publish-component")) {
  ask("Publishing pushes the component to the Prismatic platform.");
}

// No output + exit 0 = passthrough for all other commands
