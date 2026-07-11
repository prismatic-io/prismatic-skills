import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

/**
 * detect-platform sniffs an export directory and reports its migration source — the
 * first step of every migration, so a wrong answer derails everything downstream. Driven
 * black-box (CLI that exits on import) against the committed Boomi sample.
 */

const SCRIPT = join(import.meta.dirname, "detect-platform.ts");
// __fixtures__/boomi: two .xml files + one .groovy (ignored).
const BOOMI_SAMPLE = join(import.meta.dirname, "..", "__fixtures__", "boomi");

describe("detect-platform", () => {
  test("classifies the Boomi sample export with high confidence", () => {
    const r = spawnSync("npx", ["tsx", SCRIPT, BOOMI_SAMPLE], { encoding: "utf-8" });
    expect(r.status).toBe(0);
    const result = JSON.parse(r.stdout);
    expect(result.platform).toBe("boomi");
    expect(result.confidence).toBe("high");
    // Only .xml/.json are counted; the .groovy script file is excluded.
    expect(result.file_count).toBe(2);
  });

  test("exits non-zero when the path does not exist", () => {
    const r = spawnSync("npx", ["tsx", SCRIPT, join(BOOMI_SAMPLE, "does-not-exist")], {
      encoding: "utf-8",
    });
    expect(r.status).not.toBe(0);
  });
});
