import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { exec } from "../../vendor/tinyexec/main.mjs";

/**
 * detect-platform sniffs an export directory and reports its migration source — the
 * first step of every migration, so a wrong answer derails everything downstream. Driven
 * black-box (CLI that exits on import) against the committed Boomi sample.
 */

const SCRIPT = join(import.meta.dirname, "detect-platform.ts");
// __fixtures__/boomi: two .xml files + one .groovy (ignored).
const BOOMI_SAMPLE = join(import.meta.dirname, "..", "__fixtures__", "boomi");

describe("detect-platform", () => {
  test("classifies the Boomi sample export with high confidence", async () => {
    const r = await exec("node", [SCRIPT, BOOMI_SAMPLE]);
    expect(r.exitCode).toBe(0);
    const result = JSON.parse(r.stdout);
    expect(result.platform).toBe("boomi");
    expect(result.confidence).toBe("high");
    // Only .xml/.json are counted; the .groovy script file is excluded.
    expect(result.file_count).toBe(2);
  });

  test("exits non-zero when the path does not exist", async () => {
    const r = await exec("node", [SCRIPT, join(BOOMI_SAMPLE, "does-not-exist")]);
    expect(r.exitCode).not.toBe(0);
  });
});
