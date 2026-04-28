#!/usr/bin/env npx tsx
/**
 * schema-to-answers.ts
 *
 * Converts a standard integration schema JSON file into a requirements.json
 * file compatible with the prismatic-skills requirements system.
 *
 * Maps migration schema fields to current spec item IDs, validates choice
 * values against the spec, and writes pre-populated answers to the session
 * directory. Component/connection answers are NOT pre-populated — those are
 * left for live discovery during the interactive session.
 *
 * USAGE:
 *   prismatic-tools schema-to-answers <schema-file> <session-name>
 *
 * INPUT:  Path to standard integration schema JSON file.
 * OUTPUT: requirements.json in the session directory.
 *         XML directive to stdout listing what was pre-populated.
 *
 * EXIT CODES:
 *   0 - Success
 *   1 - Schema validation errors (fixable)
 *   2 - Usage / file errors
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSpec } from "../shared/load-spec.js";
import { getPluginRoot, ensureSessionDirectory } from "../shared/project-directory.js";

/** Escape a string for safe use in XML attributes and text content. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Types ──────────────────────────────────────────────────────────────

interface SchemaMetadata {
  source_platform?: string;
  export_date?: string;
  [key: string]: unknown;
}

interface SchemaTrigger {
  type?: string;
  schedule?: string;
  [key: string]: unknown;
}

interface SchemaStep {
  description?: string;
  [key: string]: unknown;
}

interface SchemaFlow {
  description?: string;
  trigger?: SchemaTrigger;
  steps?: SchemaStep[];
  [key: string]: unknown;
}

interface SchemaSystem {
  name?: string;
  role?: string;
  connector_type?: string;
  notes?: string;
  http_client_notes?: string;
  connection?: {
    auth_type?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface SchemaMapping {
  source_path?: string;
  target_path?: string;
  transform?: string;
}

interface SchemaFunctionInput {
  name: string;
}

interface SchemaFunctionOutput {
  name: string;
}

interface SchemaFunction {
  type?: string;
  name?: string;
  script_content?: string;
  script_language?: string;
  inputs?: SchemaFunctionInput[];
  outputs?: SchemaFunctionOutput[];
}

interface SchemaTransformation {
  source_system?: string;
  target_system?: string;
  mappings?: SchemaMapping[];
  functions?: SchemaFunction[];
}

interface SchemaScript {
  name: string;
  category?: string;
  description?: string;
  used_by_flows?: string[];
  script_content?: string;
  inputs?: SchemaFunctionInput[];
  outputs?: SchemaFunctionOutput[];
}

interface SchemaEndpoint {
  system?: string;
  method?: string;
  path?: string;
  notes?: string;
}

interface SchemaConfigVariable {
  label?: string;
  key?: string;
  source_concept?: string;
}

interface ApiProfileField {
  name?: string;
  role?: string;
  fields?: string[];
  structure?: {
    nesting_path?: string;
    notes?: string;
  };
  body_structure?: {
    top_level_fields?: string[];
    nesting?: Record<string, string[]>;
  };
}

interface IntegrationSchema {
  metadata?: SchemaMetadata;
  integration?: {
    systems_summary?: string;
    [key: string]: unknown;
  };
  flows?: SchemaFlow[];
  systems?: SchemaSystem[];
  data_transformations?: SchemaTransformation[];
  error_handling?: {
    strategy?: string[];
    [key: string]: unknown;
  };
  migration_notes?: {
    manual_review_required?: string[];
    unsupported_features?: string[];
    recommendations?: string[];
  };
  config_variables?: SchemaConfigVariable[];
  state_management?: Record<string, unknown>;
  api_profiles?: Record<string, ApiProfileField>;
  endpoints?: SchemaEndpoint[];
  scripts?: SchemaScript[];
}

// ── Schema validation ──────────────────────────────────────────────────

function validateSchema(schema: IntegrationSchema): string[] {
  const errors: string[] = [];

  if (!schema.metadata || typeof schema.metadata !== "object") {
    errors.push("Missing or invalid 'metadata' (must be object)");
  }
  if (!schema.integration || typeof schema.integration !== "object") {
    errors.push("Missing or invalid 'integration' (must be object)");
  }
  if (!Array.isArray(schema.flows)) {
    errors.push("Missing or invalid 'flows' (must be array)");
  }
  if (!Array.isArray(schema.systems)) {
    errors.push("Missing or invalid 'systems' (must be array)");
  }

  for (const [i, flow] of (schema.flows ?? []).entries()) {
    if (!flow || typeof flow !== "object") {
      errors.push(`flows[${i}] must be an object`);
      continue;
    }
    if (!Array.isArray(flow.steps)) {
      errors.push(`flows[${i}].steps must be an array`);
    }
    if (!flow.trigger || typeof flow.trigger !== "object") {
      errors.push(`flows[${i}].trigger must be an object`);
    }
  }

  for (const [i, t] of (schema.data_transformations ?? []).entries()) {
    if (!t || typeof t !== "object") {
      errors.push(`data_transformations[${i}] must be an object`);
      continue;
    }
    if (t.mappings !== undefined && !Array.isArray(t.mappings)) {
      errors.push(
        `data_transformations[${i}].mappings must be an array, got ${typeof t.mappings}: ${String(t.mappings).slice(0, 100)}`,
      );
    }
    if (t.functions !== undefined && !Array.isArray(t.functions)) {
      errors.push(
        `data_transformations[${i}].functions must be an array, got ${typeof t.functions}: ${String(t.functions).slice(0, 100)}`,
      );
    }
  }

  const apiProfiles = schema.api_profiles;
  if (
    apiProfiles !== undefined &&
    apiProfiles !== null &&
    (typeof apiProfiles !== "object" || Array.isArray(apiProfiles))
  ) {
    errors.push(`api_profiles must be an object, got ${typeof apiProfiles}`);
  }

  const configVars = schema.config_variables;
  if (configVars !== undefined && !Array.isArray(configVars)) {
    errors.push(`config_variables must be an array, got ${typeof configVars}`);
  }

  const endpoints = schema.endpoints;
  if (endpoints !== undefined && !Array.isArray(endpoints)) {
    errors.push(`endpoints must be an array, got ${typeof endpoints}`);
  }

  return errors;
}

// ── Spec choice validation ─────────────────────────────────────────────

/**
 * Returns the valid choices for a spec item, or null if the item is not
 * a choice-type question.
 */
