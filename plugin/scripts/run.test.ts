import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * run.ts is the dispatcher every synthetic tool goes through. Two things must hold: it
 * enumerates the scripts it knows, and it fails loudly (with a suggestion) on a bad name.
 * Plus a structural invariant: buildIndex resolves a bare name to the FIRST matching dir,
 * so a basename in two search dirs would silently shadow one script.
 */

const SCRIPTS_DIR = import.meta.dirname;
const RUN = join(SCRIPTS_DIR, "run.ts");
// Mirror run.ts's SEARCH_DIRS.
const SEARCH_DIRS = ["", "integrations", "shared", "components", "migration"].map((d) =>
  d ? join(SCRIPTS_DIR, d) : SCRIPTS_DIR,
);

describe("run.ts dispatcher", () => {
  test("--list enumerates real scripts and omits colocated tests", () => {
    const r = spawnSync("npx", ["tsx", RUN, "--list"], { encoding: "utf-8" });
    expect(r.status).toBe(0);
    const listed = r.stdout;
    for (const name of [
      "detect-platform",
      "parse-cyclr-export",
      "generate-mermaid-diagrams",
      "schema-to-answers",
      "find-components",
    ]) {
      expect(listed).toContain(name);
    }
    // *.test.ts files must never surface as dispatchable tools.
    expect(listed).not.toContain(".test");
  });

  test("an unknown script name exits non-zero with a suggestion", () => {
    // "detect" is not a script, but fuzzy-matches detect-platform.
    const r = spawnSync("npx", ["tsx", RUN, "detect"], { encoding: "utf-8" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("Unknown script");
    expect(r.stderr).toContain("detect-platform");
  });

  test("no basename collides across the dispatcher's search dirs", () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const dir of SEARCH_DIRS) {
      let files: string[];
      try {
        files = readdirSync(dir);
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
        if (dir === SCRIPTS_DIR && f === "run.ts") continue; // buildIndex skips itself
        const name = basename(f, ".ts");
        const prior = seen.get(name);
        if (prior) collisions.push(`${name}: ${prior} vs ${dir}`);
        else seen.set(name, dir);
      }
    }
    expect(collisions).toEqual([]);
  });
});
