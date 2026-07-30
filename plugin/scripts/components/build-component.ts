#!/usr/bin/env node
/**
 * build-component.ts
 *
 * PURPOSE: Phase 4 - Build the component using webpack
 *
 * USAGE: node build-component.ts <COMPONENT_DIR>
 *
 * EXIT CODES:
 *   0 - Success: Component built successfully
 *   1 - Error: Build failed
 */

import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { exec, type Output } from "../../vendor/tinyexec/main.mjs";
import { printTimingSummary, timedStepAsync } from "../shared/timing.ts";
import { confineToProjectRoot } from "../shared/project-directory.ts";

const installDependencies = async (componentDir: string): Promise<boolean> =>
  timedStepAsync("Install dependencies", async () => {
    const nodeModules = join(componentDir, "node_modules");
    if (existsSync(nodeModules)) {
      console.log("Dependencies already installed");
      return true;
    }

    console.log("Installing dependencies...");
    let result: Output;
    try {
      result = await exec("npm", ["install", "--no-audit", "--no-fund"], {
        timeout: 300_000,
        nodeOptions: { cwd: componentDir },
      });
    } catch (error) {
      console.log(`Failed to install dependencies: ${error}`);
      return false;
    }

    if (result.exitCode !== 0) {
      console.log("Failed to install dependencies");
      if (result.stderr) console.log(result.stderr.slice(0, 500));
      return false;
    }

    console.log("Dependencies installed successfully");
    return true;
  });

const buildComponent = async (componentDir: string): Promise<boolean> =>
  timedStepAsync("Build component", async () => {
    console.log("Building component...");
    let result: Output;
    try {
      result = await exec("npm", ["run", "build"], {
        timeout: 120_000,
        nodeOptions: { cwd: componentDir },
      });
    } catch (error) {
      console.log(`Build failed: ${error}`);
      return false;
    }

    if (result.exitCode !== 0) {
      console.log("Build failed");
      if (result.stderr) {
        console.log("Errors:");
        console.log(result.stderr.slice(0, 1000));
      }
      if (result.stdout) {
        console.log("Output:");
        console.log(result.stdout.slice(0, 1000));
      }
      return false;
    }

    const distFile = join(componentDir, "dist", "index.js");
    if (!existsSync(distFile)) {
      console.log("Build completed but dist/index.js not found");
      return false;
    }

    console.log("Build successful");
    console.log(`   Output: ${distFile}`);
    return true;
  });

const main = async (): Promise<number> => {
  if (process.argv.length < 3) {
    console.log("Usage: node build-component.ts <COMPONENT_DIR>");
    return 1;
  }

  let componentDir: string;
  try {
    componentDir = confineToProjectRoot(process.argv[2]);
  } catch (e) {
    console.log(`Error: ${(e as Error).message}`);
    return 1;
  }

  if (!existsSync(join(componentDir, "package.json"))) {
    console.log("Error: Not a valid component directory (no package.json)");
    return 1;
  }

  console.log(`Building component: ${basename(componentDir)}`);
  console.log(`Directory: ${componentDir}`);
  console.log("");

  if (!(await installDependencies(componentDir))) return 1;
  if (!(await buildComponent(componentDir))) return 1;

  printTimingSummary();

  console.log("");
  console.log("=".repeat(60));
  console.log("  BUILD COMPLETE");
  console.log("=".repeat(60));
  console.log("");
  console.log("Next: Publish the component");
  console.log(`   node scripts/components/publish-component.ts ${componentDir}`);

  return 0;
};

process.exit(await main());
