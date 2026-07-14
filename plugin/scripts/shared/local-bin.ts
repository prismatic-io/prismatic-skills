/** Resolve an executable from a project's own dependency tree so its lockfile-pinned version runs. */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface LocalBin {
  command: string;
  args: string[];
}

// Constrain so a key can't read as a flag, path, or shell syntax.
const COMPONENT_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function isValidComponentKey(key: string): boolean {
  return COMPONENT_KEY_PATTERN.test(key);
}

export function resolveLocalBin(
  projectDir: string,
  packageName: string,
  binName: string,
): LocalBin | null {
  try {
    const require = createRequire(pathToFileURL(join(resolve(projectDir), "noop.js")).href);
    const pkgJsonPath = require.resolve(`${packageName}/package.json`);
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as {
      bin?: string | Record<string, string>;
    };
    const binRelative = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.[binName];
    if (!binRelative) return null;
    const binPath = join(dirname(pkgJsonPath), binRelative);
    if (!existsSync(binPath)) return null;
    return { command: process.execPath, args: [binPath] };
  } catch {
    return null;
  }
}
