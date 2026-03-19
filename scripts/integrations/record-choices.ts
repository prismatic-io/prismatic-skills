#!/usr/bin/env npx tsx
/**
 * record-choices.ts
 *
 * Writes multiple answers at once to reduce tool call noise.
 * Accepts a JSON object where keys are question IDs and values are answers.
 *
 * USAGE:
 *   npx tsx record-choices.ts <answers-file> key=value [key2=value2 ...] [--flow <flow-id>]
 *   npx tsx record-choices.ts <answers-file> --input-file <json-file> [--flow <flow-id>]
 *   npx tsx record-choices.ts <answers-file> '<json-object>' [--flow <flow-id>]
 *   echo '<json-object>' | npx tsx record-choices.ts <answers-file> [--flow <flow-id>]
 *
 * EXAMPLES:
 *   # PREFERRED: key=value pairs (no quoting, no permissions prompts)
 *   npx tsx record-choices.ts reqs.json source_connection_type=oauth2
 *   npx tsx record-choices.ts reqs.json trigger_type=webhook error_handler_type=retry
 *   npx tsx record-choices.ts reqs.json --flow order-sync trigger_type=webhook
 *
 *   # With --sync: write answers AND run sync-task-list in one call
 *   npx tsx record-choices.ts reqs.json --sync spec.yaml source_connection_type=oauth2
 *
 *   # For complex objects (component search results, nested JSON): use --input-file
 *   npx tsx record-choices.ts reqs.json --input-file /tmp/batch-answers.json
 *
 *   # Inline JSON (simple values only — complex JSON triggers shell security warnings)
 *   npx tsx record-choices.ts reqs.json '{"systems":"CRM to Slack"}'
 *
 * key=value pairs are parsed as: key becomes the question ID, value becomes the answer string.
 * If the value looks like JSON (starts with { or [), it's parsed as JSON automatically.
 * When --flow is provided, answers are written under answers.flows[flowId].
 * When omitted, answers are written at the root level (backward compatible).
 * --input-file reads batch JSON from a file (preferred for complex objects).
 * When neither key=value, --input-file, nor inline JSON is provided, reads from stdin.
 *
 * EXIT CODES:
 *   0 - Success
 *   1 - Error
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { loadSpec, type LoadedSpec } from "../shared/load-spec.js";
import { getSessionDirectory } from "../shared/project-directory.js";

/** Try to find the integration spec relative to this script's location. */
function findSpecPath(answersFile: string): string | null {
  // Try relative to the script location (standard plugin layout)
  const scriptDir = new URL(".", import.meta.url).pathname;
  const candidates = [
    join(scriptDir, "questions", "integration.yaml"),
    join(dirname(answersFile), "..", "..", "..", "scripts", "questions", "integration.yaml"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function main(): number {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log(
      'Usage: npx tsx record-choices.ts <answers-file> [--flow <flow-id>] \'<json-object>\'\n' +
      '       npx tsx record-choices.ts --session <name> key=value [--flow <flow-id>]'
    );
    return 1;
  }

  // Parse flags and key=value pairs from ALL args (flags can appear anywhere)
  let flowId: string | null = null;
  let inputFile: string | null = null;
  let syncSpec: string | null = null;
  let sessionName: string | null = null;
  let batchRaw: string | undefined;
  const kvPairs: Array<[string, string]> = [];
  const positional: string[] = [];

  let i = 0;
  while (i < args.length) {
    if (args[i] === "--session") {
      if (i + 1 >= args.length) {
        console.error("--session requires a session name");
        return 1;
      }
      sessionName = args[i + 1];
      i += 2;
    } else if (args[i] === "--flow") {
      if (i + 1 >= args.length) {
        console.error("--flow requires a flow ID");
        return 1;
      }
      flowId = args[i + 1];
      i += 2;
    } else if (args[i] === "--input-file") {
      if (i + 1 >= args.length) {
        console.error("--input-file requires a file path");
        return 1;
      }
      inputFile = args[i + 1];
      i += 2;
    } else if (args[i] === "--sync") {
      if (i + 1 >= args.length) {
        console.error("--sync requires a spec file path");
        return 1;
      }
      syncSpec = args[i + 1];
      i += 2;
    } else if (args[i].includes("=") && !args[i].startsWith("{") && !args[i].startsWith("-")) {
      // key=value pair
      const eqIdx = args[i].indexOf("=");
      const key = args[i].slice(0, eqIdx);
      const val = args[i].slice(eqIdx + 1);
      kvPairs.push([key, val]);
      i++;
    } else if (!args[i].startsWith("-")) {
      positional.push(args[i]);
      i++;
    } else {
      i++;
    }
  }

  // Resolve answersFile: --session takes priority, then first positional arg
  let answersFile: string;
  if (sessionName) {
    answersFile = join(getSessionDirectory(sessionName, "integrations"), "requirements.json");
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
      if ((val.startsWith("{") && val.endsWith("}")) || (val.startsWith("[") && val.endsWith("]"))) {
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
        console.error("No input provided (use key=value pairs, --input-file, inline JSON, or stdin)");
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
  if (batch.flow_definitions && Array.isArray(batch.flow_definitions) && !flowId) {
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
  const specPath = syncSpec || findSpecPath(answersFile);
  if (specPath) {
    try {
      spec = loadSpec(specPath);
    } catch {
      // Spec not available — skip validation
    }
  }

  // Validation for connection-type questions
  const connectionQuestions = [
    "source_connection_type",
    "destination_connection_type",
  ];

  const written: string[] = [];
  const onAnswerActions: string[] = [];
  let hasValidationErrors = false;

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
          const match = validChoices.find(c => c.toLowerCase() === answer.toLowerCase());
          if (match) {
            answer = match;
            console.error(`NOTE: Auto-corrected "${rawAnswer}" → "${match}" for ${questionId}`);
          } else {
            // Build enriched error with choice descriptions from implications
            let choiceLines = "";
            const implications = specItem.implications as Record<string, string> | undefined;
            if (implications) {
              choiceLines = validChoices.map(c => {
                const desc = implications[c]
                  ? ` — ${(implications[c] as string).trim().split("\n")[0]}`
                  : "";
                return `    <choice value="${c}">${c}${desc}</choice>`;
              }).join("\n");
            } else {
              choiceLines = validChoices.map(c =>
                `    <choice value="${c}">${c}</choice>`
              ).join("\n");
            }
            console.error(
              `<validation-error key="${questionId}" attempted="${answer}">\n` +
              `  <valid-choices>\n${choiceLines}\n  </valid-choices>\n` +
              `  <instruction>Use ONLY the exact value= strings above. Present these choices to the user if needed. Do NOT invent alternatives.</instruction>\n` +
              `</validation-error>`
            );
            hasValidationErrors = true;
            continue; // Skip writing this invalid answer
          }
        }
      }

      // Check on_answer for follow-up actions (using corrected value)
      if (specItem && specItem.on_answer && typeof specItem.on_answer === "object") {
        const onAnswer = specItem.on_answer as Record<string, string>;
        if (onAnswer[answer as string]) {
          onAnswerActions.push(
            `<action trigger="${questionId}=${answer}" blocking="true">\n` +
            `  ${onAnswer[answer as string].trim()}\n` +
            `</action>`
          );
        }
      }
    }

    target[questionId] = answer;
    written.push(questionId);

    if (connectionQuestions.includes(questionId)) {
      if (typeof answer === "object" && answer !== null) {
        const obj = answer as Record<string, unknown>;
        if (
          !obj.inputs ||
          (Array.isArray(obj.inputs) && obj.inputs.length === 0)
        ) {
          console.error(
            `WARNING: ${questionId} is missing 'inputs' array — will cause credentials error later.`
          );
        }
      } else {
        console.error(
          `WARNING: ${questionId} should be an object, not string.`
        );
      }
    }
  }

  if (hasValidationErrors && written.length === 0) {
    console.error("No valid answers to write.");
    return 1;
  }

  // Write back
  try {
    writeFileSync(answersFile, JSON.stringify(answers, null, 2));
    const prefix = flowId ? `[flow: ${flowId}] ` : "";
    console.log(`${prefix}${written.length} answers written to ${answersFile}`);
    for (const id of written) {
      const val = target[id];
      console.log(
        `   ${id} = ${typeof val === "string" ? val : JSON.stringify(val)}`
      );
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
        { encoding: "utf-8", timeout: 30000 }
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
