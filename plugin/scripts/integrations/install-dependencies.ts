#!/usr/bin/env node
/**
 * install-dependencies.ts
 *
 * PURPOSE: Install npm dependencies for CNI project
 *
 * USAGE: node install-dependencies.ts <project-directory>
 *
 * EXIT CODES:
 *   0 - Success: Dependencies installed
 *   1 - Error: Project directory not found
 *   2 - Error: npm install failed
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { exec } from "../../vendor/tinyexec/main.mjs";
import { confineToProjectRoot } from "../shared/project-directory.ts";
import { isTimeoutError } from "../lib/subprocess.ts";

const installDependencies = async (projectDir: string): Promise<number> => {
  if (!existsSync(join(projectDir, "package.json"))) {
    console.log(`package.json not found in ${projectDir}`);
    console.log("");
    console.log("This doesn't appear to be a valid Node.js project.");
    return 1;
  }

  console.log(`Installing dependencies for: ${projectDir}`);
  console.log("");
  console.log("Running: npm install");
  console.log("This may take a few minutes...");
  console.log("");

  const startTime = performance.now();

  try {
    const result = await exec("npm", ["install"], {
      timeout: 300000,
      nodeOptions: { cwd: projectDir },
    });

    const elapsed = (performance.now() - startTime) / 1000;

    if (result.exitCode === 0) {
      console.log(`Dependencies installed successfully (${elapsed.toFixed(1)}s)`);
      console.log("");
      if (result.stdout) {
        const lines = result.stdout.trim().split("\n");
        if (lines.length > 0) {
          console.log(lines[lines.length - 1]);
        }
      }
      console.log("");
      console.log("Next steps:");
      console.log(`  node build-integration.ts ${projectDir}`);
      return 0;
    } else {
      console.log(`npm install failed (${elapsed.toFixed(1)}s)`);
      console.log("");
      if (result.stderr) {
        console.log("Error output:");
        console.log(result.stderr);
      }
      if (result.stdout) {
        console.log("Standard output:");
        console.log(result.stdout);
      }
      console.log("");
      console.log("Troubleshooting:");
      console.log("  - Try running: npm cache clean --force");
      console.log("  - Ensure package.json is valid");
      return 2;
    }
  } catch (e) {
    if (isTimeoutError(e)) {
      console.log("npm install timed out (5 minutes)");
      console.log("");
      console.log("The installation took longer than expected.");
      console.log("This could be due to:");
      console.log("  - Slow network connection");
      console.log("  - Large number of dependencies");
      console.log("  - npm registry issues");
      console.log("");
      console.log("Try again or check npm registry status.");
      return 2;
    }
    console.log(`Unexpected error: ${e}`);
    return 2;
  }
};

const main = async (): Promise<number> => {
  if (process.argv.length < 3) {
    console.log("No project directory provided");
    console.log("Usage: node install-dependencies.ts <project-directory>");
    return 1;
  }

  let projectDir: string;
  try {
    projectDir = confineToProjectRoot(process.argv[2]);
  } catch (e) {
    console.log((e as Error).message);
    return 1;
  }

  return installDependencies(projectDir);
};

process.exit(await main());