function getSpecChoices(
  specItems: Record<string, Record<string, unknown>>,
  itemId: string,
): string[] | null {
  const item = specItems[itemId];
  if (!item) return null;
  if (item.type !== "choice") return null;
  const choices = item.choices;
  if (!Array.isArray(choices)) return null;
  return choices.map(String);
}

/**
 * Validate a value against spec choices. Returns the validated value or
 * null if the value is not valid.
 */
function validateChoice(
  specItems: Record<string, Record<string, unknown>>,
  itemId: string,
  value: string,
): string | null {
  const choices = getSpecChoices(specItems, itemId);
  if (choices === null) return value; // not a choice item, accept as-is
  if (choices.includes(value)) return value;
  return null;
}

// ── Error handling strategy mapping ────────────────────────────────────

const ERROR_STRATEGY_MAP: Record<string, string> = {
  retry: "retry",
  stop: "fail",
  continue: "ignore",
};

// ── Context generation ─────────────────────────────────────────────────

function generateAnswers(
  schema: IntegrationSchema,
  specItems: Record<string, Record<string, unknown>>,
): Record<string, string | string[]> {
  const answers: Record<string, string | string[]> = {};
  const skipped: Array<{ key: string; value: string; reason: string }> = [];
  let unmappedStrategies: string[] = [];

  function setAnswer(key: string, value: string | string[]): void {
    if (typeof value === "string") {
      const validated = validateChoice(specItems, key, value);
      if (validated === null) {
        skipped.push({ key, value, reason: `not a valid choice for ${key}` });
        return;
      }
      answers[key] = validated;
    } else {
      answers[key] = value;
    }
  }

  // systems <- integration.systems_summary
  const systemsSummary = schema.integration?.systems_summary ?? "";
  if (systemsSummary) {
    setAnswer("systems", systemsSummary);
  }

  // trigger_type <- flows[0].trigger.type
  const flows = schema.flows ?? [];
  if (flows.length > 0) {
    const trigger = flows[0]?.trigger ?? {};
    const triggerType = trigger.type ?? "";
    if (triggerType) {
      setAnswer("trigger_type", triggerType);
    }

    // scheduled_details if trigger is scheduled
    if (triggerType === "scheduled") {
      const schedule = trigger.schedule ?? "";
      if (schedule) {
        setAnswer("schedule_value", schedule);
      }
    }
  }

  // data_flow <- generated narrative from flows and transformations
  const dataFlowParts: string[] = [];
  for (const flow of flows) {
    const flowDesc = flow.description ?? "";
    if (flowDesc) dataFlowParts.push(flowDesc);
    for (const step of flow.steps ?? []) {
      const stepDesc = step.description ?? "";
      if (stepDesc) dataFlowParts.push(`- ${stepDesc}`);
    }
  }
  if (dataFlowParts.length > 0) {
    setAnswer("data_flow", dataFlowParts.join("\n"));
  }

  // source_system <- first system with role="source"
  const systems = schema.systems ?? [];
  for (const system of systems) {
    if (system.role === "source") {
      const name = system.name ?? "";
      if (name) setAnswer("source_system", name);
      break;
    }
  }

  // destination_system <- first system with role="destination"
  for (const system of systems) {
    if (system.role === "destination") {
      const name = system.name ?? "";
      if (name) setAnswer("destination_system", name);
      break;
    }
  }

  // additional_systems <- any systems beyond source and destination (3+ connector integrations)
  const additionalSystems = systems
    .filter((s) => s.role !== "source" && s.role !== "destination")
    .map((s) => s.name ?? "")
    .filter(Boolean);
  if (additionalSystems.length > 0) {
    setAnswer("additional_systems", JSON.stringify(additionalSystems));
  }

  // transformations <- narrative from data_transformations
  const transformations = schema.data_transformations ?? [];
  if (transformations.length > 0) {
    const transformParts: string[] = [];
    for (const t of transformations) {
      const source = t.source_system ?? "";
      const target = t.target_system ?? "";
      transformParts.push(`Transform data from ${source} to ${target}:`);

      const mappings = t.mappings ?? [];
      if (Array.isArray(mappings)) {
        for (const mapping of mappings.slice(0, 10)) {
          const fromPath = mapping.source_path ?? "";
          const toPath = mapping.target_path ?? "";
          const transform = mapping.transform ?? "";
          if (transform) {
            transformParts.push(`  - ${fromPath} -> ${toPath} (via ${transform})`);
          } else {
            transformParts.push(`  - ${fromPath} -> ${toPath}`);
          }
        }
        if (mappings.length > 10) {
          transformParts.push(`  ... and ${mappings.length - 10} more field mappings`);
        }
      }

      for (const func of t.functions ?? []) {
        const funcType = func.type ?? "";
        const funcName = func.name ?? "";
        transformParts.push(`  - Function: ${funcName} (${funcType})`);
        if (funcType === "Scripting" && func.script_content) {
          const scriptLines = func.script_content.split("\n");
          transformParts.push(
            `    Script (${func.script_language ?? "groovy"}, ${scriptLines.length} lines):`,
          );
          transformParts.push("    ```");
          const MAX_SCRIPT_LINES = 80;
          for (const line of scriptLines.slice(0, MAX_SCRIPT_LINES)) {
            transformParts.push(`    ${line}`);
          }
          if (scriptLines.length > MAX_SCRIPT_LINES) {
            transformParts.push(
              `    ... (${scriptLines.length - MAX_SCRIPT_LINES} more lines — full source in migration-schema.json)`,
            );
          }
          transformParts.push("    ```");
          if (func.inputs?.length) {
            transformParts.push(`    Inputs: ${func.inputs.map((i) => i.name).join(", ")}`);
          }
          if (func.outputs?.length) {
            transformParts.push(`    Outputs: ${func.outputs.map((o) => o.name).join(", ")}`);
          }
        }
      }
    }
    setAnswer("transformations", transformParts.join("\n"));
  }

  // error_handling <- error_handling.strategy (mapped to spec choices)
  const strategies = schema.error_handling?.strategy ?? [];
  if (strategies.length > 0) {
    const mapped: string[] = [];
    const unmapped: string[] = [];
    for (const s of strategies) {
      const mappedValue = ERROR_STRATEGY_MAP[s];
      if (mappedValue) {
        mapped.push(mappedValue);
      } else {
        // Strategies like "notify" and "log" don't map to spec choices
        // Capture them so they're not silently lost
        unmapped.push(s);
      }
    }
    if (mapped.length >= 1 && mapped[0]) {
      setAnswer("error_handler_type", mapped[0]);
    }
    // Include unmapped strategies in additional_requirements so they're visible
    if (unmapped.length > 0) {
      unmappedStrategies = unmapped;
    }
  }

  // additional_requirements <- compiled from migration_notes, config_variables,
  // api_profiles, endpoints, scripts, connection guidance
  const additionalParts: string[] = [];

  // Unmapped error strategies (e.g., "notify", "log") that don't have spec choice equivalents
  if (unmappedStrategies.length > 0) {
    additionalParts.push(
      `Additional error handling strategies from source platform: ${unmappedStrategies.join(", ")}`,
    );
    additionalParts.push(
      "These do not map to Prismatic's built-in error handling choices and may need custom implementation.",
    );
  }

  // migration_notes
  const migrationNotes = schema.migration_notes ?? {};
  const manualReview = migrationNotes.manual_review_required ?? [];
  if (manualReview.length > 0) {
    additionalParts.push("Manual review items:");
    for (const item of manualReview) {
      additionalParts.push(`  - ${item}`);
    }
  }

  const unsupported = migrationNotes.unsupported_features ?? [];
  if (unsupported.length > 0) {
    additionalParts.push("Unsupported features from source platform:");
    for (const item of unsupported) {
      additionalParts.push(`  - ${item}`);
    }
  }

  const recommendations = migrationNotes.recommendations ?? [];
  if (recommendations.length > 0) {
    additionalParts.push("Migration recommendations:");
    for (const item of recommendations) {
      additionalParts.push(`  - ${item}`);
    }
  }

  // config_variables
  const configVars = schema.config_variables ?? [];
  if (configVars.length > 0) {
    additionalParts.push("Configuration variables needed:");
    for (const cv of configVars) {
      const label = cv.label ?? cv.key ?? "";
      const source = cv.source_concept ?? "";
      additionalParts.push(source ? `  - ${label} (from ${source})` : `  - ${label}`);
    }
  }

  // state_management
  const stateMgmt = schema.state_management;
  if (stateMgmt && Object.keys(stateMgmt).length > 0) {
    additionalParts.push(`State management: ${JSON.stringify(stateMgmt)}`);
  }

  // api_profiles
  const apiProfiles = schema.api_profiles ?? {};
  if (Object.keys(apiProfiles).length > 0) {
    additionalParts.push("API Response/Request Profiles (USE THESE EXACT FIELD NAMES):");
    for (const [profileId, profile] of Object.entries(apiProfiles)) {
      const name = profile.name ?? profileId;
      const role = profile.role ?? "";
      const fields = profile.fields ?? [];
      const structure = profile.structure ?? {};
      const nesting = structure.nesting_path ?? "";
      const bodyStructure = profile.body_structure;

      additionalParts.push(`  - ${name} (${role}): fields=[${fields.join(", ")}]`);
      if (nesting) {
        additionalParts.push(`    Nesting: data is at ${nesting}`);
      }
      if (structure.notes) {
        additionalParts.push(`    Note: ${structure.notes}`);
      }
      if (bodyStructure) {
        const topLevel = bodyStructure.top_level_fields ?? [];
        if (topLevel.length > 0) {
          additionalParts.push(
            `    Request body top-level fields (siblings, NOT nested inside each other): ${topLevel.join(", ")}`,
          );
        }
        const nestingMap = bodyStructure.nesting ?? {};
        for (const [parent, children] of Object.entries(nestingMap)) {
          const childList = Array.isArray(children) ? children.join(", ") : String(children);
          additionalParts.push(`    ${parent} contains: ${childList}`);
        }
      }
    }
  }

  // endpoints
  const endpoints = schema.endpoints ?? [];
  if (endpoints.length > 0) {
    additionalParts.push("API Endpoints:");
    for (const ep of endpoints) {
      const system = ep.system ?? "";
      const method = ep.method ?? "";
      const path = ep.path;
      if (path) {
        additionalParts.push(`  - ${system} ${method} ${path}`);
      } else {
        const notes = ep.notes ?? "Unknown endpoint - needs configuration";
        additionalParts.push(`  - ${system} ${method} UNKNOWN: ${notes}`);
      }
    }
  }

  // http_client_notes from systems
  for (const system of systems) {
    const notes = system.http_client_notes ?? "";
    if (notes) {
      additionalParts.push(`HTTP Client Note (${system.name ?? ""}): ${notes}`);
    }
  }

  // scripts -> full source code for TypeScript translation
  const scripts = schema.scripts ?? [];
  if (scripts.length > 0) {
    additionalParts.push("GROOVY SCRIPTS FOR TRANSLATION:");
    additionalParts.push(
      "The following scripts must be translated to TypeScript utility functions.",
    );
    for (const s of scripts) {
      const category = s.category ?? "unknown";
      additionalParts.push(`\n### ${s.name} (${category})`);
      if (s.description) {
        additionalParts.push(`Purpose: ${s.description}`);
      }
      if (s.used_by_flows?.length) {
        additionalParts.push(`Used by: ${s.used_by_flows.join(", ")}`);
      }
      additionalParts.push("```groovy");
      additionalParts.push(s.script_content ?? "");
      additionalParts.push("```");
      if (s.inputs?.length) {
        additionalParts.push(`Inputs: ${s.inputs.map((i) => i.name).join(", ")}`);
      }
      if (s.outputs?.length) {
        additionalParts.push(`Outputs: ${s.outputs.map((o) => o.name).join(", ")}`);
      }
    }
  }

  // connection_guidance from systems
  const connectionParts: string[] = [];
  for (const system of systems) {
    const name = system.name ?? "";
    const authType = system.connection?.auth_type ?? "";
    const connectorType = system.connector_type ?? "";
    const systemNotes = system.notes ?? "";
    if (name && authType) {
      connectionParts.push(`  - ${name}: auth=${authType}, connector=${connectorType}`);
      if (systemNotes) {
        connectionParts.push(`    Note: ${systemNotes}`);
      }
    }
  }
  if (connectionParts.length > 0) {
    additionalParts.push("System connection patterns:");
    additionalParts.push(...connectionParts);
  }

  if (additionalParts.length > 0) {
    setAnswer("additional_requirements", additionalParts.join("\n"));
  }

  // Log any skipped values
  for (const { key, value, reason } of skipped) {
    console.error(`  SKIPPED: ${key}=${value} (${reason})`);
  }

  return answers;
}

