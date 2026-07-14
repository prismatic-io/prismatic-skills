#!/usr/bin/env npx tsx
/**
 * validate-typescript.ts
 *
 * PURPOSE: Validate TypeScript code without building (fast type checking)
 *
 * USAGE: npx tsx validate-typescript.ts <integration-dir>
 *
 * EXIT CODES:
 *   0 - Success: No TypeScript errors
 *   1 - Error: Invalid parameters or directory
 *   2 - Error: TypeScript validation failed
 *   3 - Error: npx/tsc not found
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { confineToProjectRoot } from "../shared/project-directory.js";

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
  if (process.argv.length < 3) {
    console.log("Usage: npx tsx validate-typescript.ts <integration-dir>");
    console.log("");
    console.log("Benefits:");
    console.log("  - Fast validation (5-10 seconds vs full build)");
    console.log("  - Catches type errors early");
    console.log("  - Better error messages than webpack");
    return 1;
  }

  let integrationDir: string;
  try {
    integrationDir = confineToProjectRoot(process.argv[2]);
  } catch (e) {
    console.log((e as Error).message);
    return 1;
  }

  return validateTypescript(integrationDir);
}

process.exit(main());
