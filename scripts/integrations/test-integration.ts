#!/usr/bin/env npx tsx
/**
 * test-integration.ts
 *
 * PURPOSE: Run test execution of deployed integration
 *
 * USAGE: npx tsx test-integration.ts <integration-id> [flow-name]
 *   [--payload <file>] [--content-type <type>] [--integration-dir <dir>]
 *
 * EXIT CODES:
 *   0 - Success: Test execution completed
 *   1 - Error: Integration ID not provided
 *   2 - Error: Test execution failed
 *   3 - Error: No flows found or flow listing failed
 */

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ensureAuthenticated, GraphQLError } from "../shared/graphql.js";
import { runPrismQuery } from "../shared/prism-retry.js";

interface TriggerMetadata {
  needs_payload: boolean;
  content_type: string;
  sample_payload: string | null;
}

function loadTriggerMetadata(
  integrationDir: string | null,
  flowStableKey: string | null
): TriggerMetadata {
  const result: TriggerMetadata = {
    needs_payload: false,
    content_type: "application/json",
    sample_payload: null,
  };

  if (!integrationDir || !existsSync(integrationDir)) return result;

  const metadataFile = join(integrationDir, "test-data", "trigger-config.json");
  if (!existsSync(metadataFile)) return result;

  try {
    const metadata = JSON.parse(readFileSync(metadataFile, "utf-8"));
    const flows = metadata.flows;

    if (!flows || typeof flows !== "object" || Array.isArray(flows)) {
      console.log(
        `Warning: Invalid trigger-config.json: 'flows' must be an object/dict`
      );
      return result;
    }

    let flowConfig: Record<string, unknown> | null = null;
    let foundKey: string | null = null;

    if (flowStableKey && flows[flowStableKey]) {
      flowConfig = flows[flowStableKey];
      foundKey = flowStableKey;
    } else if (flowStableKey) {
      for (const [key, config] of Object.entries(flows)) {
        if ((config as Record<string, unknown>).name === flowStableKey) {
          flowConfig = config as Record<string, unknown>;
          foundKey = key;
          break;
        }
      }
    }

    if (!flowConfig) return result;

    if (flowConfig.triggerType !== "webhook") return result;

    const webhookConfig = (flowConfig.webhook ?? {}) as Record<string, unknown>;
    if (!webhookConfig.expectsPayload) return result;

    result.needs_payload = true;
    result.content_type = (webhookConfig.contentType as string) ?? "application/json";

    const flowIdentifier = foundKey || flowStableKey;
    if (flowIdentifier) {
      const payloadPath = findExistingPayloadFile(integrationDir, flowIdentifier);
      if (payloadPath) {
        result.sample_payload = payloadPath;
      } else {
        console.log(
          `Warning: No test payload found at test-data/${flowIdentifier}/sample-payload.*`
        );
      }
    }
  } catch (e) {
    console.log(`Warning: Could not load trigger metadata: ${e}`);
  }

  return result;
}

function findExistingPayloadFile(
  integrationDir: string,
  flowKey: string
): string | null {
  const testDataDir = join(integrationDir, "test-data", flowKey);

  try {
    if (!existsSync(testDataDir)) return null;
  } catch {
    return null;
  }

  for (const ext of [".json", ".xml", ".txt"]) {
    const payloadFile = join(testDataDir, `sample-payload${ext}`);
    if (existsSync(payloadFile)) return payloadFile;
  }

  return null;
}

interface FlowInfo {
  name?: string;
  stableKey?: string;
  description?: string;
  testUrl?: string;
}

function listFlows(integrationId: string): FlowInfo[] {
  try {
    const result = runPrismQuery(
      [
        "prism",
        "integrations:flows:list",
        integrationId,
        "--extended",
        "--output",
        "json",
      ],
      30
    );

    if (result.returncode === 0 && result.stdout) {
      const flows = JSON.parse(result.stdout);
      return Array.isArray(flows) ? flows : [];
    }
    return [];
  } catch (e) {
    console.log(`Warning: Could not list flows: ${e}`);
    return [];
  }
}

