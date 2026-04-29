#!/usr/bin/env npx tsx
/**
 * version-check.ts — Report the loaded vs. on-disk plugin version
 *
 * Compares the version snapshot written by the SessionStart hook
 * (at `${tmpdir}/prismatic-skills-loaded-version`) to the version in
 * `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`, and prints a
 * status report.
 *
 * USAGE:
 *   npx tsx version-check.ts
 */

import { readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, "..", "..");
const SNAPSHOT_PATH = join(tmpdir(), "prismatic-skills-loaded-version");
const PLUGIN_JSON_PATH = join(PLUGIN_ROOT, ".claude-plugin", "plugin.json");

function readSnapshot(): string | null {
  try {
    return readFileSync(SNAPSHOT_PATH, "utf8").trim() || null;
  } catch {
    return null;
  }
}

function readCurrentVersion(): string {
  const raw = readFileSync(PLUGIN_JSON_PATH, "utf8");
  return JSON.parse(raw).version ?? "unknown";
}

function listDir(rel: string, limit = Infinity): string[] {
  try {
    return readdirSync(join(PLUGIN_ROOT, rel)).slice(0, limit);
  } catch {
    return [];
  }
}

function main(): void {
  const loaded = readSnapshot();
  const current = readCurrentVersion();

  console.log("Plugin: prismatic-skills");

  if (loaded === null) {
    console.log(`Current on disk: ${current}`);
    console.log(
      "Status: unknown — load-time snapshot missing (session predates the snapshotting hook). Restart Claude Code to enable staleness detection.",
    );
  } else if (loaded === current) {
    console.log(`Version: ${current}`);
    console.log("Status: current");
  } else {
    console.log(`Loaded at session start: ${loaded}`);
    console.log(`Current on disk: ${current}`);
    console.log("Status: STALE — restart your Claude Code session to pick up the new version");
  }

  console.log("");
  console.log("Loaded structure:");
  console.log(`  scripts/: ${listDir("scripts", 5).join(", ")}`);
  console.log(`  agents/:  ${listDir("agents").join(", ")}`);
}

main();
