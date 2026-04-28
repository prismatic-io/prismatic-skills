#!/usr/bin/env npx tsx
/**
 * scaffold-component.ts
 *
 * PURPOSE: Phase 3 - Create component structure using prism components:init
 *
 * USAGE: npx tsx scaffold-component.ts <COMPONENT_NAME>
 *
 * EXIT CODES:
 *   0 - Success: Component directory created
 *   1 - Error: Invalid usage or directory already exists
 *   3 - Error: Scaffolding failed
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  renameSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import { mkdtempSync } from "node:fs";
import { getProjectRoot } from "../shared/project-directory.js";
import { timedStep, printTimingSummary } from "../shared/timing.js";

function toPascalCase(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

function validateComponentName(name: string): boolean {
  if (name.length < 2) return /^[a-z][a-z0-9-]*$/.test(name);
  return /^[a-z][a-z0-9-]*[a-z0-9]$/.test(name);
}

function isInitializedComponent(componentPath: string): boolean {
  return existsSync(join(componentPath, "src")) && existsSync(join(componentPath, "package.json"));
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function scaffoldComponent(name: string): string | null {
  return timedStep("Scaffold Component", () => {
    const projectDir = getProjectRoot();
    const componentsDir = join(projectDir, "components");
    const componentPath = join(componentsDir, name);

    if (existsSync(componentPath) && isInitializedComponent(componentPath)) {
      console.log(`Component already initialized: ${componentPath}`);
      console.log("   Using existing component directory");
      return componentPath;
    }

    console.log(`Creating component: ${name}`);
    console.log(`Location: ${componentPath}`);
    console.log("");

    mkdirSync(componentsDir, { recursive: true });

    const tempDir = mkdtempSync(join(componentsDir, ".tmp-"));
    try {
      const result = spawnSync("prism", ["components:init", name], {
        cwd: tempDir,
        encoding: "utf-8",
        timeout: 120000,
      });

      if (result.status !== 0) {
        console.log("Component scaffolding failed");
        if (result.stderr) console.log("Error:", result.stderr.slice(0, 500));
        if (result.stdout) console.log("Output:", result.stdout.slice(0, 500));
        return null;
      }

      const tempComponent = join(tempDir, name);
      const prismaticDir = join(componentPath, ".prismatic");

      // Preserve existing .prismatic/ session directory
      if (existsSync(prismaticDir)) {
        renameSync(prismaticDir, join(tempComponent, ".prismatic"));
      }

      if (existsSync(componentPath)) {
        rmSync(componentPath, { recursive: true });
      }
      renameSync(tempComponent, componentPath);

      console.log("Component scaffolded via prism CLI");
      return componentPath;
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("TIMEOUT")) {
        console.log("Scaffolding timed out (2 minutes)");
      } else {
        console.log(`Error: ${e}`);
      }
      return null;
    } finally {
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true });
    }
  });
}

function removeTestFiles(componentPath: string): void {
  timedStep("Remove Test Files", () => {
    const filesToRemove = ["jest.config.js"];

    // Find *.test.ts files
    const srcDir = join(componentPath, "src");
    if (existsSync(srcDir)) {
      for (const file of walkDir(srcDir)) {
        if (file.endsWith(".test.ts")) {
          filesToRemove.push(relative(componentPath, file));
        }
      }
    }

    const removed: string[] = [];
    for (const filePath of filesToRemove) {
      const fullPath = join(componentPath, filePath);
      if (existsSync(fullPath)) {
        unlinkSync(fullPath);
        removed.push(filePath);
      }
    }

    // Remove test-related deps from package.json
    const pkgPath = join(componentPath, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      let modified = false;

      if (pkg.scripts?.test) {
        delete pkg.scripts.test;
        modified = true;
      }

      const testDeps = ["@types/jest", "jest", "ts-jest"];
      if (pkg.devDependencies) {
        for (const dep of testDeps) {
          if (dep in pkg.devDependencies) {
            delete pkg.devDependencies[dep];
            modified = true;
          }
        }
      }

      if (modified) writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    }

    if (removed.length > 0) console.log(`Removed test files: ${removed.join(", ")}`);
    console.log("Test dependencies removed from package.json");
  });
}

function addSkeletonFiles(componentPath: string, componentName: string): void {
  timedStep("Add Skeleton Files", () => {
    const pascalName = toPascalCase(componentName);
    const srcDir = join(componentPath, "src");

    const typesPath = join(srcDir, "types.ts");
    if (!existsSync(typesPath)) {
      writeFileSync(
        typesPath,
        `// Type definitions for ${pascalName} component\n\nexport interface ${pascalName}Resource {\n  id: string;\n  // Add resource-specific fields here\n}\n`,
      );
      console.log("Created: src/types.ts");
    }

    const inputsPath = join(srcDir, "inputs.ts");
    if (!existsSync(inputsPath)) {
      writeFileSync(
        inputsPath,
        `import { input, util } from "@prismatic-io/spectral";\n\nexport const connectionInput = input({\n  label: "Connection",\n  type: "connection",\n  required: true,\n});\n`,
      );
      console.log("Created: src/inputs.ts");
    }
  });
}

function installNpmDependencies(componentPath: string): boolean {
  return timedStep("Install Dependencies", () => {
    console.log("Installing npm dependencies...");
    try {
      const result = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
        cwd: componentPath,
        encoding: "utf-8",
        timeout: 180000,
      });
      if (result.status === 0) {
        console.log("Dependencies installed");
        return true;
      }
      console.log("npm install had issues");
      if (result.stderr) {
        for (const line of result.stderr.trim().split("\n").slice(0, 5)) {
          console.log(`   ${line}`);
        }
      }
      return true; // Continue anyway
    } catch {
      console.log("Could not run npm install");
      console.log("   Run manually: npm install");
      return false;
    }
  });
}

function main(): number {
  console.log("Component Builder - Scaffold Component");
  console.log("");

  if (process.argv.length < 3) {
    console.log("Missing component name");
    console.log("");
    console.log("Usage: npx tsx scaffold-component.ts <COMPONENT_NAME>");
    return 1;
  }

  const componentName = process.argv[2];

  if (!validateComponentName(componentName)) {
    console.log("Invalid component name");
    console.log("   Name must be lowercase with hyphens (e.g., 'canny', 'date-utils')");
    return 1;
  }

  const componentPath = scaffoldComponent(componentName);
  if (!componentPath) {
    printTimingSummary();
    return 3;
  }

  removeTestFiles(componentPath);
  addSkeletonFiles(componentPath, componentName);
  installNpmDependencies(componentPath);

  printTimingSummary();

  console.log("");
  console.log("=".repeat(60));
  console.log("  SCAFFOLD COMPLETE");
  console.log("=".repeat(60));
  console.log("");
  console.log(`Component scaffolded at: ${componentPath}`);
  console.log("");
  console.log("Next: Phase 4 - Generate Code");

  return 0;
}

process.exit(main());
