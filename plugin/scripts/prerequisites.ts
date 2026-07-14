#!/usr/bin/env npx tsx
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CliConfig, parseCliArgs } from "./shared/cli-help.js";
import { confineToProjectRoot, ensureSessionDirectory } from "./shared/project-directory.js";
import { printTimingSummary, timedStep } from "./shared/timing.js";

const CLI = {
  command: "prismatic-tools prerequisites",
  description: "Prepare a component or integration workflow session.",
  positionals: [{ name: "name", required: true }],
  options: [
    {
      name: "type",
      type: "string",
      value: "component|integration",
      required: true,
      choices: ["component", "integration"],
      description: "Workflow type.",
    },
    { name: "existing", type: "string", value: "dir", description: "Existing project directory." },
  ],
} as const satisfies CliConfig;

const SESSION_TYPE_MAP: Record<string, string> = {
  component: "components",
  integration: "integrations",
};

function printSection(title: string): void {
  console.log("");
  console.log("=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60));
  console.log("");
}

function validateName(name: string): boolean {
  return /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/.test(name);
}

function checkPrismInstalled(): string | null {
  return timedStep("Check Prism CLI", () => {
    try {
      const result = spawnSync("prism", ["--version"], {
        encoding: "utf-8",
        timeout: 10000,
      });
      if (result.status === 0) {
        const version = result.stdout.trim();
        console.log(`Prism CLI installed: ${version}`);
        return version;
      }
    } catch {
      /* not installed */
    }
    return null;
  });
}

function checkLoggedIn(): Record<string, string> | null {
  return timedStep("Verify Authentication", () => {
    try {
      const result = spawnSync("prism", ["me"], {
        encoding: "utf-8",
        timeout: 30000,
      });
      if (result.status === 0) {
        const userInfo: Record<string, string> = {};
        for (const line of result.stdout.trim().split("\n")) {
          const colonIdx = line.indexOf(":");
          if (colonIdx > -1) {
            const key = line.slice(0, colonIdx).trim().toLowerCase();
            const value = line.slice(colonIdx + 1).trim();
            userInfo[key] = value;
          }
        }
        const name = userInfo.name ?? "Unknown";
        const email = userInfo.email ?? "Unknown";
        const endpoint = userInfo["endpoint url"] ?? userInfo.endpoint ?? "Unknown";
        console.log(`Logged in as: ${email}`);
        console.log(`   Name: ${name}`);
        console.log(`   Endpoint: ${endpoint}`);
        return { name, email, endpoint };
      }
      return null;
    } catch {
      return null;
    }
  });
}

function main(): number {
  const { values, positionals } = parseCliArgs(process.argv.slice(2), CLI);
  const name = positionals.at(-1) ?? "";
  const workflowType = values.type;
  const existingDir = typeof values.existing === "string" ? values.existing : "";

  const typeLabels: Record<string, string> = {
    component: "Prismatic Component Builder",
    integration: "Prismatic CNI Builder",
  };

  console.log(`${typeLabels[workflowType]} - Phase 1 Setup`);
  console.log("");

  if (!validateName(name)) {
    console.log("Invalid name");
    console.log("   Name must be lowercase with hyphens (e.g., 'canny', 'hubspot-crm')");
    return 1;
  }

  // Validate --existing project if provided
  let existingProject = "";
  if (existingDir) {
    let resolvedDir: string;
    try {
      resolvedDir = confineToProjectRoot(existingDir);
    } catch (e) {
      console.log(`\n${(e as Error).message}`);
      return 1;
    }
    existingProject = resolvedDir;
    const pkgPath = join(resolvedDir, "package.json");
    const indexPath = join(resolvedDir, "src/index.ts");

    if (!existsSync(pkgPath)) {
      console.log(`\nNot a valid project: missing package.json in ${resolvedDir}`);
      return 1;
    }

    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (!("@prismatic-io/spectral" in deps)) {
        console.log(`\nNot a Prismatic project: @prismatic-io/spectral not in dependencies`);
        return 1;
      }
    } catch {
      console.log(`\nFailed to read package.json in ${resolvedDir}`);
      return 1;
    }

    if (!existsSync(indexPath)) {
      console.log(`\nNot a valid CNI project: missing src/index.ts`);
      return 1;
    }

    console.log(`Existing project validated: ${resolvedDir}`);
  }

  let allPassed = true;
  let userInfo: Record<string, string> | null = null;

  // Check Prism CLI
  printSection("Checking Prism CLI");
  const version = checkPrismInstalled();

  if (!version) {
    // Can't prompt interactively in agent context — just fail
    console.log("\nPrism CLI not found. Install with: npm install -g @prismatic-io/prism");
    allPassed = false;
  }

  if (allPassed || version) {
    printSection("Verifying Authentication");
    userInfo = checkLoggedIn();
    if (!userInfo) {
      console.log("\nNot logged in to Prismatic. Please run: prism login");
      allPassed = false;
    }
  }

  // Create session directory
  const sessionType = SESSION_TYPE_MAP[workflowType];
  let sessionDir: string | null = null;
  if (allPassed) {
    sessionDir = ensureSessionDirectory(name, sessionType);
    console.log(`\nSession directory created: ${sessionDir}`);
  }

  // Final status
  console.log("");
  console.log("=".repeat(60));
  console.log(allPassed ? "  PHASE 1 SETUP COMPLETE" : "  PHASE 1 SETUP INCOMPLETE");
  console.log("=".repeat(60));

  printTimingSummary();
  console.log("");

  if (allPassed && sessionDir) {
    const requirementsFile = `${sessionDir}/requirements.json`;
    if (!existsSync(requirementsFile)) {
      writeFileSync(requirementsFile, JSON.stringify({}, null, 2));
    }
    const output: Record<string, unknown> = {
      status: "ready",
      name,
      type: workflowType,
      session_dir: sessionDir,
      requirements_file: requirementsFile,
      user: userInfo,
    };

    if (existingProject) {
      output.existing_project = existingProject;
    }

    console.log("Ready for Phase 2 - Requirements Gathering!");
    console.log("");
    console.log(`Name: ${name}`);
    console.log(`Type: ${workflowType}`);
    console.log(`Session directory: ${sessionDir}`);
    if (userInfo) {
      console.log(`Prismatic: ${userInfo.endpoint ?? "Unknown"}`);
      console.log(`User: ${userInfo.email ?? "Unknown"}`);
    }
    console.log("");
    console.log("Next: Run requirements gathering");
    console.log(
      `   prismatic-tools update-tasks --session ${name} --type ${workflowType} --actionable`,
    );
    console.log("");
    console.log("--- Setup Data (JSON) ---");
    console.log(JSON.stringify(output, null, 2));
  }

  if (!allPassed) {
    return userInfo ? 2 : 1;
  }

  return 0;
}

process.exit(main());
