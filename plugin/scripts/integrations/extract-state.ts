#!/usr/bin/env npx tsx
/**
 * extract-state.ts
 *
 * Extends locate-project.ts with deep extraction: parses existing source code
 * into spec-answer format, producing a "before snapshot" for the modify workflow.
 *
 * The agent reads this snapshot to know what the integration already does,
 * then asks ONLY about what the user wants to change.
 *
 * USAGE:
 *   npx tsx extract-state.ts <path-or-name>
 *   npx tsx extract-state.ts .
 *   npx tsx extract-state.ts /absolute/path/to/project
 *
 * OUTPUT (JSON):
 *   {
 *     "project_dir": "/path/to/project",
 *     "name": "my-integration",
 *     "architecture": { ... },          // from locate-project
 *     "state": {
 *       "systems": "...",               // integration-scoped answers
 *       "flow_count": "2",
 *       "endpoint_type": "flow_specific",
 *       "flows": {
 *         "order-sync": {               // per-flow answers
 *           "trigger_type": "webhook",
 *           "error_handler_type": "retry",
 *           ...
 *         }
 *       }
 *     },
 *     "extraction_gaps": [...]           // items that can't be extracted from code
 *   }
 *
 * EXIT CODES:
 *   0 - Success
 *   1 - Project not found or invalid
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FlowInfo {
  name: string;
  stableKey: string;
  file: string;
  hasTrigger: boolean;
  hasExecution: boolean;
}

interface Architecture {
  flow_structure: "single-file" | "directory";
  flows: FlowInfo[];
  components: string[];
  connections: string[];
  config_pages: string[];
  has_lifecycle_hooks: boolean;
}

interface FlowState {
  trigger_type?: string;
  is_synchronous?: string;
  error_handler_type?: string;
  error_retry_max_attempts?: string;
  error_retry_delay_seconds?: string;
  error_retry_backoff?: string;
  error_retry_ignore_final?: string;
  execution_retry_enabled?: string;
  execution_retry_max_attempts?: string;
  execution_retry_delay_minutes?: string;
  execution_retry_backoff?: string;
  execution_retry_cancellation_field?: string;
  queue_fifo_enabled?: string;
  queue_concurrency_limit?: string;
  queue_singleton_executions?: string;
  queue_dedupe_field?: string;
  endpoint_security?: string;
  organization_api_keys?: string;
  schedule_value?: string;
  schedule_timezone?: string;
  needs_deploy_hooks?: string;
  needs_webhook_lifecycle?: string;
  needs_state_management?: string;
  state_scope?: string;
}

interface IntegrationState {
  flow_count?: string;
  endpoint_type?: string;
  preprocess_flow_routing?: string;
  routing_flow_name_field?: string;
  routing_external_customer_id_field?: string;
  flows: Record<string, FlowState>;
  [key: string]: unknown;
}

interface ExtractResult {
  project_dir: string;
  name: string;
  architecture: Architecture;
  state: IntegrationState;
  extraction_gaps: string[];
}

// ---------------------------------------------------------------------------
// Reused from locate-project.ts (inlined so extract-state.ts runs standalone)
// ---------------------------------------------------------------------------

function isValidCNIProject(dir: string): boolean {
  const pkgPath = join(dir, "package.json");
  const indexPath = join(dir, "src/index.ts");
  if (!existsSync(pkgPath) || !existsSync(indexPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return "@prismatic-io/spectral" in deps;
  } catch {
    return false;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function findProject(pathOrName: string): string | null {
  const resolved = resolve(pathOrName);
  if (existsSync(resolved) && isDirectory(resolved) && isValidCNIProject(resolved)) return resolved;
  const cwd = process.cwd();
  const byName = join(cwd, pathOrName);
  if (existsSync(byName) && isDirectory(byName) && isValidCNIProject(byName)) return byName;
  const prismaticDir = join(cwd, ".prismatic", "integrations", pathOrName);
  if (existsSync(prismaticDir) && isDirectory(prismaticDir) && isValidCNIProject(prismaticDir))
    return prismaticDir;
  if (pathOrName === "." && isValidCNIProject(cwd)) return cwd;
  return null;
}

function extractFlows(dir: string): { structure: "single-file" | "directory"; flows: FlowInfo[] } {
  const singleFile = join(dir, "src/flows.ts");
  const flowsDir = join(dir, "src/flows");

  if (existsSync(join(flowsDir, "index.ts"))) {
    const flows: FlowInfo[] = [];
    const files = readdirSync(flowsDir).filter((f) => f.endsWith(".ts") && f !== "index.ts");
    for (const file of files) {
      const content = readFileSync(join(flowsDir, file), "utf-8");
      const flow = parseFlowFromContent(content, `src/flows/${file}`);
      if (flow) flows.push(flow);
    }
    return { structure: "directory", flows };
  }

  if (existsSync(singleFile)) {
    const content = readFileSync(singleFile, "utf-8");
    const flow = parseFlowFromContent(content, "src/flows.ts");
    return { structure: "single-file", flows: flow ? [flow] : [] };
  }

  return { structure: "single-file", flows: [] };
}

function parseFlowFromContent(content: string, file: string): FlowInfo | null {
  const nameMatch = content.match(/name:\s*["']([^"']+)["']/);
  const keyMatch = content.match(/stableKey:\s*["']([^"']+)["']/);
  if (!nameMatch) return null;
  return {
    name: nameMatch[1],
    stableKey: keyMatch?.[1] ?? nameMatch[1].toLowerCase().replace(/\s+/g, "-"),
    file,
    hasTrigger: /onTrigger\s*:/.test(content),
    hasExecution: /onExecution\s*:/.test(content),
  };
}

function extractComponents(dir: string): string[] {
  const regPath = join(dir, "src/componentRegistry.ts");
  if (!existsSync(regPath)) return [];
  const content = readFileSync(regPath, "utf-8");
  const components: string[] = [];
  const importRe = /import\s+\w+\s+from\s+["']\.\/manifests\/([^"'/]+)["']/g;
  for (const match of content.matchAll(importRe)) {
    components.push(match[1]);
  }
  return components;
}

function extractConfigPages(dir: string): { pages: string[]; connections: string[] } {
  const cpPath = join(dir, "src/configPages.ts");
  if (!existsSync(cpPath)) return { pages: [], connections: [] };
  const content = readFileSync(cpPath, "utf-8");
  const pages: string[] = [];
  const connections: string[] = [];

  const pageRe = /["']([^"']+)["']\s*:\s*configPage\s*\(/g;
  for (const match of content.matchAll(pageRe)) {
    pages.push(match[1]);
  }
  const connRe = /connectionConfigVar\s*\(\s*\{[^}]*key\s*:\s*["']([^"']+)["']/g;
  for (const match of content.matchAll(connRe)) {
    connections.push(match[1]);
  }
  const manifestConnRe = /["']([^"']+)["']\s*:\s*\w+(?:Oauth2|ApiKey|Basic)\s*\(/g;
  for (const match of content.matchAll(manifestConnRe)) {
    connections.push(match[1]);
  }
  return { pages, connections };
}

function hasLifecycleHooks(dir: string): boolean {
  const flowsDir = join(dir, "src/flows");
  const singleFile = join(dir, "src/flows.ts");
  const filesToCheck: string[] = [];
  if (existsSync(join(flowsDir, "index.ts"))) {
    const files = readdirSync(flowsDir).filter((f) => f.endsWith(".ts"));
    filesToCheck.push(...files.map((f) => join(flowsDir, f)));
  } else if (existsSync(singleFile)) {
    filesToCheck.push(singleFile);
  }
  for (const file of filesToCheck) {
    const content = readFileSync(file, "utf-8");
    if (/onInstanceDeploy|onInstanceDelete/.test(content)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// New: Deep extraction — flow-level properties
// ---------------------------------------------------------------------------

/**
 * Parse a nested config object from source code.
 * Handles single-level nesting like errorConfig: { errorHandlerType: "retry", ... }
 * Also handles multi-line blocks by matching balanced braces.
 */
