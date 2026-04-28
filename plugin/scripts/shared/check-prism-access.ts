#!/usr/bin/env npx tsx
/**
 * check-prism-access.ts
 *
 * PURPOSE: Test network connectivity and authentication to Prismatic API
 *
 * USAGE: npx tsx check-prism-access.ts
 *
 * EXIT CODES:
 *   0 - Success: Prism CLI is accessible and authenticated
 *   1 - Network error: Cannot reach Prismatic API
 *   2 - Authentication error: Not logged in or token expired
 *   3 - Other error
 */

import { isAuthError, isNetworkError, runPrismQuery } from "./prism-retry.js";

function printNetworkGuidance(): void {
  console.log("To fix network access issues:");
  console.log("");
  console.log("OPTION 1: Enable network access in Claude (Team/Enterprise plans)");
  console.log("  1. Open Claude Settings");
  console.log("  2. Navigate to: Admin settings > Capabilities");
  console.log("  3. Under 'Network access', select:");
  console.log("     'Allow network egress to package managers and specific domains'");
  console.log("  4. Add the domain: *.prismatic.io");
  console.log("  5. Save and try again");
  console.log("");
  console.log("OPTION 2: Use a token for authentication (if network is available)");
  console.log("  If you have network access but see this error:");
  console.log("  1. On your local machine, run: prism me:token");
  console.log("  2. Copy the token");
  console.log("  3. Provide it to this skill for authentication");
  console.log("");
  console.log("For more details:");
  console.log("  https://support.claude.com/en/articles/12111783");
  console.log("  https://prismatic.io/docs/cli/");
}

function printAuthGuidance(): void {
  console.log("To fix authentication issues:");
  console.log("");
  console.log("OPTION 1: Run prism login (requires browser access)");
  console.log("  1. Run: prism login");
  console.log("  2. Your browser will open to authenticate");
  console.log("  3. Log in with your Prismatic credentials");
  console.log("  4. Return here and try again");
  console.log("");
  console.log("OPTION 2: Use authentication token (for headless environments)");
  console.log("  1. On a machine with browser access, run: prism login");
  console.log("  2. Then run: prism me:token");
  console.log("  3. Copy the token");
  console.log("  4. Set the environment variable:");
  console.log("     export PRISM_REFRESH_TOKEN=<your-token>");
  console.log("  5. Try again");
  console.log("");
  console.log("NOTE: Tokens expire periodically and will need to be refreshed.");
  console.log("");
  console.log("For more details: https://prismatic.io/docs/cli/");
}

function checkPrismAccess(): number {
  console.log("Testing Prism CLI connectivity...");
  console.log("");

  try {
    const result = runPrismQuery(["prism", "me"], 30);

    if (result.returncode === 0) {
      console.log("Prism CLI is accessible and authenticated");
      console.log("");
      console.log("User Information:");
      console.log(result.stdout);
      return 0;
    }

    const combinedOutput = `${result.stderr || ""} ${result.stdout || ""}`;

    if (isNetworkError(combinedOutput)) {
      console.log("Network access to Prismatic is blocked");
      console.log("");
      console.log("Error details:");
      console.log(result.stderr || result.stdout);
      console.log("");
      printNetworkGuidance();
      return 1;
    }

    if (isAuthError(combinedOutput)) {
      console.log("Prism CLI is not authenticated");
      console.log("");
      console.log("Error details:");
      console.log(result.stderr || result.stdout);
      console.log("");
      printAuthGuidance();
      return 2;
    }

    console.log("Unexpected error from Prism CLI");
    console.log("");
    if (result.stderr) {
      console.log("Error output:");
      console.log(result.stderr);
    }
    if (result.stdout) {
      console.log("Standard output:");
      console.log(result.stdout);
    }
    return 3;
  } catch (e) {
    if (e instanceof Error && e.message.includes("ENOENT")) {
      console.log("Prism CLI not found");
      console.log("Run setup prerequisites first");
      return 3;
    }
    console.log(`Unexpected error: ${e}`);
    return 3;
  }
}

process.exit(checkPrismAccess());
