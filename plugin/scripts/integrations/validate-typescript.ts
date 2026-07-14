#!/usr/bin/env npx tsx
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type CliConfig, parseCliArgs } from "../shared/cli-help.js";
import { confineToProjectRoot } from "../shared/project-directory.js";

const CLI = {
  command: "prismatic-tools validate-typescript",
  description: "Type-check an integration project without building it.",
  positionals: [{ name: "integration-dir", required: true }],
  options: [],
} as const satisfies CliConfig;

function validateTypescript(integrationDir: string): number {
  if (!existsSync(join(integrationDir, "tsconfig.json"))) {
    console.log(`Not a TypeScript project: ${integrationDir}`);
    console.log("");
    console.log("Integration directories must contain tsconfig.json");
    return 1;
  }

  console.log("Validating TypeScript...");

  try {
    const result = spawnSync("npx", ["tsc", "--noEmit"], {
      cwd: integrationDir,
      encoding: "utf-8",
      timeout: 60000,
    });

    if (result.status === 0) {
      console.log("No type errors");
      return 0;
    } else {
      console.log("Type errors found:");
      console.log(result.stdout || result.stderr);
      return 2;
    }
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.includes("TIMEOUT")) {
        console.log("Validation timeout (60s)");
        return 2;
      }
      if (e.message.includes("ENOENT")) {
        console.log("tsc not found");
        console.log(`Run: npx tsx scripts/install-dependencies.ts ${integrationDir}`);
        return 3;
      }
    }
    console.log(`Error: ${e}`);
    return 2;
  }
}

function main(): number {
  const { positionals } = parseCliArgs(process.argv.slice(2), CLI);

  let integrationDir: string;
  try {
    integrationDir = confineToProjectRoot(positionals[0]);
  } catch (e) {
    console.log((e as Error).message);
    return 1;
  }

  return validateTypescript(integrationDir);
}

process.exit(main());
