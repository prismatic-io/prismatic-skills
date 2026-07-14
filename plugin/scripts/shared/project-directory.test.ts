import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { confineToProjectRoot } from "./project-directory.js";

let workspace: string;
let outside: string;
let originalCwd: string;

beforeAll(() => {
  originalCwd = process.cwd();
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "workspace-")));
  outside = realpathSync(mkdtempSync(join(tmpdir(), "outside-")));
  // getProjectRoot anchors on the directory containing .prismatic/
  mkdirSync(join(workspace, ".prismatic"));
  mkdirSync(join(workspace, "my-project"));
  writeFileSync(join(outside, "package.json"), "{}");
  symlinkSync(outside, join(workspace, "sneaky-link"));
  process.chdir(workspace);
});

afterAll(() => {
  process.chdir(originalCwd);
  rmSync(workspace, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe("confineToProjectRoot", () => {
  test("accepts a project inside the workspace, relative or absolute", () => {
    expect(confineToProjectRoot("my-project")).toBe(join(workspace, "my-project"));
    expect(confineToProjectRoot(join(workspace, "my-project"))).toBe(join(workspace, "my-project"));
  });

  test("accepts the workspace root itself", () => {
    expect(confineToProjectRoot(".")).toBe(workspace);
  });

  test("rejects an absolute path outside the workspace", () => {
    expect(() => confineToProjectRoot(outside)).toThrow(/outside the workspace/);
  });

  test("rejects a relative path that escapes the workspace", () => {
    expect(() => confineToProjectRoot(join("..", "somewhere"))).toThrow(
      /outside the workspace|Directory not found/,
    );
  });

  test("rejects a symlink that resolves outside the workspace", () => {
    expect(() => confineToProjectRoot("sneaky-link")).toThrow(/outside the workspace/);
  });

  test("rejects a directory that does not exist", () => {
    expect(() => confineToProjectRoot("no-such-dir")).toThrow(/Directory not found/);
  });
});
