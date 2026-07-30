/** Resolve an executable from a project's own dependency tree so its lockfile-pinned version runs. */

import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export interface LocalBin {
  command: string;
  args: string[];
}

// Constrain so a key can't read as a flag, path, or shell syntax.
const COMPONENT_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function isValidComponentKey(key: string): boolean {
  return COMPONENT_KEY_PATTERN.test(key);
}

export async function resolveLocalBin(
  projectDir: string,
  packageName: string,
  binName: string,
): Promise<LocalBin | null> {
  try {
    if (!/^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/.test(packageName)) return null;
    const pkgJsonPath = join(
      resolve(projectDir),
      "node_modules",
      ...packageName.split("/"),
      "package.json",
    );
    const pkg = JSON.parse(await readFile(pkgJsonPath, "utf-8")) as {
      bin?: string | Record<string, string>;
    };
    const binRelative = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.[binName];
    if (!binRelative) return null;
    const packageRoot = await realpath(dirname(pkgJsonPath));
    const candidate = resolve(packageRoot, binRelative);
    const lexicalRel = relative(packageRoot, candidate);
    if (lexicalRel === ".." || lexicalRel.startsWith(`..${sep}`) || isAbsolute(lexicalRel)) {
      return null;
    }
    const binPath = await realpath(candidate);
    const resolvedRel = relative(packageRoot, binPath);
    if (
      resolvedRel === ".." ||
      resolvedRel.startsWith(`..${sep}`) ||
      isAbsolute(resolvedRel) ||
      !(await stat(binPath)).isFile()
    ) {
      return null;
    }
    return { command: process.execPath, args: [binPath] };
  } catch {
    return null;
  }
}
