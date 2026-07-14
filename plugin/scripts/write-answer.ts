#!/usr/bin/env npx tsx
/** Persists one validated requirements answer while enforcing connection workflow gates. */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CliConfig, cliError, parseCliArgs } from "./shared/cli-help.js";
import { loadSpec } from "./shared/load-spec.js";
import { getPluginRoot, getSessionDirectory } from "./shared/project-directory.js";

const CLI = {
  command: "prismatic-tools write-answer",
  description: "Record one requirements answer.",
  notes: [
    "When answer is omitted, it is read from stdin.",
    "--flow writes under answers.flows[flow-id]; otherwise the answer is written at the root.",
    "Answers are decoded as JSON when possible and otherwise stored as strings.",
  ],
  examples: [
    "prismatic-tools write-answer --session my-project trigger_type webhook",
    "prismatic-tools write-answer --session my-project --flow order-sync retry_count 3",
  ],
  positionals: ["<question-id>", "[answer]"],
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
      description: "Write to a flow-specific answer.",
    },
    {
      name: "json",
      type: "boolean",
      description: "Compatibility flag; answers are always JSON-decoded when possible.",
    },
  ],
} as const satisfies CliConfig;

function main(): number {
  const { values, positionals: positional } = parseCliArgs(process.argv.slice(2), CLI);

  if (positional.length < (values.session ? 1 : 2)) {
    cliError(
      CLI,
      values.session ? "question-id is required." : "answers-file and question-id are required.",
    );
  }

  // Parse all flags first, collect positional args
  const flowId = typeof values.flow === "string" ? values.flow : null;
  const sessionName = typeof values.session === "string" ? values.session : null;
  const sessionType = values.type;

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
