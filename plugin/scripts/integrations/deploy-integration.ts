#!/usr/bin/env npx tsx
/**
 * deploy-integration.ts
 *
 * PURPOSE: Deploy built integration to the platform, then surface the
 *          test instance details so the agent can guide configuration + testing.
 *
 * USAGE: npx tsx deploy-integration.ts <project-directory>
 *
 * EXIT CODES:
 *   0 - Success: Integration deployed
 *   1 - Error: Project directory not found or not built
 *   2 - Error: Authentication failed
 *   3 - Error: Import failed
 */

import { existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { ensureAuthenticated, graphql, GraphQLError } from "../shared/graphql.js";
import { runPrismMutation, runPrismQuery } from "../shared/prism-retry.js";
import { confineToProjectRoot } from "../shared/project-directory.js";

function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy wait — acceptable for short CLI delays
  }
}

/**
 * Find the integration ID by name using `prism integrations:list`.
 * More reliable than regex on import stdout.
 */
function findIntegrationId(projectName: string): string | null {
  try {
    const result = runPrismQuery(
      ["prism", "integrations:list", "--output", "json", "--extended"],
      15,
    );
    if (result.returncode !== 0 || !result.stdout) return null;

    const integrations = JSON.parse(result.stdout);
    if (!Array.isArray(integrations)) return null;

    // Match by name (case-insensitive, hyphen-normalized)
    const normalized = projectName.toLowerCase().replace(/-/g, " ");
    const match = integrations.find((i: Record<string, unknown>) => {
      const name = String(i.name || "")
        .toLowerCase()
        .replace(/-/g, " ");
      return name === normalized || name.includes(normalized);
    });

    return (match?.id as string) || null;
  } catch {
    return null;
  }
}

interface TestInstanceInfo {
  instance_id: string;
  designer_url: string;
  config_state: string;
  unconfigured: Array<{ key: string; type: string }>;
  flow_urls: Array<{ name: string; stable_key: string; webhook_url: string }>;
}

/**
 * Find the system/test instance and return its config status + designer URL.
 */
function getTestInstanceInfo(integrationId: string): TestInstanceInfo | null {
  try {
    const data = graphql(`{
      instances(integration: "${integrationId}", isSystem: true) {
        nodes {
          id
          name
          configState
          configVariables {
            nodes {
              value
              status
              requiredConfigVariable {
                key
                dataType
              }
            }
          }
          flowConfigs {
            nodes {
              flow { name stableKey }
              webhookUrl
            }
          }
        }
      }
    }`) as Record<string, unknown>;

    const instances = data?.instances as { nodes: Array<Record<string, unknown>> } | undefined;
    if (!instances?.nodes?.length) return null;

    const instance = instances.nodes[0];
    const instanceId = instance.id as string;

    const configVars =
      (instance.configVariables as { nodes: Array<Record<string, unknown>> })?.nodes ?? [];
    const unconfigured = configVars
      .filter((cv) => {
        const status = cv.status as string;
        return status === "PENDING" || status === "ERROR" || !cv.value;
      })
      .map((cv) => {
        const rcv = cv.requiredConfigVariable as Record<string, unknown>;
        return {
          key: (rcv?.key as string) || "",
          type: (rcv?.dataType as string) || "",
        };
      })
      .filter((cv) => cv.key);

    const flowConfigs =
      (instance.flowConfigs as { nodes: Array<Record<string, unknown>> })?.nodes ?? [];
    const flowUrls = flowConfigs
      .filter((fc) => fc.webhookUrl)
      .map((fc) => {
        const flow = fc.flow as Record<string, unknown>;
        return {
          name: (flow?.name as string) || "",
          stable_key: (flow?.stableKey as string) || "",
          webhook_url: (fc.webhookUrl as string) || "",
        };
      });

    const baseUrl = process.env.PRISMATIC_URL || "https://app.prismatic.io";

    return {
      instance_id: instanceId,
      designer_url: `${baseUrl}/designer/${instanceId}`,
      config_state: (instance.configState as string) || "UNKNOWN",
      unconfigured,
      flow_urls: flowUrls,
    };
  } catch {
    return null;
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

  const cmd = ["prism", "integrations:import", "--open"];
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

      // --- Reliable integration ID extraction (B) ---
      const projectName = basename(projectDir) || "unknown";
      let integrationId = result.stdout?.match(/ID:\s*(\S+)/)?.[1] || null;

      if (!integrationId || integrationId === "unknown") {
        // Fallback: search by name
        integrationId = findIntegrationId(projectName);
      }

      if (!integrationId) {
        // Last resort: try package.json name
        try {
          const pkg = JSON.parse(readFileSync(join(projectDir, "package.json"), "utf-8"));
          if (pkg.name) {
            integrationId = findIntegrationId(pkg.name);
          }
        } catch {
          /* ignore */
        }
      }

      // --- Test instance info (A) ---
      let testInstance: TestInstanceInfo | null = null;
      if (integrationId) {
        testInstance = getTestInstanceInfo(integrationId);
      }

      // --- Emit structured deploy result ---
      console.log("");
      console.log("<deploy-result>");

      const deployResult: Record<string, unknown> = {
        status: "deployed",
        integration_name: projectName,
        integration_id: integrationId || "unknown",
        next_required_action: "configure_test_instance",
        exit_state: "deployed_awaiting_config",
      };

      if (testInstance) {
        deployResult.test_instance = {
          instance_id: testInstance.instance_id,
          designer_url: testInstance.designer_url,
          config_state: testInstance.config_state,
          unconfigured_count: testInstance.unconfigured.length,
          unconfigured: testInstance.unconfigured,
          flow_urls: testInstance.flow_urls,
        };
        deployResult.guidance = [
          `Open the test instance designer: ${testInstance.designer_url}`,
          testInstance.unconfigured.length > 0
            ? `Configure ${testInstance.unconfigured.length} unconfigured item(s): ${testInstance.unconfigured.map((u) => u.key).join(", ")}`
            : "All config variables are set",
          "Ask the user to confirm configuration is complete before running tests",
          "Do NOT produce a final summary until test_outcome is determined",
        ];
      } else {
        // Fallback guidance (E) — include the query so the agent can run it
        deployResult.guidance = [
          "Could not automatically find the test instance. Run this to find it:",
          integrationId
            ? `prism graphql:query '{ instances(integration: "${integrationId}", isSystem: true) { nodes { id name configState configVariables { nodes { value status requiredConfigVariable { key label dataType } } } } } }'`
            : "prism integrations:list --output json --extended  (find the ID, then query for system instances)",
          "Guide the user through configuration in the designer",
          "Run tests after configuration is complete",
          "Do NOT produce a final summary until test_outcome is determined",
        ];
      }

      console.log(JSON.stringify(deployResult, null, 2));
      console.log("</deploy-result>");

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

  let projectDir: string;
  try {
    projectDir = confineToProjectRoot(process.argv[2]);
  } catch (e) {
    console.log((e as Error).message);
    return 1;
  }

  return deployIntegration(projectDir);
}

process.exit(main());
