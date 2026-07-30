#!/usr/bin/env node
/**
 * build-integration.ts
 *
 * PURPOSE: Compile TypeScript CNI code to JavaScript
 *
 * USAGE: node build-integration.ts <project-directory>
 *
 * EXIT CODES:
 *   0 - Success: Build completed
 *   1 - Error: Project directory not found
 *   2 - Error: TypeScript compilation failed
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { exec } from "../../vendor/tinyexec/main.mjs";
import { confineToProjectRoot } from "../shared/project-directory.ts";
import { isTimeoutError } from "../lib/subprocess.ts";

const parseTypescriptErrors = (stderr: string): string => {
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
};

const buildIntegration = async (projectDir: string): Promise<number> => {
  if (!existsSync(join(projectDir, "package.json"))) {
    console.log(`package.json not found in ${projectDir}`);
    console.log("");
    console.log("This doesn't appear to be a valid Node.js project.");
    return 1;
  }

  if (!existsSync(join(projectDir, "node_modules"))) {
    console.log("Dependencies not installed");
    console.log(`Run: node scripts/integrations/install-dependencies.ts ${projectDir}`);
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
    const result = await exec("npm", ["run", "build"], {
      timeout: 120_000,
      nodeOptions: { cwd: projectDir },
    });

    if (result.exitCode === 0) {
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
      console.log(`Validate: node scripts/integrations/validate-typescript.ts ${projectDir}`);
      return 2;
    }
  } catch (e: unknown) {
    if (isTimeoutError(e)) {
      console.log("Build timed out (2 minutes)");
      console.log("");
      console.log("The build took longer than expected.");
      return 2;
    }
    console.log(`Unexpected error: ${e}`);
    return 2;
  }
};

const main = async (): Promise<number> => {
  if (process.argv.length < 3) {
    console.log("No project directory provided");
    console.log("Usage: node build-integration.ts <project-directory>");
    return 1;
  }

  let projectDir: string;
  try {
    projectDir = confineToProjectRoot(process.argv[2]);
  } catch (e) {
    console.log((e as Error).message);
    return 1;
  }

  return buildIntegration(projectDir);
};

process.exit(await main());
