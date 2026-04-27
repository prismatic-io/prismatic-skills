/**
 * PreToolUse hook for Bash commands.
 * Requires user confirmation for scaffold and deploy operations.
 * Reads tool input from stdin (JSON with tool_input.command).
 */
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf-8"));
const command = input?.tool_input?.command ?? "";

if (command.includes("scaffold-project.ts")) {
  const out = { hookSpecificOutput: { permissionDecision: "ask", permissionDecisionReason: "Scaffolding creates project files on disk." } };
  process.stdout.write(JSON.stringify(out));
} else if (command.includes("deploy-integration.ts")) {
  const out = { hookSpecificOutput: { permissionDecision: "ask", permissionDecisionReason: "Deploying pushes code to the Prismatic platform." } };
  process.stdout.write(JSON.stringify(out));
}
// No output + exit 0 = allow (passthrough for all other commands)
