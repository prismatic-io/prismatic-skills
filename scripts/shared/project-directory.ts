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

import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function getProjectRoot(): string {
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

export function getSessionDirectory(
  name: string,
  sessionType = "components"
): string {
  return join(getProjectRoot(), ".prismatic", "sessions", sessionType, name);
}

export function ensureSessionDirectory(
  name: string,
  sessionType = "components"
): string {
  const sessionDir = getSessionDirectory(name, sessionType);
  mkdirSync(sessionDir, { recursive: true });
  return sessionDir;
}

export function getComponentDirectory(componentName: string): string {
  return join(getProjectRoot(), componentName);
}