// ── Main ───────────────────────────────────────────────────────────────

function main(): number {
  const args = process.argv.slice(2);
  let schemaFile = "";
  let sessionName = "";

  // Parse flags: --session <name> --schema <path>, or positional: <schema-file> <session-name>
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--session" && i + 1 < args.length) {
      sessionName = args[i + 1];
      i++;
    } else if (args[i] === "--schema" && i + 1 < args.length) {
      schemaFile = args[i + 1];
      i++;
    } else if (!args[i].startsWith("-")) {
      positional.push(args[i]);
    }
  }

  // Fallback to positional args
  if (!schemaFile && positional.length >= 1) schemaFile = positional[0];
  if (!sessionName && positional.length >= 2) sessionName = positional[1];

  if (!schemaFile || !sessionName) {
    console.error("Usage: prismatic-tools schema-to-answers --session <name> --schema <path>");
    console.error("       schema-to-answers <schema-file> <session-name>");
    return 2;
  }

  // Load the schema
  let schema: IntegrationSchema;
  try {
    const raw = readFileSync(schemaFile, "utf-8");
    schema = JSON.parse(raw) as IntegrationSchema;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`Error: Schema file not found: ${schemaFile}`);
    } else {
      console.error(`Error: Invalid JSON in schema file: ${err}`);
    }
    return 2;
  }

  // Validate schema
  const errors = validateSchema(schema);
  if (errors.length > 0) {
    console.error("Schema validation errors:");
    for (const error of errors) {
      console.error(`  ERROR: ${error}`);
    }
    console.error("\nFix these issues in the integration schema and re-run.");
    return 1;
  }

  // Load the spec to validate choice values
  const pluginRoot = getPluginRoot();
  const specPath = join(pluginRoot, "scripts", "questions", "integration.yaml");
  const spec = loadSpec(specPath);

  // Generate answers mapped to spec item IDs
  const answers = generateAnswers(schema, spec.items);

  // Write to session directory
  const sessionDir = ensureSessionDirectory(sessionName, "integrations");
  const outputPath = join(sessionDir, "requirements.json");
  writeFileSync(outputPath, `${JSON.stringify(answers, null, 2)}\n`, "utf-8");

  // Report to stderr
  const count = Object.keys(answers).length;
  console.error(`Generated requirements with ${count} pre-populated answers:`);
  for (const [key, value] of Object.entries(answers)) {
    const preview = String(value).length > 80 ? `${String(value).slice(0, 80)}...` : String(value);
    console.error(`  ${key}: ${preview}`);
  }

  // Output comprehensive XML directives for agent consumption
  const answeredKeys = Object.keys(answers);
  const pendingItems = [
    "source_component",
    "destination_component",
    "source_connection_existing",
    "destination_connection_existing",
    "source_connection_type",
    "destination_connection_type",
    "source_connection",
    "destination_connection",
  ];

  // Add pending items for additional connectors (connector_2, connector_3, etc.)
  const extraSystems = (schema.systems ?? [])
    .filter((s) => s.role !== "source" && s.role !== "destination")
    .map((s) => s.name ?? "")
    .filter(Boolean);
  for (let i = 0; i < extraSystems.length; i++) {
    const prefix = `connector_${i + 2}`;
    pendingItems.push(
      `${prefix}_component`,
      `${prefix}_connection_existing`,
      `${prefix}_connection_type`,
      `${prefix}_connection`,
    );
  }

  // Determine which systems were identified for connection guidance
  const systems: Array<{ name: string; role: string; auth?: string }> = [];
  for (const sys of schema.systems ?? []) {
    systems.push({
      name: sys.name ?? "unknown",
      role: sys.role ?? "unknown",
      auth: sys.connection?.auth_type,
    });
  }

  const scriptCount = (schema.scripts ?? []).length;
  const transformCount = (schema.data_transformations ?? []).length;

  console.log(`<migration-pre-population count="${count}">`);
  console.log(`  <extracted-answers>`);
  console.log(`    These ${count} answers were extracted from the migration schema.`);
  console.log(`    Present them to the user for confirmation BEFORE proceeding.`);
  for (const key of answeredKeys) {
    const val = String(answers[key]);
    const preview = val.length > 60 ? `${val.slice(0, 60)}...` : val;
    console.log(`    <answer key="${escapeXml(key)}" preview="${escapeXml(preview)}" />`);
  }
  console.log(`  </extracted-answers>`);

  console.log(`  <requires-live-discovery>`);
  console.log(`    These items were NOT pre-populated — they require live platform interaction:`);
  for (const key of pendingItems) {
    console.log(`    <pending key="${key}" />`);
  }
  console.log(
    `    Run prismatic-tools update-tasks --session ${sessionName} --actionable to see the full task list.`,
  );
  console.log(`  </requires-live-discovery>`);

  if (systems.length > 0) {
    console.log(`  <connection-guidance>`);
    console.log(`    The migration schema identified these systems and auth patterns:`);
    for (const sys of systems) {
      console.log(
        `    <system name="${escapeXml(sys.name)}" role="${escapeXml(sys.role)}"${sys.auth ? ` auth="${escapeXml(sys.auth)}"` : ""} />`,
      );
    }
    console.log(`    These are advisory — search for Prismatic components live to confirm.`);
    console.log(`  </connection-guidance>`);
  }

  if (scriptCount > 0) {
    console.log(`  <script-translation-required count="${scriptCount}">`);
    console.log(
      `    ${scriptCount} script(s) must be translated from Groovy to TypeScript during code generation.`,
    );
    console.log(
      `    Full source is in migration-schema.json — code-plan will deliver it as <migration-context>.`,
    );
    console.log(`  </script-translation-required>`);
  }

  if (transformCount > 0) {
    console.log(`  <transformation-context count="${transformCount}">`);
    console.log(`    ${transformCount} data transformation(s) with field mappings are available.`);
    console.log(`    Use these during code generation for accurate field mapping.`);
    console.log(`  </transformation-context>`);
  }

  console.log(`  <voice phase="migration-requirements">`);
  console.log(`    Speak like:`);
  console.log(
    `    "The export shows you're connecting ${escapeXml(systems.map((s) => s.name).join(" and "))}. Let me find the Prismatic connectors and set up the connections."`,
  );
  console.log(
    `    "Most of the integration design is clear from the export — just a few things to confirm."`,
  );
  console.log(`    Never:`);
  console.log(
    `    "Let me see what I can work out from your description" (the schema already extracted it)`,
  );
  console.log(`  </voice>`);

  console.log(`  <confirmation-gate>`);
  console.log(`    Present the extracted answers to the user and WAIT for confirmation.`);
  console.log(`    THEN run update-tasks to see remaining items.`);
  console.log(
    `    Do NOT skip to scaffolding — component search and connection setup still required.`,
  );
  console.log(`  </confirmation-gate>`);
  console.log(`</migration-pre-population>`);

  return 0;
}

process.exit(main());
