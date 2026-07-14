import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { isValidComponentKey, resolveLocalBin } from "./local-bin.js";

const SPECTRAL = "@prismatic-io/spectral";
const BIN = "cni-component-manifest";

let project: string;

beforeAll(() => {
  // realpath: require.resolve canonicalizes (/var → /private/var on macOS)
  project = realpathSync(mkdtempSync(join(tmpdir(), "cni-project-")));
});

afterAll(() => {
  rmSync(project, { recursive: true, force: true });
});

function installFakeSpectral(bin?: string | Record<string, string>, writeBinFile = true): void {
  const pkgDir = join(project, "node_modules", "@prismatic-io", "spectral");
  rmSync(pkgDir, { recursive: true, force: true });
  mkdirSync(join(pkgDir, "bin"), { recursive: true });
  writeFileSync(
    join(pkgDir, "package.json"),
    JSON.stringify({ name: SPECTRAL, version: "10.6.0", ...(bin ? { bin } : {}) }),
  );
  if (writeBinFile) {
    writeFileSync(join(pkgDir, "bin", `${BIN}.js`), "console.log('ok');\n");
  }
}

describe("resolveLocalBin", () => {
  test("resolves the bin from the project's own install, run under the current Node", () => {
    installFakeSpectral({ [BIN]: `bin/${BIN}.js` });
    const bin = resolveLocalBin(project, SPECTRAL, BIN);
    expect(bin).toEqual({
      command: process.execPath,
      args: [join(project, "node_modules", "@prismatic-io", "spectral", "bin", `${BIN}.js`)],
    });
  });

  test("returns null when the package exposes no such bin", () => {
    installFakeSpectral(undefined);
    expect(resolveLocalBin(project, SPECTRAL, BIN)).toBeNull();
  });

  test("returns null when the bin entry points at a missing file", () => {
    installFakeSpectral({ [BIN]: `bin/${BIN}.js` }, false);
    expect(resolveLocalBin(project, SPECTRAL, BIN)).toBeNull();
  });

  test("returns null when the package is not installed", () => {
    rmSync(join(project, "node_modules"), { recursive: true, force: true });
    expect(resolveLocalBin(project, SPECTRAL, BIN)).toBeNull();
  });
});

describe("isValidComponentKey", () => {
  test.each(["slack", "hubspot-crm", "my_component", "Salesforce2"])("accepts %s", (key) => {
    expect(isValidComponentKey(key)).toBe(true);
  });

  test.each(["--private", "../escape", "a b", "$(id)", "a;b", "", "-x"])("rejects %j", (key) => {
    expect(isValidComponentKey(key)).toBe(false);
  });
});
