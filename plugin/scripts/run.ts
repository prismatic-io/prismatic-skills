#!/usr/bin/env npx tsx

/** Resolves script basenames across script directories and forwards remaining arguments unchanged. */

import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { type CliConfig, parseCliArgs } from "./shared/cli-help.js";

const CLI = {
  command: "prismatic-tools",
  description: "Run a Prismatic development script by name.",
  positionals: [{ name: "script-name" }, { name: "args", variadic: true }],
  options: [{ name: "list", type: "boolean", description: "List available scripts." }],
} as const satisfies CliConfig;

const SCRIPTS_DIR = new URL(".", import.meta.url).pathname;

const SEARCH_DIRS = [
  SCRIPTS_DIR, // root scripts
  join(SCRIPTS_DIR, "integrations"),
  join(SCRIPTS_DIR, "shared"),
  join(SCRIPTS_DIR, "components"),
  join(SCRIPTS_DIR, "migration"),
];

/** Build a map of script basename (no .ts) → full path. */
function buildIndex(): Map<string, string> {
  const index = new Map<string, string>();

  for (const dir of SEARCH_DIRS) {
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }

    for (const f of files) {
      if (!f.endsWith(".ts")) continue;
      if (f.endsWith(".test.ts")) continue; // colocated tests aren't dispatchable
      const full = join(dir, f);
      // Skip directories and this file
      try {
        if (!statSync(full).isFile()) continue;
      } catch {
        continue;
      }
      if (full === join(SCRIPTS_DIR, "run.ts")) continue;

      const name = basename(f, ".ts");
      // First match wins (root > integrations > shared > components)
      if (!index.has(name)) {
        index.set(name, full);
      }
    }
  }

  return index;
}

function main(): number {
  const rawArgs = process.argv.slice(2);
  const dispatcherArgs = rawArgs[0]?.startsWith("-") ? rawArgs : rawArgs.slice(0, 1);
  const { values, positionals } = parseCliArgs(dispatcherArgs, CLI);

  const index = buildIndex();

  if (values.list) {
    const grouped: Record<string, string[]> = {};
    for (const [name, path] of index) {
      const rel = path.replace(SCRIPTS_DIR, "");
      const parts = rel.split(/[/\\]/);
      const dir = parts.length > 1 ? parts[0] : "(root)";
      if (!grouped[dir]) grouped[dir] = [];
      grouped[dir].push(name);
    }
    for (const [dir, scripts] of Object.entries(grouped).sort()) {
      console.log(`\n${dir}:`);
      for (const s of scripts.sort()) {
        console.log(`  ${s}`);
      }
    }
    return 0;
  }

  const scriptName = positionals[0];
  if (!scriptName) {
    console.error("Run with --help for usage or --list to see available scripts.");
    return 2;
  }
  const scriptArgs = rawArgs.slice(1);

  const scriptPath = index.get(scriptName);
  if (!scriptPath) {
    console.error(`Unknown script: "${scriptName}"`);

    // Fuzzy match
    const candidates = [...index.keys()].filter(
      (k) => k.includes(scriptName) || scriptName.includes(k),
    );
    if (candidates.length > 0) {
      console.error(`Did you mean: ${candidates.join(", ")}?`);
    }
    return 2;
  }

  try {
    execFileSync("npx", ["tsx", scriptPath, ...scriptArgs], {
      stdio: "inherit",
      timeout: 600_000,
    });
    return 0;
  } catch (e) {
    const err = e as { status?: number };
    return err.status ?? 1;
  }
}

process.exit(main());