function testSingleFlow(
  flowName: string,
  testUrl: string,
  payloadFile?: string | null,
  contentType?: string | null
): boolean {
  console.log(`Testing flow: ${flowName}`);
  if (payloadFile) {
    console.log(`   Using payload: ${payloadFile} (${contentType})`);
  }
  console.log("");

  try {
    const cmd = [
      "prism",
      "integrations:flows:test",
      "--flow-url",
      testUrl,
      "--tail-logs",
      "--tail-results",
      "--cni-auto-end",
      "--debug",
      "--jsonl",
    ];

    if (payloadFile && existsSync(payloadFile)) {
      cmd.push("--payload", payloadFile);
      if (contentType) {
        cmd.push("--payload-content-type", contentType);
      }
    }

    console.log("Test Output:");
    console.log("-".repeat(60));

    const result = spawnSync(cmd[0], cmd.slice(1), {
      encoding: "utf-8",
      stdio: "inherit",
    });

    console.log("-".repeat(60));
    console.log("");

    if (result.status === 0) {
      console.log(`Flow '${flowName}' completed successfully`);
      console.log("");
      return true;
    } else {
      console.log(
        `Flow '${flowName}' failed with exit code ${result.status}`
      );
      console.log("");
      return false;
    }
  } catch (e) {
    console.log(`Error testing flow '${flowName}': ${e}`);
    return false;
  }
}

