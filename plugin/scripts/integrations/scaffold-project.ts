#!/usr/bin/env npx tsx
/**
 * scaffold-project.ts
 *
 * PURPOSE: Initialize integration project using Prism CLI and install component manifests
 *
 * USAGE: npx tsx scaffold-project.ts <INTEGRATION_NAME> [--components <comp1,comp2,...>] [--credentials '<json>']
 *
 * EXIT CODES:
 *   0 - Success: Project scaffolded and dependencies installed
 *   1 - Error: Invalid usage
 *   3 - Error: Scaffolding failed
 *   4 - Error: Manifest installation failed
 */

import { existsSync, readFileSync, writeFileSync, rmSync, renameSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { getProjectRoot, getSessionDirectory } from "../shared/project-directory.js";
import { isValidComponentKey, resolveLocalBin } from "../shared/local-bin.js";
import { timedStep, printTimingSummary } from "../shared/timing.js";

function printSection(title: string): void {
  console.log("");
  console.log("=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60));
  console.log("");
}

function validateIntegrationName(name: string): boolean {
  return /^[a-z][a-z0-9-]*[a-z0-9]$/.test(name);
}

function isInitializedProject(projectPath: string): boolean {
  return existsSync(join(projectPath, "src")) && existsSync(join(projectPath, "package.json"));
}

function removeTestFiles(projectPath: string): void {
  const filesToRemove = [
    ".env.testing",
    "src/flows.test.ts",
    "src/componentRegistry.ts",
    "src/client.ts",
    "jest.config.js",
    ".npmrc",
  ];

  for (const filePath of filesToRemove) {
    const fullPath = join(projectPath, filePath);
    if (existsSync(fullPath)) unlinkSync(fullPath);
  }

  // Remove componentRegistry references from index.ts
  const indexPath = join(projectPath, "src", "index.ts");
  if (existsSync(indexPath)) {
    let content = readFileSync(indexPath, "utf-8");
    content = content.replace('import { componentRegistry } from "./componentRegistry";\n', "");
    content = content.replace('export { componentRegistry } from "./componentRegistry";\n', "");
    content = content.replace(/\n\s*componentRegistry,?/, "");
    writeFileSync(indexPath, content);
  }

  // Remove test deps from package.json
  const pkgPath = join(projectPath, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

    if (pkg.scripts?.test) delete pkg.scripts.test;

    const testDeps = ["@types/jest", "jest", "ts-jest", "dotenv"];
    if (pkg.devDependencies) {
      for (const dep of testDeps) {
        if (dep in pkg.devDependencies) delete pkg.devDependencies[dep];
      }
    }

    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
}

function scaffoldProject(name: string): string | null {
  return timedStep("Scaffold Project", () => {
    const projectDir = getProjectRoot();
    const projectPath = join(projectDir, name);

    if (existsSync(projectPath) && isInitializedProject(projectPath)) {
      console.log(`Project already initialized: ${projectPath}`);
      console.log("   Using existing project directory");
      return projectPath;
    }

    console.log(`Creating project: ${name}`);
    console.log(`Location: ${projectPath}`);
    console.log("");

    const tempDir = mkdtempSync(join(projectDir, ".tmp-"));
    try {
      const result = spawnSync("prism", ["integrations:init", name, "--clean"], {
        cwd: tempDir,
        encoding: "utf-8",
        timeout: 120000,
      });

      if (result.status !== 0) {
        console.log("Project scaffolding failed");
        if (result.stderr) console.log("Error:", result.stderr.slice(0, 500));
        if (result.stdout) console.log("Output:", result.stdout.slice(0, 500));
        return null;
      }

      const tempProject = join(tempDir, name);
      const prismaticDir = join(projectPath, ".prismatic");

      if (existsSync(prismaticDir)) {
        renameSync(prismaticDir, join(tempProject, ".prismatic"));
      }

      if (existsSync(projectPath)) rmSync(projectPath, { recursive: true });
      renameSync(tempProject, projectPath);

      removeTestFiles(projectPath);

      // Create .env file
      const envPath = join(projectPath, ".env");
      if (!existsSync(envPath)) {
        writeFileSync(
          envPath,
          "# Environment variables for local development\n# This file is required by webpack but can remain empty for non-OAuth builds\n",
        );
      }

      console.log("Project scaffolded");
      return projectPath;
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

function installManifest(component: string, projectPath: string, isPrivate = false): boolean {
  return timedStep("Install Component Manifest", () => {
    console.log(`Installing manifest for: ${component}${isPrivate ? " (private)" : ""}`);

    try {
      // Use the project's lockfile-pinned spectral install.
      const bin = resolveLocalBin(projectPath, "@prismatic-io/spectral", "cni-component-manifest");
      if (!bin) {
        console.log("cni-component-manifest not found in the project's dependencies.");
        console.log("Install @prismatic-io/spectral (>= 10.6.0) in the project, then re-run.");
        return false;
      }

      const args = [...bin.args, component];
      if (isPrivate) args.push("--private");
      const result = spawnSync(bin.command, args, {
        cwd: projectPath,
        encoding: "utf-8",
        timeout: 120000,
      });

      if (result.status !== 0) {
        console.log(`Failed to install manifest for ${component}`);
        if (result.stderr) console.log(`   ${result.stderr.slice(0, 200)}`);
        return false;
      }

      const manifestDir = join(projectPath, "src", "manifests", component);
      if (existsSync(manifestDir)) {
        console.log(`Manifest installed at: src/manifests/${component}/`);
      } else {
        console.log("Manifest command succeeded but directory not found");
      }
      return true;
    } catch {
      console.log(`Error installing manifest for ${component}`);
      return false;
    }
  });
}

function installAllManifests(
  components: string[],
  projectPath: string,
  privateComponents: Set<string> = new Set(),
): boolean {
  if (components.length === 0) return true;

  console.log(`Installing ${components.length} component manifest(s)...`);
  console.log("");

  let allSuccess = true;
  for (const component of components) {
    if (!installManifest(component, projectPath, privateComponents.has(component)))
      allSuccess = false;
  }
  return allSuccess;
}

function writeCredentialsToEnv(credentials: Record<string, string>, projectPath: string): boolean {
  return timedStep("Write Credentials", () => {
    if (Object.keys(credentials).length === 0) return true;

    console.log(`Writing ${Object.keys(credentials).length} credential(s) to .env...`);

    const envPath = join(projectPath, ".env");

    try {
      let existingLines: string[] = [];
      if (existsSync(envPath)) {
        existingLines = readFileSync(envPath, "utf-8").split("\n");
      }

      if (existingLines.length > 0 && existingLines[existingLines.length - 1].trim()) {
        existingLines.push("");
      }

      existingLines.push("# OAuth/API Credentials");
      for (const [key, value] of Object.entries(credentials)) {
        existingLines.push(`${key}=${value}`);
      }

      writeFileSync(envPath, `${existingLines.join("\n")}\n`);

      for (const key of Object.keys(credentials)) {
        console.log(`   ${key}=****`);
      }

      console.log("Credentials written to .env");
      return true;
    } catch (e) {
      console.log(`Failed to write credentials: ${e}`);
      return false;
    }
  });
}

function installNpmDependencies(projectPath: string): boolean {
  return timedStep("Install Dependencies", () => {
    console.log("Installing npm dependencies...");
    try {
      const result = spawnSync("npm", ["install"], {
        cwd: projectPath,
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

function parseArgs(args: string[]): {
  name: string | null;
  components: string[];
  privateComponents: Set<string>;
  credentials: Record<string, string>;
  sessionName: string | null;
  sessionType: string | null;
} {
  let name: string | null = null;
  let components: string[] = [];
  let privateComponents: Set<string> = new Set();
  let credentials: Record<string, string> = {};
  let sessionName: string | null = null;
  let sessionType: string | null = null;

  let i = 0;
  while (i < args.length) {
    if (args[i] === "--components" && i + 1 < args.length) {
      components = args[i + 1]
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      i += 2;
    } else if (args[i] === "--private-components" && i + 1 < args.length) {
      privateComponents = new Set(
        args[i + 1]
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
      );
      i += 2;
    } else if (args[i] === "--credentials" && i + 1 < args.length) {
      try {
        credentials = JSON.parse(args[i + 1]);
      } catch (e) {
        console.error(`Invalid credentials JSON: ${e}`);
        process.exit(1);
      }
      i += 2;
    } else if (args[i] === "--session" && i + 1 < args.length) {
      sessionName = args[i + 1];
      i += 2;
    } else if (args[i] === "--type" && i + 1 < args.length) {
      sessionType = args[i + 1];
      i += 2;
    } else if (!args[i].startsWith("-")) {
      if (name !== null) {
        console.error(`Unexpected argument: ${args[i]}`);
        process.exit(1);
      }
      name = args[i];
      i += 1;
    } else {
      i += 1;
    }
  }

  return { name, components, privateComponents, credentials, sessionName, sessionType };
}

function main(): number {
  console.log("Integration Builder - Scaffold Project");
  console.log("");

  if (process.argv.length < 3) {
    console.log("Missing integration name");
    console.log("");
    console.log(
      "Usage: npx tsx scaffold-project.ts <INTEGRATION_NAME> [--components <comp1,comp2,...>] [--credentials '<json>']",
    );
    return 1;
  }

  const { name, components, privateComponents, credentials, sessionName, sessionType } = parseArgs(
    process.argv.slice(2),
  );

  if (!name) {
    console.log("Missing integration name");
    return 1;
  }

  if (!validateIntegrationName(name)) {
    console.log("Invalid integration name");
    console.log("   Name must be lowercase with hyphens (e.g., 'salesforce-slack-sync')");
    return 1;
  }

  const invalidKeys = [...new Set([...components, ...privateComponents])].filter(
    (key) => !isValidComponentKey(key),
  );
  if (invalidKeys.length > 0) {
    console.log(`Invalid component key(s): ${invalidKeys.join(", ")}`);
    console.log("   Keys contain only letters, digits, hyphens, and underscores.");
    return 1;
  }

  if (sessionName) {
    const sessionDir = getSessionDirectory(
      sessionName,
      sessionType === "component" ? "components" : "integrations",
    );
    const reqPath = join(sessionDir, "requirements.json");
    if (existsSync(reqPath)) {
      const reqs = JSON.parse(readFileSync(reqPath, "utf-8"));
      if (reqs.phase_gate !== "confirmed") {
        console.log("Requirements not yet confirmed by the user.");
        console.log("");
        console.log("Before scaffolding, present a summary of all decisions to the user.");
        console.log(
          `After confirmation, write: prismatic-tools record-choices --session ${sessionName} phase_gate=confirmed`,
        );
        return 0;
      }
    }
  }

  printSection("Scaffolding Project");
  const projectPath = scaffoldProject(name);
  if (!projectPath) {
    printTimingSummary();
    return 3;
  }

  // Create .gitignore if missing
  const gitignorePath = join(projectPath, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(
      gitignorePath,
      [
        "node_modules/",
        "dist/",
        ".env",
        ".env.*",
        "!.env.testing",
        ".DS_Store",
        ".spectral/prism.json",
        "",
      ].join("\n"),
    );
    console.log("Created .gitignore");
  }

  printSection("Installing Dependencies");
  installNpmDependencies(projectPath);

  if (components.length > 0) {
    printSection("Installing Component Manifests");
    if (!installAllManifests(components, projectPath, privateComponents)) {
      printTimingSummary();
      return 4;
    }
  }

  if (Object.keys(credentials).length > 0) {
    printSection("Writing Credentials");
    writeCredentialsToEnv(credentials, projectPath);
  }

  printTimingSummary();

  console.log("");
  console.log("=".repeat(60));
  console.log("  PROJECT SCAFFOLDED");
  console.log("=".repeat(60));
  console.log("");
  console.log(`Project: ${projectPath}`);
  if (components.length > 0) console.log(`Manifests: ${components.join(", ")}`);
  if (Object.keys(credentials).length > 0)
    console.log(`Credentials: ${Object.keys(credentials).length} written to .env`);
  console.log("");
  console.log("Next: Phase 3 - Generate Code");

  return 0;
}

process.exit(main());
