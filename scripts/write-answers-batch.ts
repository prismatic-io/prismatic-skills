#!/usr/bin/env npx tsx
/**
 * write-answers-batch.ts
 *
 * Writes multiple answers at once to reduce tool call noise.
 * Accepts a JSON object where keys are question IDs and values are answers.
 *
 * USAGE:
 *   npx tsx write-answers-batch.ts <answers-file> key=value [key2=value2 ...] [--flow <flow-id>]
 *   npx tsx write-answers-batch.ts <answers-file> --input-file <json-file> [--flow <flow-id>]
 *   npx tsx write-answers-batch.ts <answers-file> '<json-object>' [--flow <flow-id>]
 *   echo '<json-object>' | npx tsx write-answers-batch.ts <answers-file> [--flow <flow-id>]
 *
 * EXAMPLES:
 *   # PREFERRED: key=value pairs (no quoting, no permissions prompts)
 *   npx tsx write-answers-batch.ts reqs.json source_connection_type=oauth2
 *   npx tsx write-answers-batch.ts reqs.json trigger_type=webhook error_handler_type=retry
 *   npx tsx write-answers-batch.ts reqs.json --flow order-sync trigger_type=webhook
 *
 *   # With --sync: write answers AND run sync-task-list in one call
 *   npx tsx write-answers-batch.ts reqs.json --sync spec.yaml source_connection_type=oauth2
 *
 *   # For complex objects (component search results, nested JSON): use --input-file
 *   npx tsx write-answers-batch.ts reqs.json --input-file /tmp/batch-answers.json
 *
 *   # Inline JSON (simple values only — complex JSON triggers shell security warnings)
 *   npx tsx write-answers-batch.ts reqs.json '{"systems":"CRM to Slack"}'
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

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

function main(): number {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log(
      'Usage: npx tsx write-answers-batch.ts <answers-file> [--flow <flow-id>] \'<json-object>\'\n' +
      '       echo \'<json>\' | npx tsx write-answers-batch.ts <answers-file> [--flow <flow-id>]'
    );
    return 1;
  }

  const answersFile = args[0];

  // Parse flags and key=value pairs
  let flowId: string | null = null;
  let inputFile: string | null = null;
  let syncSpec: string | null = null;
  let batchRaw: string | undefined;
  const kvPairs: Array<[string, string]> = [];

  let i = 1;
  while (i < args.length) {
    if (args[i] === "--flow") {
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
    } else if (!batchRaw) {
      batchRaw = args[i];
      i++;
    } else {
      i++;
    }
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

  // Validation for connection-type questions
  const connectionQuestions = [
    "source_connection_type",
    "destination_connection_type",
  ];

  const written: string[] = [];

  for (const [questionId, answer] of Object.entries(batch)) {
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
