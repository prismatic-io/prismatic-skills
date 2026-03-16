#!/usr/bin/env npx tsx
/**
 * deploy-integration.ts
 *
 * PURPOSE: Deploy built integration to the platform
 *
 * USAGE: npx tsx deploy-integration.ts <project-directory>
 *
 * EXIT CODES:
 *   0 - Success: Integration deployed
 *   1 - Error: Project directory not found or not built
 *   2 - Error: Authentication failed
 *   3 - Error: Import failed
 */

import { existsSync } from "node:fs";
import { ensureAuthenticated, GraphQLError } from "../shared/graphql.js";
import { runPrismMutation } from "../shared/prism-retry.js";

function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy wait — acceptable for short CLI delays
  }
}

function deployIntegration(projectDir: string): number {
  if (!existsSync(projectDir)) {
    console.log(`Project directory not found: ${projectDir}`);
    return 1;
  }

  const distDir = `${projectDir}/dist`;
  if (!existsSync(distDir)) {
    console.log("Build artifacts not found");
    console.log("");
    console.log("You need to build the integration first.");
    console.log(`Run: npx tsx scripts/integrations/build-integration.ts ${projectDir}`);
    return 1;
  }

  console.log(`Deploying integration: ${projectDir}`);
  console.log("");

  try {
    ensureAuthenticated();
  } catch (e) {
    if (e instanceof GraphQLError) {
      console.log(e.message);
      return 2;
    }
    throw e;
  }

  const cmd = ["prism", "integrations:import"];
  console.log(`Running: ${cmd.join(" ")}`);
  console.log("");

  try {
    const result = runPrismMutation(cmd, { timeout: 60, cwd: projectDir });

    if (result.returncode === 0) {
      console.log("Integration deployed successfully!");
      console.log("");

      if (result.stdout) console.log(result.stdout);

      console.log("");
      console.log("Waiting 5 seconds for integration to be fully available...");
      sleepSync(5000);
      console.log("");

      console.log("Next steps:");
      console.log("  - View and configure integration in the web app");
      console.log(
        `  - Test: npx tsx scripts/shared/test-integration.ts <integration-id> --integration-dir ${projectDir}`
      );
      console.log(
        `  - Package for download: npx tsx scripts/shared/package-for-download.ts ${projectDir}`
      );
      console.log("");
      console.log("TESTING: Always use scripts/test-integration.ts");
      console.log("   Do NOT use prism commands directly for testing");

      return 0;
    } else {
      console.log("Deployment failed");
      console.log("");

      if (result.stderr) {
        console.log("Error output:");
        console.log(result.stderr);
      }
      if (result.stdout) {
        console.log("");
        console.log("Standard output:");
        console.log(result.stdout);
      }

      console.log("");
      console.log("Troubleshooting:");
      console.log("  - Ensure you're authenticated: npx tsx scripts/shared/check-prism-access.ts");
      console.log("  - Verify build succeeded: check dist/ directory");
      console.log("  - Check for validation errors in your integration definition");
      return 3;
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("ENOENT")) {
      console.log("Prism CLI not found");
      console.log("Run prerequisites first");
      return 3;
    }
    console.log(`Unexpected error: ${e}`);
    return 3;
  }
}

function main(): number {
  if (process.argv.length < 3) {
    console.log("No project directory provided");
    console.log("Usage: npx tsx deploy-integration.ts <project-directory>");
    return 1;
  }

  return deployIntegration(process.argv[2]);
}

process.exit(main());
