#!/usr/bin/env npx tsx

/** Persists batches of validated choices while enforcing requirements and connection gates. */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CliConfig, cliError, parseCliArgs } from "../shared/cli-help.js";
import { type LoadedSpec, loadSpec } from "../shared/load-spec.js";
import { getPluginRoot, getSessionDirectory } from "../shared/project-directory.js";

const CLI = {
  command: "prismatic-tools record-choices",
  description: "Record one or more requirements design decisions.",
  notes: [
    "Accepts key=value pairs, inline JSON, --input-file, or JSON from stdin.",
    "Values that look like JSON are decoded automatically.",
    "--flow writes under answers.flows[flow-id]; otherwise choices are written at the root.",
  ],
  examples: [
    "prismatic-tools record-choices --session my-project trigger_type=webhook error_handler_type=retry",
    "prismatic-tools record-choices --session my-project --flow order-sync trigger_type=webhook",
    "prismatic-tools record-choices --session my-component --type component component_type=connector",
  ],
  positionals: [{ name: "answers-file-or-choice" }, { name: "choices", variadic: true }],
  options: [
    { name: "session", type: "string", value: "name", description: "Requirements session name." },
    {
      name: "type",
      type: "string",
      value: "component|integration",
      default: "integration",
      choices: ["component", "integration"],
      description: "Session type.",
    },
    {
      name: "flow",
      type: "string",
      value: "flow-id",
      description: "Record flow-specific choices.",
    },
    { name: "input-file", type: "string", value: "file", description: "Read choices from a file." },
    {
      name: "sync",
      type: "string",
      value: "spec-file",
      description: "Synchronize against a spec file.",
    },
    { name: "confirmed", type: "boolean", description: "Confirm a gated choice." },
  ],
} as const satisfies CliConfig;

/** Find the spec file using getPluginRoot (same resolution as update-tasks and validate-requirements). */
function findSpecPath(type: string = "integration"): string | null {
  const specName = type === "component" ? "component.yaml" : "integration.yaml";
  const specPath = join(getPluginRoot(), "scripts", "questions", specName);
  return existsSync(specPath) ? specPath : null;
}

