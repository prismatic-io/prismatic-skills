#!/usr/bin/env npx tsx
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { type CliConfig, parseCliArgs } from "../shared/cli-help.js";
import { confineToProjectRoot } from "../shared/project-directory.js";
import { printTimingSummary, timedStep } from "../shared/timing.js";

const CLI = {
  command: "prismatic-tools build-component",
  description: "Build a Prismatic component project.",
  positionals: [{ name: "component-dir", required: true }],
  options: [],
} as const satisfies CliConfig;

function installDependencies(componentDir: string): boolean {
  return timedStep("Install dependencies", () => {
    const nodeModules = join(componentDir, "node_modules");
    if (existsSync(nodeModules)) {
      console.log("Dependencies already installed");
      return true;
    }

    console.log("Installing dependencies...");
    const result = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
      cwd: componentDir,
      encoding: "utf-8",
      timeout: 300000,
    });

    if (result.status !== 0) {
      console.log("Failed to install dependencies");
      if (result.stderr) console.log(result.stderr.slice(0, 500));
      return false;
    }

    console.log("Dependencies installed successfully");
    return true;
  });
}

function buildComponent(componentDir: string): boolean {
  return timedStep("Build component", () => {
    console.log("Building component...");
    const result = spawnSync("npm", ["run", "build"], {
      cwd: componentDir,
      encoding: "utf-8",
      timeout: 120000,
    });

    if (result.status !== 0) {
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
}

function main(): number {
  const { positionals } = parseCliArgs(process.argv.slice(2), CLI);

  let componentDir: string;
  try {
    componentDir = confineToProjectRoot(positionals[0]);
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

  if (!installDependencies(componentDir)) return 1;
  if (!buildComponent(componentDir)) return 1;

  printTimingSummary();

  console.log("");
  console.log("=".repeat(60));
  console.log("  BUILD COMPLETE");
  console.log("=".repeat(60));
  console.log("");
  console.log("Next: Publish the component");
  console.log(`   npx tsx scripts/components/publish-component.ts ${componentDir}`);

  return 0;
}

process.exit(main());
