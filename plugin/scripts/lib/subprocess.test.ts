import { describe, expect, test } from "bun:test";
import { exec } from "../../vendor/tinyexec/main.mjs";
import { isTimeoutError } from "./subprocess.ts";

describe("isTimeoutError", () => {
  test("recognizes tinyexec timeout errors", async () => {
    try {
      await exec(process.execPath, ["-e", "setTimeout(() => {}, 10_000)"], { timeout: 10 });
      throw new Error("Expected subprocess to time out");
    } catch (error) {
      expect(isTimeoutError(error)).toBe(true);
    }
  });

  test("rejects ordinary errors", () => {
    expect(isTimeoutError(new Error("boom"))).toBe(false);
    expect(isTimeoutError("TIMEOUT")).toBe(false);
  });
});