function main(): number {
  const { values, positionals: parsedPositionals } = parseCliArgs(process.argv.slice(2), CLI);

  if (parsedPositionals.length < 1 && !values["input-file"]) {
    cliError(CLI, "at least one choice or --input-file is required.");
  }

  // Parse flags and key=value pairs from ALL args (flags can appear anywhere)
  const flowId = typeof values.flow === "string" ? values.flow : null;
  const inputFile = typeof values["input-file"] === "string" ? values["input-file"] : null;
  const syncSpec = typeof values.sync === "string" ? values.sync : null;
  const sessionName = typeof values.session === "string" ? values.session : null;
  const sessionType = values.type;
  let batchRaw: string | undefined;
  const kvPairs: Array<[string, string]> = [];
  const positional: string[] = [];
  for (const argument of parsedPositionals) {
    if (argument.includes("=") && !argument.startsWith("{")) {
      // key=value pair
      const eqIdx = argument.indexOf("=");
      const key = argument.slice(0, eqIdx);
      const val = argument.slice(eqIdx + 1);
      kvPairs.push([key, val]);
    } else {
      positional.push(argument);
    }
  }

  // Resolve answersFile: --session takes priority, then first positional arg
  let answersFile: string;
  if (sessionName) {
    answersFile = join(
      getSessionDirectory(sessionName, sessionType === "component" ? "components" : "integrations"),
      "requirements.json",
    );
    // First positional (if any) becomes batchRaw
    if (positional.length > 0 && !positional[0].includes("=")) {
      batchRaw = positional[0];
    }
  } else if (positional.length > 0) {
    answersFile = positional[0];
    if (positional.length > 1) {
      batchRaw = positional[1];
    }
  } else {
    console.error("Either --session <name> or an answers file path is required");
    return 1;
  }

  // Build batch from key=value pairs if present
  let batch: Record<string, unknown>;

  if (kvPairs.length > 0) {
    batch = {};
    for (const [key, val] of kvPairs) {
      // Auto-parse JSON values (objects and arrays)
      if (
        (val.startsWith("{") && val.endsWith("}")) ||
        (val.startsWith("[") && val.endsWith("]"))
      ) {
        try {
          batch[key] = JSON.parse(val);
          continue;
        } catch {
          // Not valid JSON — treat as string
        }
      }
      batch[key] = val;
    }
  } else {
    // Read from input file if specified
    if (inputFile) {
      try {
        batchRaw = readFileSync(inputFile, "utf-8").trim();
      } catch (e) {
        console.error(`Failed to read input file ${inputFile}: ${e}`);
        return 1;
      }
    }

    // If no JSON argument, read from stdin
    if (!batchRaw) {
      try {
        batchRaw = readFileSync(0, "utf-8").trim();
      } catch {
        console.error(
          "No input provided (use key=value pairs, --input-file, inline JSON, or stdin)",
        );
        return 1;
      }
      if (!batchRaw) {
        console.error("No input provided and stdin is empty");
        return 1;
      }
    }

    // Parse the batch input
    try {
      batch = JSON.parse(batchRaw);
    } catch {
      console.error(`Failed to parse batch JSON: ${batchRaw.slice(0, 200)}`);
      return 1;
    }
  }

  // Load existing answers
  let answers: Record<string, unknown>;
  try {
    const content = readFileSync(answersFile, "utf-8");
    answers = JSON.parse(content);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      answers = {};
    } else {
      console.error(`Invalid JSON in ${answersFile}: ${e}`);
      return 1;
    }
  }

  // Determine target: root or flows[flowId]
  let target: Record<string, unknown>;
  if (flowId) {
    if (!answers.flows || typeof answers.flows !== "object") {
      answers.flows = {};
    }
    const flows = answers.flows as Record<string, Record<string, unknown>>;
    if (!flows[flowId] || typeof flows[flowId] !== "object") {
      flows[flowId] = {};
    }
    target = flows[flowId];
  } else {
    target = answers;
  }

  // When flow_definitions is written, bootstrap the flows object and copy all properties
  // (integrations only — components don't have flows)
  if (
    sessionType !== "component" &&
    batch.flow_definitions &&
    Array.isArray(batch.flow_definitions) &&
    !flowId
  ) {
    if (!answers.flows || typeof answers.flows !== "object") {
      answers.flows = {};
    }
    const flows = answers.flows as Record<string, Record<string, unknown>>;
    for (const def of batch.flow_definitions as Array<Record<string, unknown>>) {
      const key = def.key as string | undefined;
      if (key) {
        if (!flows[key]) {
          flows[key] = {};
        }
        // Copy all properties from the definition into the flow's answers
        for (const [prop, val] of Object.entries(def)) {
          if (prop === "key") continue; // key is the flow ID, not an answer
          if (prop === "name") {
            flows[key].flow_name = val; // map "name" to "flow_name" for backward compat
          } else {
            flows[key][prop] = val;
          }
        }
      }
    }
  }

  // Load spec for validation if available
  let spec: LoadedSpec | null = null;
  const specPath = syncSpec || findSpecPath(sessionType);
  if (specPath) {
    try {
      spec = loadSpec(specPath);
    } catch {
      // Spec not available — skip validation
    }
  }

  // Validation for connection-type questions (must be full JSON objects)
  // Includes dynamically-expanded connector_N_connection_type keys
  const connectionTypeQuestions = [
    "source_connection_type",
    "destination_connection_type",
    ...Object.keys(batch).filter((k) => /^connector_\d+_connection_type$/.test(k)),
  ];

  // Connection strategy questions require search-connections to be run first
  // Includes dynamically-expanded connector_N_connection keys
  const connectionStrategyQuestions = [
    "source_connection",
    "destination_connection",
    ...Object.keys(batch).filter((k) => /^connector_\d+_connection$/.test(k)),
  ];

  const written: string[] = [];
  const onAnswerActions: string[] = [];
  const _hasValidationErrors = false;

  // Gate: component fallback requires user confirmation (integrations only)
  // When writing *_component with a key that doesn't match the system name (e.g., http for dacra),
  // reject unless --confirmed flag is present.
  const isConfirmed = values.confirmed === true;
  if (sessionType !== "component" && !isConfirmed) {
    const componentKeys = Object.keys(batch).filter((k) =>
      /^(source|destination|connector_\d+)_component$/.test(k),
    );
    for (const key of componentKeys) {
      const val = batch[key];
      if (!val || typeof val !== "object") continue;

      const prefix = key.replace(/_component$/, "");
      const systemKey = `${prefix}_system`;
      const systemName = String(batch[systemKey] || answers[systemKey] || "").toLowerCase();
      const componentKey = String((val as Record<string, unknown>).key || "").toLowerCase();

      if (
        systemName &&
        componentKey &&
        !componentKey.includes(systemName) &&
        !systemName.includes(componentKey)
      ) {
        console.log(
          `0 answers written. ${key} was NOT recorded.\n\n` +
            `<component-fallback-confirmation system="${systemName}" component="${componentKey}" blocking="true">\n` +
            `  No dedicated Prismatic component exists for "${systemName}".\n` +
            `  You selected "${componentKey}" as a generic fallback.\n` +
            `  Present this choice to the user BEFORE recording:\n` +
            `  "No Prismatic component exists for ${systemName}. Options:\n` +
            `    1. Use the ${componentKey} component with direct API calls (works now)\n` +
            `    2. Build a custom ${systemName} component first (reusable, more structured)"\n` +
            `  After the user confirms, re-run with --confirmed:\n` +
            `    prismatic-tools record-choices --session ${sessionName} --type ${sessionType} --confirmed ${key}='${JSON.stringify(val)}'\n` +
            `</component-fallback-confirmation>`,
        );
        process.exit(0);
      }
    }
  }

  // Gate: connection strategy answers require prior connection search (integrations only)
  if (sessionType !== "component") {
    for (const key of connectionStrategyQuestions) {
      if (batch[key] !== undefined) {
        const rawValue = batch[key];
        const value = typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue);
        // Gate: any connection strategy requires searching for existing connections first
        if (value !== "no_connection") {
          // Extract prefix: source_, destination_, or connector_N_
          let system: string;
          const connectorMatch = key.match(/^(connector_\d+)_connection$/);
          if (connectorMatch) {
            system = connectorMatch[1];
          } else {
            system = key.startsWith("source") ? "source" : "destination";
          }
          const rawSystem = batch[`${system}_system`] || answers[`${system}_system`] || system;
          const systemName =
            typeof rawSystem === "string"
              ? rawSystem
              : ((rawSystem as Record<string, unknown>)?.source as string) ||
                ((rawSystem as Record<string, unknown>)?.name as string) ||
                system;
          const existingKey = `${system}_connection_existing`;
          const existingValue = batch[existingKey] || answers[existingKey];

          if (!existingValue) {
            // No search done yet — block and redirect
            console.log(
              `0 answers written. ${key} was NOT recorded.\n\n` +
                `<connection-required key="${key}" value="${value}" system="${systemName}">\n` +
                `  ${key} was rejected because connection search has not been done yet.\n` +
                `  <steps>\n` +
                `    <step>Run: prismatic-tools search-connections ${systemName}</step>\n` +
                `    <step>Present results to the user — recommend reusable connections (customer-activated)</step>\n` +
                `    <step>Record the selected connection as ${existingKey}</step>\n` +
                `    <step>Then re-run this command to record ${key}</step>\n` +
                `  </steps>\n` +
                `</connection-required>`,
            );
            process.exit(0);
          }

          // Check if existing value is "none" or "solo_build_only"
          // ALLOW the write — but emit post-write guidance about SCV creation
          const existingStr =
            typeof existingValue === "string" ? existingValue : JSON.stringify(existingValue ?? "");
          const noneOrBuildOnly = existingStr === "none" || existingStr === "solo_build_only";

          if (noneOrBuildOnly && value !== "no_connection") {
            // Strategy written, but no usable SCV exists yet. Build post-write guidance.
            const connType =
              value === "customer_activated"
                ? "customer-activated"
                : value === "org_activated"
                  ? "org-activated"
                  : value;
            const hasBuildOnly = existingStr === "solo_build_only";

            const connTypeKey = `${system}_connection_type`;
            const connTypeValue = batch[connTypeKey] || answers[connTypeKey];
            let componentKey = "";
            let connectionKey = "";
            if (connTypeValue && typeof connTypeValue === "object") {
              const obj = connTypeValue as Record<string, unknown>;
              connectionKey = (obj.key as string) ?? "";
              const compKey = `${system}_component`;
              const compValue = batch[compKey] || answers[compKey];
              if (compValue && typeof compValue === "object") {
                componentKey = ((compValue as Record<string, unknown>).key as string) ?? "";
              }
            }

            const sessionPrefix = sessionName ? `${sessionName}-` : "";
            const stableKey =
              componentKey && connectionKey
                ? `${sessionPrefix}${componentKey}-${connectionKey}`
                : `${sessionPrefix}${systemName.toLowerCase()}-oauth2`;

            let strategy = "customer-activated";
            if (value === "org_activated") {
              const scopeKey = `${system}_org_connection_scope`;
              const scopeValue = batch[scopeKey] || answers[scopeKey];
              strategy =
                scopeValue === "global" ? "org-activated-global" : "org-activated-customer";
            }

            const createCmd =
              componentKey && connectionKey
                ? `prismatic-tools create-organization-connection ` +
                  `--component-key ${componentKey} --connection-key ${connectionKey} ` +
                  `--name "${systemName} ${connType}" --stable-key ${stableKey} --strategy ${strategy} --skip-test-connection`
                : "";

            // Queue this as a post-write action (NOT a rejection)
            onAnswerActions.push(
              `<create-scv-recommended system="${systemName}" strategy="${value}"` +
                (hasBuildOnly ? ` build-only-available="true"` : ``) +
                `>\n` +
                `  No reusable ${connType} connection exists for ${systemName}.\n` +
                (hasBuildOnly
                  ? `  Build-only connections exist for testing but cannot be used for production org_activated.\n`
                  : ``) +
                `  Offer to create one:\n` +
                (createCmd
                  ? `    ${createCmd}\n`
                  : `    <orby-request>Create a ${connType} connection for ${systemName}</orby-request>\n`) +
                `  If the user declines, the connection will be configured post-deploy in admin UI.\n` +
                `</create-scv-recommended>`,
            );
            // Do NOT exit — let the write proceed
          }
        }
      }
    }
  }

  // Gate: api_docs_url must be written alone for components — it triggers research
  if (sessionType === "component" && batch.api_docs_url !== undefined) {
    const otherKeys = Object.keys(batch).filter((k) => k !== "api_docs_url");
    if (otherKeys.length > 0) {
      console.log(
        `0 answers written. Batch was REJECTED.\n\n` +
          `<api-docs-url-must-be-alone>\n` +
          `  api_docs_url cannot be batch-written with other answers.\n` +
          `  It triggers API research that must complete BEFORE writing:\n` +
          `  ${otherKeys.join(", ")}\n` +
          `  <steps>\n` +
          `    <step>Write api_docs_url ALONE: prismatic-tools record-choices --session <name> --type component api_docs_url=<url></step>\n` +
          `    <step>Spawn external-api-researcher with the URL</step>\n` +
          `    <step>WAIT for research to complete</step>\n` +
          `    <step>THEN write the remaining answers using research findings</step>\n` +
          `  </steps>\n` +
          `</api-docs-url-must-be-alone>`,
      );
      process.exit(0);
    }
  }

  // Gate: reject large inference batches without --confirmed flag.
  // When the agent batch-writes 4+ inference-allowed items early in a session,
  // it's dumping inferences without presenting them to the user first.
  // Force the agent to present first, get confirmation, then re-run with --confirmed.
  if (!isConfirmed && spec) {
    // Count existing answers (excluding metadata keys)
    const metaKeys = new Set([
      "name",
      "session",
      "type",
      "flows",
      "phase_gate",
      "additional_systems",
    ]);
    const existingCount = Object.keys(target).filter((k) => !metaKeys.has(k)).length;

    // Count inference-allowed items in this batch (exclude lookups, flow_definitions, connection keys)
    const noGateKeys = new Set([
      "flow_definitions",
      "flow_count",
      "systems",
      "source_system",
      "destination_system",
      "additional_systems",
      "phase_gate",
    ]);
    const connectionPattern =
      /_(connection|connection_type|connection_existing|org_connection_scope)$/;

    let inferenceCount = 0;
    const inferredItems: Array<{ key: string; value: string }> = [];
    for (const [key, val] of Object.entries(batch)) {
      if (noGateKeys.has(key)) continue;
      if (connectionPattern.test(key)) continue;
      const specItem = spec.items[key];
      if (!specItem) continue;
      if (specItem.inference === "prohibited") continue;
      if ((specItem as Record<string, unknown>).type === "lookup") continue;
      inferenceCount++;
      inferredItems.push({ key, value: typeof val === "string" ? val : JSON.stringify(val) });
    }

    if (inferenceCount >= 4 && existingCount < 8) {
      console.log(
        `0 answers written. Batch was HELD for user confirmation.\n\n` +
          `<confirm-inferences-before-writing count="${inferenceCount}">\n` +
          `  You are batch-writing ${inferenceCount} inferred values. Present these to the user FIRST.\n` +
          `  Show what you inferred, why (cite the user's words), and the architectural impact.\n` +
          `  WAIT for the user to confirm or correct before writing.\n` +
          `  \n` +
          `  Inferred values:\n` +
          inferredItems.map((i) => `    ${i.key} = ${i.value}`).join("\n") +
          `\n` +
          `  \n` +
          `  After the user confirms, re-run this exact command with --confirmed:\n` +
          `    prismatic-tools record-choices --session ${sessionName} --type ${sessionType} --confirmed ${Object.entries(
            batch,
          )
            .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
            .join(" ")}\n` +
          `</confirm-inferences-before-writing>`,
      );
      process.exit(0);
    }
  }

  for (const [questionId, rawAnswer] of Object.entries(batch)) {
    let answer = rawAnswer;

    // Validate choice values against spec
    if (spec && typeof answer === "string") {
      const specItem = spec.items[questionId];
      if (specItem && Array.isArray(specItem.choices)) {
        const validChoices = specItem.choices as string[];
        // Exact match first
        if (!validChoices.includes(answer)) {
          // Try case-insensitive match and auto-correct
          const answerStr = answer;
          const match = validChoices.find((c) => c.toLowerCase() === answerStr.toLowerCase());
          if (match) {
            answer = match;
            console.error(`NOTE: Auto-corrected "${rawAnswer}" → "${match}" for ${questionId}`);
          } else {
            // Build enriched error with choice descriptions from implications
            let choiceLines = "";
            const implications = specItem.implications as Record<string, string> | undefined;
            if (implications) {
              choiceLines = validChoices
                .map((c) => {
                  const desc = implications[c]
                    ? ` — ${(implications[c] as string).trim().split("\n")[0]}`
                    : "";
                  return `    <choice value="${c}">${c}${desc}</choice>`;
                })
                .join("\n");
            } else {
              choiceLines = validChoices
                .map((c) => `    <choice value="${c}">${c}</choice>`)
                .join("\n");
            }
            console.log(
              `<validation-error key="${questionId}" attempted="${answer}">\n` +
                `  <valid-choices>\n${choiceLines}\n  </valid-choices>\n` +
                `  <instruction>Use ONLY the exact value= strings above. Present these choices to the user if needed. Do NOT invent alternatives.</instruction>\n` +
                `</validation-error>`,
            );
            continue; // Skip writing this invalid answer
          }
        }
      }

      // Check on_answer for follow-up actions (using corrected value)
      if (specItem?.on_answer && typeof specItem.on_answer === "object") {
        const onAnswer = specItem.on_answer as Record<string, string>;
        if (onAnswer[answer as string]) {
          onAnswerActions.push(
            `<action trigger="${questionId}=${answer}" blocking="true">\n` +
              `  ${onAnswer[answer as string].trim()}\n` +
              `</action>`,
          );
        }
      }
    }

    target[questionId] = answer;
    written.push(questionId);

    // When *_connection_existing is written with a rich connection object:
    // - Auto-infer connection_type (data extraction, not a user decision)
    // - Do NOT auto-infer connection strategy — that's a user decision. Emit a directive instead.
    const existingMatch = questionId.match(
      /^(source|destination|connector_\d+)_connection_existing$/,
    );
    if (existingMatch && sessionType !== "component" && answer && typeof answer === "object") {
      const prefix = existingMatch[1];
      const conn = answer as Record<string, unknown>;
      const connectionType = conn.connectionType as string | undefined;
      const managedBy = conn.managedBy as string | undefined;
      const stableKey = conn.stableKey as string | undefined;
      const connectionName = conn.name as string | undefined;

      // Auto-infer connection_type from the component's connections array (data, not a decision)
      const connectionKey = conn.connectionKey as string | undefined;
      if (connectionKey && !target[`${prefix}_connection_type`]) {
        const compAnswer = target[`${prefix}_component`] || answers[`${prefix}_component`];
        if (compAnswer && typeof compAnswer === "object") {
          const comp = compAnswer as Record<string, unknown>;
          const connections = comp.connections as Array<Record<string, unknown>> | undefined;
          if (connections) {
            const match = connections.find((c) => c.key === connectionKey);
            if (match) {
              target[`${prefix}_connection_type`] = match;
              written.push(`${prefix}_connection_type`);
              console.log(
                `   Auto-inferred: ${prefix}_connection_type from existing connection (key: ${connectionKey})`,
              );
            }
          }
        }
      }

      // Determine what the existing connection tells us — but DON'T auto-write the strategy
      let detectedStrategy = "";
      if (connectionType === "CUSTOMER" || managedBy === "CUSTOMER") {
        detectedStrategy = "customer_activated";
      } else if (connectionType === "ORG" || managedBy === "ORGANIZATION") {
        detectedStrategy = "org_activated";
      }

      // Emit a directive: present this connection to the user and let them decide
      const systemKey = `${prefix}_system`;
      const systemName =
        typeof (target[systemKey] || answers[systemKey]) === "string"
          ? ((target[systemKey] || answers[systemKey]) as string)
          : prefix;

      if (detectedStrategy && !target[`${prefix}_connection`]) {
        onAnswerActions.push(
          `<connection-found system="${systemName}" prefix="${prefix}" blocking="true">\n` +
            `  Found existing connection: "${connectionName || stableKey || "unknown"}" (${detectedStrategy})\n` +
            `  Present this to the user: "I found an existing ${detectedStrategy.replace("_", "-")} connection for ${systemName}: ${connectionName || stableKey}. Use this one?"\n` +
            `  <on-yes>Record: ${prefix}_connection=${detectedStrategy}</on-yes>\n` +
            `  <on-no>Ask what connection strategy the user wants instead</on-no>\n` +
            `  Do NOT auto-select. The user must confirm.\n` +
            `</connection-found>`,
        );
      }
    }

    if (connectionTypeQuestions.includes(questionId)) {
      if (typeof answer === "object" && answer !== null) {
        const obj = answer as Record<string, unknown>;
        if (!obj.inputs || (Array.isArray(obj.inputs) && obj.inputs.length === 0)) {
          console.log(
            `WARNING: ${questionId} is missing 'inputs' array — will cause credentials error later.`,
          );
        }
      } else {
        console.log(`WARNING: ${questionId} should be an object, not string.`);
      }
    }
  }

  if (written.length === 0) {
    // Nothing was written — validation errors or connection gate already output guidance
    return 0;
  }

  // Write back
  try {
    writeFileSync(answersFile, JSON.stringify(answers, null, 2));
    const prefix = flowId ? `[flow: ${flowId}] ` : "";
    console.log(`${prefix}${written.length} answers written to ${answersFile}`);
    for (const id of written) {
      const val = target[id];
      console.log(`   ${id} = ${typeof val === "string" ? val : JSON.stringify(val)}`);
    }

    // Print on_answer actions as XML — the agent parses structured XML more reliably than prose
    if (onAnswerActions.length > 0) {
      console.log("");
      console.log("<next-steps>");
      for (const action of onAnswerActions) {
        console.log(action);
      }
      console.log("</next-steps>");
    }
  } catch (e) {
    console.error(`Failed to write file: ${e}`);
    return 1;
  }

  // If --sync was provided, run sync-task-list.ts and output its result
  if (syncSpec) {
    console.log("\n--- sync ---");
    try {
      const syncScript = new URL("./integrations/sync-task-list.ts", import.meta.url).pathname;
      const result = execFileSync(
        "npx",
        ["tsx", syncScript, syncSpec, answersFile, "--actionable"],
        { encoding: "utf-8", timeout: 30000 },
      );
      console.log(result);
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string };
      if (err.stdout) console.log(err.stdout);
      if (err.stderr) console.error(err.stderr);
      console.error("Sync failed — answers were written successfully but sync could not run.");
    }
  }

  return 0;
}

process.exit(main());
