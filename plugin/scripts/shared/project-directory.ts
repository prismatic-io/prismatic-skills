/**
 * project-directory.ts
 *
 * Utility to determine the plugin directory and session paths.
 *
 * Session Management:
 *   All sessions are stored relative to the current working directory:
 *   .prismatic/sessions/<type>/<name>/requirements.json
 *
 *   Types: components, integrations
 */

import { mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function getProjectRoot(): string {
  // Walk up from cwd to find the directory containing .prismatic/
  // This makes session paths work even when the agent cd's into subdirectories
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, ".prismatic"))) return dir;
    dir = dirname(dir);
  }
  // Fallback to cwd if no .prismatic/ found
  return process.cwd();
}

export function getPluginRoot(): string {
  const envRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (envRoot) return envRoot;
  // scripts/shared/project-directory.ts → scripts/shared → scripts → plugin root
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export function getSkillDirectory(): string {
  return getPluginRoot();
}

export function getSessionDirectory(name: string, sessionType = "components"): string {
  return join(getProjectRoot(), ".prismatic", "sessions", sessionType, name);
}

export function ensureSessionDirectory(name: string, sessionType = "components"): string {
  const sessionDir = getSessionDirectory(name, sessionType);
  mkdirSync(sessionDir, { recursive: true });
  return sessionDir;
}

export function getComponentDirectory(componentName: string): string {
  return join(getProjectRoot(), componentName);
}
