#!/usr/bin/env npx tsx
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type CliConfig, parseCliArgs } from "../shared/cli-help.js";
import { confineToProjectRoot } from "../shared/project-directory.js";

const CLI = {
  command: "prismatic-tools build-integration",
  description: "Build a Prismatic integration project.",
  positionals: [{ name: "project-directory", required: true }],
  options: [],
} as const satisfies CliConfig;

function parseTypescriptErrors(stderr: string): string {
  if (!stderr) return "";

  const lines = stderr.split("\n");
  const errors: string[] = [];
  let currentError: string[] = [];

  for (const line of lines) {
    if (line.includes(".ts(") && line.includes("error TS")) {
      if (currentError.length > 0) {
        errors.push(currentError.join("\n"));
        currentError = [];
      }
      currentError.push(line);
    } else if (currentError.length > 0 && line.trim()) {
      currentError.push(line);
    }
  }

  if (currentError.length > 0) {
    errors.push(currentError.join("\n"));
  }

  return errors.length > 0 ? errors.join("\n\n") : stderr;
}

function buildIntegration(projectDir: string): number {
  if (!existsSync(join(projectDir, "package.json"))) {
    console.log(`package.json not found in ${projectDir}`);
    console.log("");
    console.log("This doesn't appear to be a valid Node.js project.");
    return 1;
  }

  if (!existsSync(join(projectDir, "node_modules"))) {
    console.log("Dependencies not installed");
    console.log(`Run: npx tsx scripts/shared/install-dependencies.ts ${projectDir}`);
    return 1;
  }

  const verifyResultPath = join(projectDir, "verify-code-result.json");
  if (!existsSync(verifyResultPath)) {
    console.log("Code verification has not been run yet.");
    console.log("");
    console.log("Run verify-code before building to confirm generated code matches requirements:");
    console.log(`  prismatic-tools verify-code ${projectDir} --session <name>`);
    return 0;
  }

  console.log("Building...");

  try {
    const result = spawnSync("npm", ["run", "build"], {
      cwd: projectDir,
      encoding: "utf-8",
      timeout: 120000,
    });

    if (result.status === 0) {
      const distPath = join(projectDir, "dist");
      console.log(`Build complete: ${distPath}/`);
      return 0;
    } else {
      console.log("Build failed");
      if (result.stderr) {
        const parsed = parseTypescriptErrors(result.stderr);
        console.log(parsed || result.stderr);
      } else if (result.stdout) {
        console.log(result.stdout);
      }
      console.log(`Validate: npx tsx scripts/shared/validate-typescript.ts ${projectDir}`);
      return 2;
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("TIMEOUT")) {
      console.log("Build timed out (2 minutes)");
      console.log("");
      console.log("The build took longer than expected.");
      return 2;
    }
    console.log(`Unexpected error: ${e}`);
    return 2;
  }
}

function main(): number {
  const { positionals } = parseCliArgs(process.argv.slice(2), CLI);

  let projectDir: string;
  try {
    projectDir = confineToProjectRoot(positionals[0]);
  } catch (e) {
    console.log((e as Error).message);
    return 1;
  }

  return buildIntegration(projectDir);
}

process.exit(main());
