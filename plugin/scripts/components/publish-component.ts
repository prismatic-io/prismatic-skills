#!/usr/bin/env npx tsx
/**
 * publish-component.ts
 *
 * PURPOSE: Phase 5 - Publish the component to the platform
 *
 * USAGE: npx tsx publish-component.ts <COMPONENT_DIR>
 *
 * EXIT CODES:
 *   0 - Success: Component published successfully
 *   1 - Error: Publish failed
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, join } from "node:path";
import { timedStep, printTimingSummary } from "../shared/timing.js";
import { confineToProjectRoot } from "../shared/project-directory.js";

function publishComponent(componentDir: string): string | null {
  return timedStep("Publish component", () => {
    console.log("Publishing component...");

    const result = spawnSync(
      "prism",
      ["components:publish", "--no-confirm", "--skip-on-signature-match"],
      {
        cwd: componentDir,
        encoding: "utf-8",
        timeout: 120000,
      },
    );

    if (result.status !== 0) {
      console.log("Publish failed");
      if (result.stderr) {
        console.log("Errors:");
        console.log(result.stderr.slice(0, 1000));
      }
      if (result.stdout) {
        console.log("Output:");
        console.log(result.stdout.slice(0, 1000));
      }
      return null;
    }

    // Try to extract component ID from output
    const output = (result.stdout ?? "") + (result.stderr ?? "");
    let componentId: string | null = null;

    const idPatterns = [
      /Component ID:\s*([A-Za-z0-9_-]+)/,
      /component\/([A-Za-z0-9_-]+)/,
      /"id":\s*"([A-Za-z0-9_-]+)"/,
    ];

    for (const pattern of idPatterns) {
      const match = output.match(pattern);
      if (match) {
        componentId = match[1];
        break;
      }
    }

    console.log("Publish successful");
    if (componentId) {
      console.log(`   Component ID: ${componentId}`);
    }

    return componentId ?? "unknown";
  });
}

function main(): number {
  if (process.argv.length < 3) {
    console.log("Usage: npx tsx publish-component.ts <COMPONENT_DIR>");
    return 1;
  }

  let componentDir: string;
  try {
    componentDir = confineToProjectRoot(process.argv[2]);
  } catch (e) {
    console.log(`Error: ${(e as Error).message}`);
    return 1;
  }

  const distFile = join(componentDir, "dist", "index.js");
  if (!existsSync(distFile)) {
    console.log("Error: Component not built (dist/index.js not found)");
    console.log("   Run build first: npx tsx scripts/components/build-component.ts <dir>");
    return 1;
  }

  const componentName = basename(componentDir);
  console.log(`Publishing component: ${componentName}`);
  console.log(`Directory: ${componentDir}`);
  console.log("");

  const componentId = publishComponent(componentDir);
  if (componentId === null) return 1;

  printTimingSummary();

  console.log("");
  console.log("=".repeat(60));
  console.log("  PUBLISH COMPLETE");
  console.log("=".repeat(60));
  console.log("");
  console.log(`Component '${componentName}' is now available.`);
  console.log("");
  console.log("Next steps:");
  console.log(`   1. Validate: npx tsx scripts/shared/validate-component.ts ${componentDir}`);
  console.log("   2. Test functionality in the platform");

  return 0;
}

process.exit(main());