function parseConfigBlock(content: string, blockName: string): Record<string, string> | null {
  // Try single-line first
  const singleLineRe = new RegExp(`${blockName}\\s*:\\s*\\{([^}]+)\\}`, "s");
  const singleMatch = content.match(singleLineRe);

  let blockContent: string | null = null;

  if (singleMatch) {
    blockContent = singleMatch[1];
  } else {
    // Try multi-line with brace balancing
    const startRe = new RegExp(`${blockName}\\s*:\\s*\\{`);
    const startMatch = startRe.exec(content);
    if (startMatch) {
      const startIdx = startMatch.index + startMatch[0].length;
      let depth = 1;
      let i = startIdx;
      while (i < content.length && depth > 0) {
        if (content[i] === "{") depth++;
        else if (content[i] === "}") depth--;
        i++;
      }
      if (depth === 0) {
        blockContent = content.slice(startIdx, i - 1);
      }
    }
  }

  if (!blockContent) return null;

  const result: Record<string, string> = {};
  // Match key: value patterns (handles strings, numbers, booleans)
  const kvRe = /(\w+)\s*:\s*(?:"([^"]*)"|(true|false)|(\d+(?:\.\d+)?)|'([^']*)')/g;
  for (const kvMatch of blockContent.matchAll(kvRe)) {
    const key = kvMatch[1];
    const value = kvMatch[2] ?? kvMatch[3] ?? kvMatch[4] ?? kvMatch[5];
    if (key && value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Extract flow-scoped properties from a single flow's source content.
 */
function extractFlowProperties(content: string): FlowState {
  const state: FlowState = {};

  // --- Trigger type ---
  if (/onTrigger\s*:\s*async\s*\(/.test(content)) {
    // Has a custom onTrigger — check for polling triggerType
    const triggerTypeMatch = content.match(/triggerType\s*:\s*["']([^"']+)["']/);
    if (triggerTypeMatch?.[1] === "polling") {
      state.trigger_type = "polling";
    } else {
      // Custom onTrigger without polling → likely scheduled with custom trigger
      state.trigger_type = "scheduled";
    }
  } else if (/schedule\s*:\s*\{/.test(content)) {
    // Has schedule but no custom onTrigger
    state.trigger_type = "scheduled";
  } else {
    // Default: webhook (no onTrigger, no schedule = default trigger passthrough)
    state.trigger_type = "webhook";
  }

  // --- Schedule ---
  const scheduleBlock = parseConfigBlock(content, "schedule");
  if (scheduleBlock) {
    if (scheduleBlock.value) {
      state.schedule_value = scheduleBlock.value;
    }
    if (scheduleBlock.timezone) {
      state.schedule_timezone = scheduleBlock.timezone;
    }
    // Check for configVar reference
    const configVarSchedule = content.match(/schedule\s*:\s*\{[^}]*value\s*:\s*configVar\s*\(/s);
    if (configVarSchedule) {
      state.schedule_value = "configVar";
    }
  }

  // --- Synchronous ---
  const syncMatch = content.match(/isSynchronous\s*:\s*(true|false)/);
  if (syncMatch) {
    state.is_synchronous = syncMatch[1] === "true" ? "Yes" : "No";
  } else {
    state.is_synchronous = "No"; // default
  }

  // --- Error handling ---
  const errorConfig = parseConfigBlock(content, "errorConfig");
  if (errorConfig) {
    state.error_handler_type = errorConfig.errorHandlerType ?? "fail";
    if (errorConfig.maxAttempts) {
      state.error_retry_max_attempts = errorConfig.maxAttempts;
    }
    if (errorConfig.delaySeconds) {
      state.error_retry_delay_seconds = errorConfig.delaySeconds;
    }
    if (errorConfig.usesExponentialBackoff) {
      state.error_retry_backoff = errorConfig.usesExponentialBackoff === "true" ? "Yes" : "No";
    }
    if (errorConfig.ignoreFinalError) {
      state.error_retry_ignore_final = errorConfig.ignoreFinalError === "true" ? "Yes" : "No";
    }
  } else {
    state.error_handler_type = "fail"; // default when omitted
  }

  // --- Execution retry ---
  const retryConfig = parseConfigBlock(content, "retryConfig");
  if (retryConfig) {
    state.execution_retry_enabled = "Yes";
    if (retryConfig.maxAttempts) {
      state.execution_retry_max_attempts = retryConfig.maxAttempts;
    }
    if (retryConfig.delayMinutes) {
      state.execution_retry_delay_minutes = retryConfig.delayMinutes;
    }
    if (retryConfig.usesExponentialBackoff) {
      state.execution_retry_backoff = retryConfig.usesExponentialBackoff === "true" ? "Yes" : "No";
    }
    if (retryConfig.uniqueRequestIdField) {
      state.execution_retry_cancellation_field = retryConfig.uniqueRequestIdField;
    }
  } else {
    state.execution_retry_enabled = "No"; // default when omitted
  }

  // --- Queue config ---
  const queueConfig = parseConfigBlock(content, "queueConfig");
  if (queueConfig) {
    if (queueConfig.usesFifoQueue) {
      state.queue_fifo_enabled = queueConfig.usesFifoQueue === "true" ? "Yes" : "No";
    }
    if (queueConfig.concurrencyLimit) {
      state.queue_concurrency_limit = queueConfig.concurrencyLimit;
    }
    if (queueConfig.singletonExecutions) {
      state.queue_singleton_executions = queueConfig.singletonExecutions === "true" ? "Yes" : "No";
    }
    if (queueConfig.dedupeIdField) {
      state.queue_dedupe_field = queueConfig.dedupeIdField;
    }
  } else {
    state.queue_fifo_enabled = "No"; // default
  }

  // --- Endpoint security ---
  const securityMatch = content.match(/endpointSecurityType\s*:\s*["']([^"']+)["']/);
  if (securityMatch) {
    state.endpoint_security = securityMatch[1];
  } else {
    state.endpoint_security = "customer_optional"; // default
  }

  // --- Organization API keys ---
  const orgKeysMatch = content.match(/organizationApiKeys\s*:\s*\[([^\]]+)\]/);
  if (orgKeysMatch) {
    const keys = orgKeysMatch[1]
      .replace(/["']/g, "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    state.organization_api_keys = keys.join(",");
  }

  // --- Deploy hooks ---
  if (/onInstanceDeploy\s*:/.test(content)) {
    state.needs_deploy_hooks = "Yes";
  } else {
    state.needs_deploy_hooks = "No";
  }

  // --- Webhook lifecycle ---
  if (/webhookLifecycleHandlers\s*:/.test(content)) {
    state.needs_webhook_lifecycle = "Yes";
  } else {
    state.needs_webhook_lifecycle = "No";
  }

  // --- State management ---
  if (/instanceState|crossFlowState|integrationState|context\.polling/.test(content)) {
    state.needs_state_management = "Yes";
    if (/crossFlowState/.test(content)) {
      state.state_scope = "crossFlowState (per-instance, shared across flows)";
    } else if (/integrationState/.test(content)) {
      state.state_scope = "integrationState (shared across all instances)";
    } else if (/context\.polling/.test(content)) {
      state.state_scope = "instanceState (per-flow, per-instance)";
    } else {
      state.state_scope = "instanceState (per-flow, per-instance)";
    }
  } else {
    state.needs_state_management = "No";
  }

  return state;
}

// ---------------------------------------------------------------------------
// New: Deep extraction — integration-level properties (index.ts)
// ---------------------------------------------------------------------------

interface IntegrationLevelProps {
  endpoint_type?: string;
  preprocess_flow_routing?: string;
  routing_flow_name_field?: string;
  routing_external_customer_id_field?: string;
}

function extractIntegrationProperties(indexContent: string): IntegrationLevelProps {
  const props: IntegrationLevelProps = {};

  // --- Endpoint type ---
  const endpointMatch = indexContent.match(/endpointType\s*:\s*["']([^"']+)["']/);
  if (endpointMatch) {
    props.endpoint_type = endpointMatch[1];
  } else {
    props.endpoint_type = "flow_specific"; // default
  }

  // --- Preprocess flow routing ---
  const preprocessMatch = indexContent.match(/triggerPreprocessFlowConfig\s*:\s*\{/);
  if (preprocessMatch) {
    const block = parseConfigBlock(indexContent, "triggerPreprocessFlowConfig");
    if (block) {
      if (block.flowNameField) {
        props.routing_flow_name_field = block.flowNameField;
        // Infer routing type from field path
        if (block.flowNameField.startsWith("headers.")) {
          props.preprocess_flow_routing = "header_field";
        } else {
          props.preprocess_flow_routing = "body_field";
        }
      }
      if (block.externalCustomerIdField) {
        props.routing_external_customer_id_field = block.externalCustomerIdField;
      }
    }
  }

  return props;
}

// ---------------------------------------------------------------------------
// New: Extract connection types from configPages.ts
// ---------------------------------------------------------------------------

interface ConnectionInfo {
  key: string;
  connectionType?: string;
}

function extractConnectionTypes(dir: string): ConnectionInfo[] {
  const cpPath = join(dir, "src/configPages.ts");
  if (!existsSync(cpPath)) return [];
  const content = readFileSync(cpPath, "utf-8");
  const connections: ConnectionInfo[] = [];

  // Match connectionConfigVar with connectionType
  const connRe =
    /connectionConfigVar\s*\(\s*\{[^}]*key\s*:\s*["']([^"']+)["'][^}]*connectionType\s*:\s*["']([^"']+)["']/gs;
  for (const match of content.matchAll(connRe)) {
    connections.push({ key: match[1], connectionType: match[2] });
  }

  return connections;
}

// ---------------------------------------------------------------------------
// New: Extract data source config vars from configPages.ts
// ---------------------------------------------------------------------------

function extractDataSources(dir: string): string[] {
  const cpPath = join(dir, "src/configPages.ts");
  if (!existsSync(cpPath)) return [];
  const content = readFileSync(cpPath, "utf-8");
  const dataSources: string[] = [];

  const dsRe = /dataSourceConfigVar\s*\(\s*\{[^}]*key\s*:\s*["']([^"']+)["']/g;
  for (const match of content.matchAll(dsRe)) {
    dataSources.push(match[1]);
  }

  return dataSources;
}

// ---------------------------------------------------------------------------
// Assemble full state
// ---------------------------------------------------------------------------

function extractState(dir: string): {
  state: IntegrationState;
  extraction_gaps: string[];
} {
  const { flows } = extractFlows(dir);
  const components = extractComponents(dir);

  // Read index.ts for integration-level properties
  const indexPath = join(dir, "src/index.ts");
  const indexContent = existsSync(indexPath) ? readFileSync(indexPath, "utf-8") : "";
  const integrationProps = extractIntegrationProperties(indexContent);

  // Extract connection types and data sources
  const connectionTypes = extractConnectionTypes(dir);
  const dataSources = extractDataSources(dir);

  // Build per-flow state
  const flowStates: Record<string, FlowState> = {};
  for (const flowInfo of flows) {
    const flowPath = join(dir, flowInfo.file);
    const flowContent = existsSync(flowPath) ? readFileSync(flowPath, "utf-8") : "";
    flowStates[flowInfo.stableKey] = extractFlowProperties(flowContent);
  }

  // Determine the "primary" trigger type (for single-flow compat)
  const _primaryTrigger =
    flows.length > 0 ? flowStates[flows[0].stableKey]?.trigger_type : undefined;

  const state: IntegrationState = {
    flow_count: String(flows.length),
    endpoint_type: integrationProps.endpoint_type,
    flows: flowStates,
  };

  // Add routing info if present
  if (integrationProps.preprocess_flow_routing) {
    state.preprocess_flow_routing = integrationProps.preprocess_flow_routing;
  }
  if (integrationProps.routing_flow_name_field) {
    state.routing_flow_name_field = integrationProps.routing_flow_name_field;
  }
  if (integrationProps.routing_external_customer_id_field) {
    state.routing_external_customer_id_field = integrationProps.routing_external_customer_id_field;
  }

  // Add component info as readable summaries
  if (components.length > 0) {
    state.components = components.join(", ");
  }
  if (connectionTypes.length > 0) {
    state.connection_types = connectionTypes
      .map((c) => `${c.key}: ${c.connectionType ?? "unknown"}`)
      .join(", ");
  }
  if (dataSources.length > 0) {
    state.data_sources = dataSources.join(", ");
  }

  // For single-flow integrations, promote flow-scoped answers to root
  // for backward compatibility with how the spec stores them
  if (flows.length === 1) {
    const singleFlowState = flowStates[flows[0].stableKey];
    if (singleFlowState) {
      for (const [key, value] of Object.entries(singleFlowState)) {
        if (value !== undefined) {
          state[key] = value;
        }
      }
    }
  }

  // Extraction gaps — items that can't be reliably reverse-engineered
  const extraction_gaps: string[] = [
    "systems: free-text description of connected systems — not derivable from code",
    "data_flow: free-text description of data movement — not derivable from code",
    "source_system / destination_system: system names not stored in code",
    "transformations: business logic description — not reverse-extractable",
    "additional_requirements: free-text requirements — not in code",
    "webhook_payload_shape: TypeScript interface extraction is fragile",
    "source_api_docs_url / destination_api_docs_url: external URLs not in code",
    "sync_response_shape: response format description — not reliably extractable",
    "deploy_hook_description: free-text description of hook behavior",
    "state_description: free-text description of persisted state",
  ];

  return { state, extraction_gaps };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error("Usage: npx tsx extract-state.ts <path-or-name>");
    return 1;
  }

  const pathOrName = args[0];
  const projectDir = findProject(pathOrName);

  if (!projectDir) {
    console.log(
      JSON.stringify(
        {
          found: false,
          error: `No valid CNI project found for "${pathOrName}".`,
        },
        null,
        2,
      ),
    );
    return 1;
  }

  const { structure, flows } = extractFlows(projectDir);
  const components = extractComponents(projectDir);
  const { pages, connections } = extractConfigPages(projectDir);
  const lifecycle = hasLifecycleHooks(projectDir);

  const architecture: Architecture = {
    flow_structure: structure,
    flows,
    components,
    connections,
    config_pages: pages,
    has_lifecycle_hooks: lifecycle,
  };

  const { state, extraction_gaps } = extractState(projectDir);

  const result: ExtractResult = {
    project_dir: projectDir,
    name: basename(projectDir),
    architecture,
    state,
    extraction_gaps,
  };

  console.log(JSON.stringify(result, null, 2));
  return 0;
}

process.exit(main());
