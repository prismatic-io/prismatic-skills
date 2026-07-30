#!/usr/bin/env node
/**
 * troubleshoot.ts
 *
 * PURPOSE: Diagnose common issues with Prismatic integration development
 *
 * USAGE: node troubleshoot.ts [project-directory]
 *
 * EXIT CODES:
 *   Returns number of issues found (0 = all checks passed)
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { exec } from "../../vendor/tinyexec/main.mjs";
import { ensureAuthenticated } from "../shared/graphql.ts";
import { isAuthError, isNetworkError, runPrismQuery } from "../shared/prism-retry.ts";

const checkPrismCli = async (): Promise<[boolean | null, string]> => {
  try {
    await ensureAuthenticated();
  } catch {
    // check_network_and_auth handles the diagnostic
  }

  try {
    const result = await exec("prism", ["--version"], { timeout: 5000 });
    if (result.exitCode === 0) {
      const version = result.stdout.trim();
      return [true, `Prism CLI: Installed (${version})`];
    }
    return [false, "Prism CLI: Installed but not working correctly"];
  } catch (e) {
    if (e instanceof Error && e.message.includes("ENOENT")) {
      return [false, "Prism CLI: Not installed (run setup prerequisites first)"];
    }
    return [false, `Prism CLI: Error checking (${e})`];
  }
};

const checkNetworkAndAuth = async (): Promise<[boolean | null, string]> => {
  try {
    const result = await runPrismQuery(["prism", "me"], 10);

    if (result.returncode === 0) {
      const lines = result.stdout.trim().split("\n");
      if (lines[0]) {
        return [true, `Network & Auth: Connected as ${lines[0]}`];
      }
      return [true, "Network & Auth: Connected and authenticated"];
    }

    const errorText = `${result.stderr || ""} ${result.stdout || ""}`;

    if (isNetworkError(errorText)) {
      return [false, "Network: Cannot reach *.prismatic.io (check firewall/proxy)"];
    }

    if (isAuthError(errorText)) {
      return [false, "Auth: Not authenticated (run setup prerequisites)"];
    }

    return [false, "Network & Auth: Connection failed"];
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.includes("TIMEOUT")) {
        return [false, "Network: Connection timeout to Prismatic"];
      }
      if (e.message.includes("ENOENT")) {
        return [null, "Network & Auth: Cannot test (prism CLI not installed)"];
      }
    }
    return [false, `Network & Auth: Error (${e})`];
  }
};

const checkNode = async (): Promise<[boolean | null, string]> => {
  try {
    const result = await exec(process.execPath, ["--version"], { timeout: 5000 });
    if (result.exitCode === 0) {
      const version = result.stdout.trim();
      const [majorVersion, minorVersion] = version
        .replace(/^v/, "")
        .split(".")
        .map((part) => Number.parseInt(part, 10));

      if (majorVersion > 22 || (majorVersion === 22 && minorVersion >= 18)) {
        return [true, `Node.js: ${version} (compatible)`];
      }
      return [false, `Node.js: ${version} (requires v22.18+ for native TypeScript)`];
    }
    return [false, "Node.js: Installed but not working"];
  } catch (e) {
    if (e instanceof Error && e.message.includes("ENOENT")) {
      return [false, "Node.js: Not installed (download from nodejs.org)"];
    }
    return [false, `Node.js: Error (${e})`];
  }
};

function checkProject(projectDir: string | null): [boolean | null, string] {
  if (!projectDir) return [null, "Project: Not specified"];

  try {
    if (!statSync(projectDir).isDirectory()) {
      return [false, `Project: Directory not found (${projectDir})`];
    }
  } catch {
    return [false, `Project: Directory not found (${projectDir})`];
  }

  if (!existsSync(join(projectDir, "package.json"))) {
    return [false, "Project: Missing package.json"];
  }

  try {
    if (!statSync(join(projectDir, "src")).isDirectory()) {
      return [false, "Project: Missing src/ directory"];
    }
  } catch {
    return [false, "Project: Missing src/ directory"];
  }

  try {
    if (!statSync(join(projectDir, "node_modules")).isDirectory()) {
      return [false, "Project: Dependencies not installed (run: npm install)"];
    }
  } catch {
    return [false, "Project: Dependencies not installed (run: npm install)"];
  }

  try {
    if (!statSync(join(projectDir, "dist")).isDirectory()) {
      return [null, "Project: Not built yet (run: npm run build)"];
    }
  } catch {
    return [null, "Project: Not built yet (run: npm run build)"];
  }

  return [true, "Project: Structure valid and built"];
}

const troubleshoot = async (projectDir: string | null): Promise<number> => {
  console.log("Troubleshooting Prismatic Integration Development Environment");
  console.log("");

  const checks: Array<[string, () => Promise<[boolean | null, string]>]> = [
    ["Prism CLI", checkPrismCli],
    ["Node.js", checkNode],
    ["Network & Auth", checkNetworkAndAuth],
  ];

  if (projectDir) {
    checks.push(["Project", async () => checkProject(projectDir)]);
  }

  let issues = 0;
  let warnings = 0;

  for (const [name, checkFn] of checks) {
    try {
      const [passed, message] = await checkFn();
      if (passed === true) {
        console.log(`  OK: ${message}`);
      } else if (passed === null) {
        console.log(`  WARN: ${message}`);
        warnings++;
      } else {
        console.log(`  FAIL: ${message}`);
        issues++;
      }
    } catch (e) {
      console.log(`  FAIL: ${name}: Unexpected error - ${e}`);
      issues++;
    }
  }

  console.log("");
  console.log("=".repeat(60));

  if (issues === 0 && warnings === 0) {
    console.log("All checks passed! Your environment is ready.");
    console.log("");
    console.log("Next steps:");
    if (projectDir) {
      console.log("  - Continue working on your integration");
      console.log("  - Build: node build-integration.ts <project>");
      console.log("  - Deploy: node deploy-integration.ts <project>");
    } else {
      console.log("  - Run setup prerequisites");
      console.log("  - Search components: node find-components.ts <term>");
    }
  } else if (issues === 0) {
    console.log(`All critical checks passed, but ${warnings} warning(s) found.`);
    console.log("");
    console.log("Review the warnings above and address if needed.");
  } else {
    console.log(`Found ${issues} issue(s) and ${warnings} warning(s)`);
    console.log("");
    console.log("Common fixes:");
    console.log("  - Run setup prerequisites");
    console.log("  - Check network access to *.prismatic.io");
  }

  console.log("=".repeat(60));

  return issues;
};

const main = async (): Promise<number> => {
  const projectDir = process.argv[2] ?? null;
  return troubleshoot(projectDir);
};

process.exit(await main());
