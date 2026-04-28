#!/usr/bin/env npx tsx
/**
 * validate-component.ts
 *
 * PURPOSE: Validate component structure and build output
 *
 * USAGE: npx tsx validate-component.ts <COMPONENT_DIR>
 *
 * EXIT CODES:
 *   0 - Success: Component validated and ready for platform testing
 *   1 - Error: Validation failed
 */

import { existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { timedStep, printTimingSummary } from "../shared/timing.js";

function validateComponent(componentDir: string): boolean {
  return timedStep("Validate component", () => {
    console.log("Validating component...");

    const requiredFiles = ["package.json", "src/index.ts"];

    const hasActions =
      existsSync(join(componentDir, "src/actions.ts")) ||
      existsSync(join(componentDir, "src/actions/index.ts"));

    const missing: string[] = [];
    for (const f of requiredFiles) {
      if (!existsSync(join(componentDir, f))) {
        missing.push(f);
      }
    }

    if (!hasActions) {
      missing.push("src/actions.ts or src/actions/index.ts");
    }

    if (missing.length > 0) {
      console.log(`Error: Missing required files: ${missing.join(", ")}`);
      return false;
    }

    if (!existsSync(join(componentDir, "dist", "index.js"))) {
      console.log("Error: Component not built (dist/index.js missing)");
      console.log("Build the component first with build-component.ts");
      return false;
    }

    console.log("Component structure validated");
    return true;
  });
}

function main(): number {
  if (process.argv.length < 3) {
    console.log("Missing component directory");
    console.log("Usage: npx tsx validate-component.ts <COMPONENT_DIR>");
    return 1;
  }

  const componentDir = resolve(process.argv[2]);

  if (!existsSync(componentDir)) {
    console.log(`Error: Component directory not found: ${componentDir}`);
    return 1;
  }

  const componentName = basename(componentDir);
  console.log(`Validating component: ${componentName}`);
  console.log(`Directory: ${componentDir}`);
  console.log("");

  const success = validateComponent(componentDir);

  printTimingSummary();

  console.log("");
  console.log("=".repeat(60));
  if (success) {
    console.log("  VALIDATION COMPLETE");
  } else {
    console.log("  VALIDATION FAILED");
  }
  console.log("=".repeat(60));

  if (success) {
    console.log("");
    console.log("Component structure is valid and build output exists.");
    console.log("");
    console.log("Next steps:");
    console.log(`  1. Publish: npx tsx scripts/publish-component.ts ${componentDir}`);
    console.log("  2. Test functionality in the Prismatic platform");
    console.log("     - Create or edit an integration");
    console.log("     - Add your component's actions");
    console.log("     - Test with real credentials and data");
    console.log("");
    return 0;
  } else {
    console.log("");
    console.log("Fix the issues above and re-run validation.");
    return 1;
  }
}

process.exit(main());
