#!/usr/bin/env npx tsx
/**
 * write-answer.ts
 *
 * Helper script for agents to write answers to the requirements file.
 *
 * USAGE:
 *   prismatic-tools write-answer --session <name> --type <component|integration> <question-id> <answer>
 *   prismatic-tools write-answer --session <name> --type <component|integration> --flow <flow-id> <question-id> <answer>
 *
 * When --flow is provided, the answer is written under answers.flows[flowId].
 * When omitted, the answer is written at the root level (backward compatible).
 * When the answer argument is omitted, the script reads from stdin.
 *
 * EXIT CODES:
 *   0 - Success
 *   1 - Error
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getSessionDirectory, getPluginRoot } from "./shared/project-directory.js";
import { loadSpec } from "./shared/load-spec.js";

function main(): number {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(
      "Usage: npx tsx write-answer.ts <answers-file> [--flow <flow-id>] <question-id> <answer>\n" +
        "       npx tsx write-answer.ts --session <name> [--type component|integration] [--flow <flow-id>] <question-id> <answer>",
    );
    return 1;
  }

  // Parse all flags first, collect positional args
  let flowId: string | null = null;
  let sessionName: string | null = null;
  let sessionType: "integration" | "component" = "integration";
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
    } else if (args[i] === "--type") {
      if (i + 1 >= args.length) {
        console.error("--type requires a value (component or integration)");
        return 1;
      }
      sessionType = args[i + 1] as "integration" | "component";
      i += 2;
    } else if (args[i] === "--flow") {
      if (i + 1 >= args.length) {
        console.error("--flow requires a flow ID");
        return 1;
      }
      flowId = args[i + 1];
      i += 2;
    } else if (args[i] === "--json") {
      i++; // skip, handled below
    } else if (!args[i].startsWith("-")) {
      positional.push(args[i]);
      i++;
    } else {
      i++;
    }
  }

  // Resolve answersFile and remaining positional args
  let answersFile: string;
  let questionId: string;
  let answerRaw: string | undefined;

  if (sessionName) {
    answersFile = join(
      getSessionDirectory(sessionName, sessionType === "component" ? "components" : "integrations"),
      "requirements.json",
    );
    questionId = positional[0];
    answerRaw = positional[1];
  } else {
    answersFile = positional[0];
    questionId = positional[1];
    answerRaw = positional[2];
  }

  // If no answer argument, read from stdin
  if (answerRaw === undefined) {
    try {
      answerRaw = readFileSync(0, "utf-8").trim();
    } catch {
      console.error("No answer argument provided and failed to read from stdin");
      return 1;
    }
    if (!answerRaw) {
      console.error("No answer argument provided and stdin is empty");
      return 1;
    }
  }

  // Try to parse answer as JSON (for arrays/objects), fall back to string
  let answer: unknown;
  try {
    answer = JSON.parse(answerRaw);
  } catch {
    answer = answerRaw;
  }

  // Gate: block direct writes to connection_existing keys (integrations only).
  // These must come from actual search-connections results, not fabricated objects.
  // The agent must use the connection workflow in record-choices, not bypass it via write-answer.
  if (sessionType !== "component") {
    const connectionExistingKeys = [
      "source_connection_existing",
      "destination_connection_existing",
    ];
    if (connectionExistingKeys.includes(questionId)) {
      console.log(
        `Answer REJECTED: ${questionId} cannot be written via write-answer.\n\n` +
          `<connection-gate>\n` +
          `  Connection existing values must come from actual search results, not fabricated objects.\n` +
          `  Use the connection workflow in record-choices instead:\n` +
          `  1. Run prismatic-tools search-connections <system>\n` +
          `  2. Record the search result via record-choices\n` +
          `  3. The connection gate in record-choices handles the creation workflow\n` +
          `</connection-gate>`,
      );
      return 1;
    }
  }

  // Validate against spec choices (same validation as record-choices)
  if (typeof answer === "string") {
    const specName = sessionType === "component" ? "component.yaml" : "integration.yaml";
    const specPath = join(getPluginRoot(), "scripts", "questions", specName);
    if (existsSync(specPath)) {
      try {
        const spec = loadSpec(specPath);
        const specItem = spec.items[questionId];
        if (specItem && Array.isArray(specItem.choices)) {
          const validChoices = specItem.choices as string[];
          if (!validChoices.includes(answer)) {
            const answerStr = answer;
            const match = validChoices.find((c) => c.toLowerCase() === answerStr.toLowerCase());
            if (match) {
              answer = match;
              console.error(`NOTE: Auto-corrected "${answerRaw}" → "${match}" for ${questionId}`);
            } else {
              console.log(
                `Answer REJECTED: "${answer}" is not a valid choice for ${questionId}.\n` +
                  `Valid choices: ${validChoices.join(", ")}`,
              );
              return 1;
            }
          }
        }
      } catch {
        // Spec not available — skip validation
      }
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

  // Add/update answer
  target[questionId] = answer;

  // Validation warning for connection-type questions (integrations only)
  if (sessionType !== "component") {
    const connectionQuestions = ["source_connection_type", "destination_connection_type"];

    if (connectionQuestions.includes(questionId)) {
      if (typeof answer === "object" && answer !== null) {
        const obj = answer as Record<string, unknown>;
        if (!obj.inputs || (Array.isArray(obj.inputs) && obj.inputs.length === 0)) {
          console.error("");
          console.error("WARNING: Connection answer is missing 'inputs' array!");
          console.error("   This will cause 'No credentials needed' error later.");
          console.error("");
          console.error("   Expected: Full object from choice 'value' field with:");
          console.error("   - key");
          console.error("   - label");
          console.error("   - auth_type");
          console.error("   - required_inputs (array)");
          console.error("   - inputs (array) <- CRITICAL FOR CREDENTIALS");
          console.error("");
        }
      } else {
        console.error("");
        console.error("WARNING: Connection answer should be an object, not string!");
        console.error("   Use the full 'value' object from the choice, not just label.");
        console.error("");
      }
    }
  }

  // Write back
  try {
    writeFileSync(answersFile, JSON.stringify(answers, null, 2));
    const prefix = flowId ? `[flow: ${flowId}] ` : "";
    console.log(`${prefix}Answer written to ${answersFile}`);
    console.log(
      `   ${questionId} = ${typeof answer === "string" ? answer : JSON.stringify(answer)}`,
    );
    return 0;
  } catch (e) {
    console.error(`Failed to write file: ${e}`);
    return 1;
  }
}

process.exit(main());