function testIntegration(
  integrationId: string,
  specificFlow: string | null,
  payloadFile: string | null,
  contentType: string | null,
  integrationDir: string | null
): number {
  // Validate integration ID format (base64 decoding to "Integration:{uuid}")
  try {
    const decoded = Buffer.from(integrationId, "base64").toString("utf-8");
    if (!decoded.startsWith("Integration:")) {
      console.log("ERROR: Invalid integration ID");
      console.log("");
      console.log(`Received: ${integrationId}`);
      console.log(`Decoded to: ${decoded}`);
      console.log("");
      console.log("Integration IDs must decode to a string starting with 'Integration:'");
      console.log("");
      console.log("To get the correct integration ID:");
      console.log("  prism integrations:list --output json");
      return 2;
    }
  } catch (e) {
    console.log("ERROR: Invalid integration ID format");
    console.log("");
    console.log(`Received: ${integrationId}`);
    console.log(`Decode error: ${e}`);
    console.log("");
    console.log("To get the correct integration ID:");
    console.log("  prism integrations:list --output json");
    return 2;
  }

  console.log(`Testing integration: ${integrationId}`);
  console.log("");

  try {
    ensureAuthenticated();
  } catch (e) {
    if (e instanceof GraphQLError) console.log(e.message);
    return 2;
  }

  // Check if connections are configured before attempting test
  try {
    const configResult = runPrismQuery(
      ["prism", "integrations:flows:list", integrationId, "--output", "json"],
      15
    );
    if (configResult.returncode === 0 && configResult.stdout) {
      const flowsData = JSON.parse(configResult.stdout);
      const flows = Array.isArray(flowsData) ? flowsData : [];
      const hasUnconfigured = flows.some(
        (f: Record<string, unknown>) => f.configState === "NEEDS_CONFIGURATION"
      );
      if (hasUnconfigured) {
        console.log("WARNING: Integration has unconfigured connections.");
        console.log("Live testing may fail until connections are configured.");
        console.log("");
        console.log("To configure connections:");
        console.log("  prism integrations:open " + integrationId);
        console.log("");
        console.log("Proceeding with test attempt anyway...");
        console.log("");
      }
    }
  } catch {
    // Non-fatal — proceed with test anyway
  }

  // Initialize payload detection
  let detectedPayload: string | null = null;
  let detectedContentType: string | null = null;
  if (!payloadFile && integrationDir && specificFlow) {
    const requirements = loadTriggerMetadata(integrationDir, specificFlow);
    if (requirements.needs_payload) {
      detectedPayload = requirements.sample_payload;
      detectedContentType = requirements.content_type;
      if (detectedPayload) {
        console.log(
          `Loaded trigger metadata: webhook expecting ${detectedContentType}`
        );
        console.log(`   Generated test payload: ${detectedPayload}`);
        console.log("");
      }
    }
  }

  const finalPayload = payloadFile || detectedPayload;
  const finalContentType = contentType || detectedContentType;

  // If specific flow provided, test only that flow
  if (specificFlow) {
    console.log(`Finding flow: ${specificFlow}`);
    const flows = listFlows(integrationId);

    if (flows.length === 0) {
      console.log("Could not list flows");
      return 2;
    }

    const matchingFlow = flows.find((f) => f.name === specificFlow);

    if (!matchingFlow) {
      console.log(`Flow '${specificFlow}' not found`);
      console.log("");
      console.log("Available flows:");
      for (const flow of flows) {
        console.log(`  - ${flow.name}`);
      }
      return 2;
    }

    if (!matchingFlow.testUrl) {
      console.log(`No test URL available for flow '${specificFlow}'`);
      return 2;
    }

    const success = testSingleFlow(
      specificFlow,
      matchingFlow.testUrl,
      finalPayload,
      finalContentType
    );
    if (success) {
      console.log("");
      console.log("Next steps:");
      console.log("  - Review test results above");
      console.log("  - Verify the integration behaved as expected");
      return 0;
    } else {
      console.log("");
      console.log("Troubleshooting:");
      console.log("  - Check integration logs in Prismatic web app");
      console.log("  - Verify all required connections are configured");
      console.log("  - Update code and redeploy if needed");
      return 2;
    }
  }

  // Otherwise, list flows for user to choose
  console.log("Discovering flows...");
  const flows = listFlows(integrationId);

  if (flows.length === 0) {
    console.log("No flows found or could not list flows");
    console.log("");
    console.log("Possible causes:");
    console.log("  - Integration ID is incorrect");
    console.log("  - Integration has no flows configured");
    console.log("  - Network or authentication issues");
    return 3;
  }

  // Single flow - test it automatically
  if (flows.length === 1) {
    const flow = flows[0];
    const flowName = flow.name || flow.stableKey || "unnamed-flow";
    const testUrl = flow.testUrl;

    if (!testUrl) {
      console.log(`No test URL available for flow '${flowName}'`);
      return 2;
    }

    console.log(`Found 1 flow: ${flowName}`);

    // Reload trigger metadata now that we have the flow name
    let fp = finalPayload;
    let fct = finalContentType;
    if (!payloadFile && integrationDir && !fp) {
      const requirements = loadTriggerMetadata(integrationDir, flowName);
      if (requirements.needs_payload) {
        fp = requirements.sample_payload;
        fct = requirements.content_type;
        if (fp) {
          console.log(
            `Loaded trigger metadata: webhook expecting ${fct}`
          );
          console.log(`   Generated test payload: ${fp}`);
          console.log("");
        }
      }
    }

    console.log("Testing automatically...");
    console.log("");
    const success = testSingleFlow(flowName, testUrl, fp, fct);
    if (success) {
      console.log("");
      console.log("Next steps:");
      console.log("  - Review test results above");
      console.log("  - Verify the integration behaved as expected");
      console.log("  - Ready for Phase 7: Delivery (package for download)");
      return 0;
    } else {
      console.log("");
      console.log("Troubleshooting:");
      console.log("  - Check integration logs in Prismatic web app");
      console.log("  - Update code and redeploy if needed");
      return 2;
    }
  }

  // Multiple flows - list them and exit for user to choose
  console.log(`Found ${flows.length} flows in this integration:`);
  console.log("");
  for (let i = 0; i < flows.length; i++) {
    const flow = flows[i];
    const flowName = flow.name || flow.stableKey;
    const description = flow.description || "";
    console.log(`${i + 1}. ${flowName}`);
    if (description) console.log(`   ${description}`);
  }
  console.log("");
  console.log("=".repeat(60));
  console.log("MULTIPLE FLOWS FOUND");
  console.log("=".repeat(60));
  console.log("");
  console.log("Please specify which flow to test by re-running with:");
  console.log(
    `  npx tsx scripts/test-integration.ts ${integrationId} <flow-name>`
  );
  console.log("");
  console.log("Available flow names:");
  for (const flow of flows) {
    console.log(`  - ${flow.name || flow.stableKey}`);
  }
  console.log("");
  console.log(
    "Claude: Ask the user which flow they want to test, then re-run"
  );
  console.log("   the script with the chosen flow name as the second argument.");
  return 0;
}

function main(): number {
  if (process.argv.length < 3) {
    console.log("No integration ID provided");
    console.log("");
    console.log(
      "Usage: npx tsx test-integration.ts <integration-id> [flow-name] [--payload <file>] [--content-type <type>] [--integration-dir <dir>]"
    );
    return 1;
  }

  const args = process.argv.slice(2);
  const integrationId = args[0];
  let specificFlow: string | null = null;
  let payloadFile: string | null = null;
  let contentType: string | null = null;
  let integrationDir: string | null = null;

  let i = 1;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--payload" && i + 1 < args.length) {
      payloadFile = args[++i];
    } else if (arg === "--content-type" && i + 1 < args.length) {
      contentType = args[++i];
    } else if (arg === "--integration-dir" && i + 1 < args.length) {
      integrationDir = args[++i];
    } else if (!arg.startsWith("--") && specificFlow === null) {
      specificFlow = arg;
    }
    i++;
  }

  return testIntegration(
    integrationId,
    specificFlow,
    payloadFile,
    contentType,
    integrationDir
  );
}

process.exit(main());
