import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exec } from "../../vendor/tinyexec/main.mjs";

const SCRIPT = join(import.meta.dirname, "validate-phase.ts");
const tempDirs: string[] = [];

const makeProject = async (files: string[]): Promise<string> => {
  const projectDir = await mkdtemp(join(tmpdir(), "validate-phase-"));
  tempDirs.push(projectDir);
  for (const file of files) {
    const path = join(projectDir, file);
    if (file.endsWith("/")) {
      await mkdir(path, { recursive: true });
    } else {
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, file === "src/index.ts" ? "export default component({});\n" : "");
    }
  }
  return projectDir;
};

const validate = (projectDir: string, phase: string) =>
  exec(process.execPath, [SCRIPT, projectDir, "--phase", phase, "--type", "component"]);

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("component phase artifact names", () => {
  for (const config of ["webpack.config.js", "tsdown.config.mts"]) {
    test(`accepts ${config} at scaffold`, async () => {
      const projectDir = await makeProject([
        "package.json",
        "tsconfig.json",
        config,
        "src/index.ts",
        "src/",
        "node_modules/",
      ]);

      expect((await validate(projectDir, "scaffold")).exitCode).toBe(0);
    });
  }

  test("requires JavaScript build output", async () => {
    const validProject = await makeProject(["package.json", "src/index.ts", "dist/index.js"]);
    const invalidProject = await makeProject(["package.json", "src/index.ts", "dist/index.ts"]);

    expect((await validate(validProject, "build")).exitCode).toBe(0);
    expect((await validate(invalidProject, "build")).exitCode).toBe(1);
  });
});
