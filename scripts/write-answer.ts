#!/usr/bin/env npx tsx
/**
 * write-answer.ts
 *
 * Helper script for agents to write answers to the requirements file.
 *
 * USAGE:
 *   npx tsx write-answer.ts <answers-file> <question-id> <answer>
 *   npx tsx write-answer.ts <answers-file> --flow <flow-id> <question-id> <answer>
 *   echo '<answer>' | npx tsx write-answer.ts <answers-file> [--flow <flow-id>] <question-id>
 *
 * When --flow is provided, the answer is written under answers.flows[flowId].
 * When omitted, the answer is written at the root level (backward compatible).
 * When the answer argument is omitted, the script reads from stdin.
 *
 * EXIT CODES:
 *   0 - Success
 *   1 - Error
 */

import { readFileSync, writeFileSync } from "node:fs";

function main(): number {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(
      "Usage: npx tsx write-answer.ts <answers-file> [--flow <flow-id>] <question-id> <answer>\n" +
      "       echo '<answer>' | npx tsx write-answer.ts <answers-file> [--flow <flow-id>] <question-id>"
    );
    return 1;
  }

  const answersFile = args[0];

  // Parse --flow flag
  let flowId: string | null = null;
  let restArgs: string[];

  if (args[1] === "--flow") {
    if (args.length < 4) {
      console.error("--flow requires a flow ID and question ID");
      return 1;
    }
    flowId = args[2];
    restArgs = args.slice(3);
  } else {
    restArgs = args.slice(1);
  }

  const questionId = restArgs[0];
  let answerRaw: string | undefined = restArgs[1];

  if (answerRaw === "--json" && restArgs.length > 2) {
    answerRaw = restArgs[2];
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

  // Validation warning for connection-type questions
  const connectionQuestions = [
    "source_connection_type",
    "destination_connection_type",
  ];

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

  // Write back
  try {
    writeFileSync(answersFile, JSON.stringify(answers, null, 2));
    const prefix = flowId ? `[flow: ${flowId}] ` : "";
    console.log(`${prefix}Answer written to ${answersFile}`);
    console.log(`   ${questionId} = ${typeof answer === "string" ? answer : JSON.stringify(answer)}`);
    return 0;
  } catch (e) {
    console.error(`Failed to write file: ${e}`);
    return 1;
  }
}

process.exit(main());
