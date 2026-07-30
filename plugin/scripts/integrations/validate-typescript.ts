#!/usr/bin/env node
/**
 * validate-typescript.ts
 *
 * PURPOSE: Validate TypeScript code without building (fast type checking)
 *
 * USAGE: node validate-typescript.ts <integration-dir>
 *
 * EXIT CODES:
 *   0 - Success: No TypeScript errors
 *   1 - Error: Invalid parameters or directory
 *   2 - Error: TypeScript validation failed
 *   3 - Error: project-local tsc not found
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { exec } from "../../vendor/tinyexec/main.mjs";
import { confineToProjectRoot } from "../shared/project-directory.ts";
import { isTimeoutError } from "../lib/subprocess.ts";
import { resolveLocalBin } from "../shared/local-bin.ts";

const validateTypescript = async (integrationDir: string): Promise<number> => {
  if (!existsSync(join(integrationDir, "tsconfig.json"))) {
    console.log(`Not a TypeScript project: ${integrationDir}`);
    console.log("");
    console.log("Integration directories must contain tsconfig.json");
    return 1;
  }

  console.log("Validating TypeScript...");

  try {
    const bin = await resolveLocalBin(integrationDir, "typescript", "tsc");
    if (!bin) {
      console.log("Project-local tsc not found");
      console.log(`Run: node scripts/integrations/install-dependencies.ts ${integrationDir}`);
      return 3;
    }
    const result = await exec(bin.command, [...bin.args, "--noEmit"], {
      timeout: 60000,
      nodeOptions: { cwd: integrationDir },
    });

    if (result.exitCode === 0) {
      console.log("No type errors");
      return 0;
    } else {
      console.log("Type errors found:");
      console.log(result.stdout || result.stderr);
      return 2;
    }
  } catch (e) {
    if (isTimeoutError(e)) {
      console.log("Validation timeout (60s)");
      return 2;
    }
    if (e instanceof Error) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        console.log("tsc not found");
        console.log(`Run: node scripts/integrations/install-dependencies.ts ${integrationDir}`);
        return 3;
      }
    }
    console.log(`Error: ${e}`);
    return 2;
  }
};

const main = async (): Promise<number> => {
  if (process.argv.length < 3) {
    console.log("Usage: node validate-typescript.ts <integration-dir>");
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
};

process.exit(await main());
