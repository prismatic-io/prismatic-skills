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

import { mkdirSync, existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
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

/**
 * Confine an LLM-supplied path to the workspace before it's used as a subprocess
 * cwd; realpath both sides so a symlink can't escape.
 */
export function confineToProjectRoot(candidate: string): string {
  const root = realpathSync(getProjectRoot());

  let target: string;
  try {
    target = realpathSync(resolve(candidate));
  } catch {
    throw new Error(`Directory not found: ${resolve(candidate)}`);
  }

  const rel = relative(root, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(
      `Refusing to operate on '${candidate}': it resolves outside the workspace (${root}). ` +
        `Run from the directory that contains the project, or move the project into the workspace.`,
    );
  }

  return target;
}
