#!/usr/bin/env npx tsx
/**
 * gather-requirements.ts
 *
 * PURPOSE: Interactive requirements gathering for Phase 2 using a DAG-based questionnaire
 *
 * WORKFLOW:
 *   1. Load question DAG from JSON file (defines available questions and flow logic)
 *   2. Load existing answers from JSON file (if continuing a session)
 *   3. Traverse DAG to find next unanswered question
 *   4. Output question as JSON for agent to present to user
 *   5. Agent writes user's answer back to answers file
 *   6. Re-run script - it continues from where it left off
 *   7. When all questions answered, output completion status
 *
 * EXIT CODES:
 *   0  - Success: either question with inference allowed, or phase complete
 *   2  - Error (invalid files, parsing issues, etc.)
 *   42 - BLOCKING: User input required. Agent MUST stop and wait for user response.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Question {
  id: string;
  text?: string;
  type: string;
  choices?: unknown[];
  next?: string[];
  condition?: Condition;
  command?: string[];
  allow_skip?: boolean;
  allow_inference?: boolean;
  inference_sources?: string[];
  validation_pattern?: string;
  validation_message?: string;
  choice_key?: string;
  choice_label?: string;
  store_full_object?: boolean;
  skip_if_empty?: boolean;
  auto_populate?: AutoPopulate;
  // agent_task fields
  agent?: string;
  description?: string;
  prompt_template?: string;
  // inline_task fields
  instructions?: string;
  output_file?: string;
  // auto_from_file fields
  file_template?: string;
  extract?: Record<string, string>;
}

interface Condition {
  question?: string;
  answer?: string;
  answer_is?: string;
  answer_not?: string;
  answer_equals?: string;
}

interface AutoPopulate {
  condition: { answer: string };
  mappings: Record<string, string>;
}

interface DAG {
  start: string;
  questions: Record<string, Question>;
  fragments?: Record<string, unknown>;
  completion?: {
    next_action: Record<string, unknown>;
  };
  required_shape?: Record<string, RequiredShape>;
}

interface RequiredShape {
  required_answers?: string[];
  conditional_answers?: Record<string, string[]>;
}

type Answers = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Variable resolution and template substitution
// ---------------------------------------------------------------------------

function resolveVariable(answers: Answers, varPath: string): unknown {
  const parts = varPath.split(".");
  let current: unknown = answers;

  for (const part of parts) {
    if (current !== null && typeof current === "object" && !Array.isArray(current)) {
      const obj = current as Record<string, unknown>;
      if (part in obj) {
        current = obj[part];
      } else {
        return undefined;
      }
    } else if (typeof current === "string") {
      try {
        const parsed = JSON.parse(current);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) && part in parsed) {
          current = parsed[part];
        } else {
          return undefined;
        }
      } catch {
        return undefined;
      }
    } else {
      return undefined;
    }
  }

  return current;
}

function substituteTemplate(template: unknown, answers: Answers): string {
  if (typeof template !== "string") return String(template ?? "");
  return template.replace(/\{([\w.]+)\}/g, (_match, varPath: string) => {
    const value = resolveVariable(answers, varPath);
    if (value === undefined || value === null) return `{${varPath}}`;
    return String(value);
  });
}

function substituteVariables(command: string[], answers: Answers): string[] {
  return command.map((part) => {
    if (typeof part === "string" && part.includes("{") && part.includes("}")) {
      return part.replace(/\{([\w.]+)\}/g, (_match, varPath: string) => {
        const value = resolveVariable(answers, varPath);
        if (value === undefined || value === null) return `{${varPath}}`;
        if (typeof value === "object") return JSON.stringify(value);
        return String(value);
      });
    }
    return part;
  });
}

// ---------------------------------------------------------------------------
// JSON file I/O
// ---------------------------------------------------------------------------

function loadJsonFile(filepath: string, isAnswersFile = false): unknown | null {
  try {
    const content = readFileSync(filepath, "utf-8");
    return JSON.parse(content);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      if (isAnswersFile) return {};
      console.error(`File not found: ${filepath}`);
      return null;
    }
    console.error(`Invalid JSON in ${filepath}: ${e}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

function evaluateCondition(condition: Condition | undefined, answers: Answers): boolean {
  if (!condition) return true;

  const questionId = condition.question;

  // Handle answer_equals condition (compare two answers)
  if (condition.answer_equals) {
    return answers[questionId!] === answers[condition.answer_equals];
  }

  // Handle answer_is conditions (empty/not_empty checks)
  if (condition.answer_is) {
    const userAnswer = answers[questionId!];
    const isEmpty =
      userAnswer === undefined ||
      userAnswer === null ||
      userAnswer === "" ||
      (Array.isArray(userAnswer) && userAnswer.length === 0) ||
      userAnswer === "skipped";
    if (condition.answer_is === "empty") return isEmpty;
    if (condition.answer_is === "not_empty") return !isEmpty;
    return false;
  }

  // Handle answer_not condition (negative match)
  if (condition.answer_not !== undefined) {
    if (!(questionId! in answers)) return false;
    const userAnswer = answers[questionId!];
    if (Array.isArray(userAnswer)) return !userAnswer.includes(condition.answer_not);
    return userAnswer !== condition.answer_not;
  }

  // Standard exact match condition
  if (!(questionId! in answers)) return false;
  const userAnswer = answers[questionId!];
  if (Array.isArray(userAnswer)) return userAnswer.includes(condition.answer);
  return userAnswer === condition.answer;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateRequirementsShape(
  dag: DAG,
  answers: Answers
): [boolean, string[]] {
  const shapes = dag.required_shape;
  if (!shapes) return [true, []];

  let activeShape: RequiredShape | undefined;
  for (const [key, shape] of Object.entries(shapes)) {
    if (key === "_default") {
      activeShape = shape;
      continue;
    }
    for (const answerVal of Object.values(answers)) {
      if (answerVal === key) {
        activeShape = shape;
        break;
      }
    }
    if (activeShape && key !== "_default") break;
  }

  if (!activeShape) return [true, []];

  const missing: string[] = [];
  for (const req of activeShape.required_answers ?? []) {
    const val = answers[req];
    if (val === undefined || val === null || val === "" || val === "skipped") {
      missing.push(req);
    }
  }

  for (const [conditionStr, required] of Object.entries(activeShape.conditional_answers ?? {})) {
    const parts = conditionStr.split(" == ");
    if (parts.length === 2) {
      const condKey = parts[0].trim();
      const condVal = parts[1].trim();
      if (answers[condKey] === condVal) {
        for (const req of required) {
          const val = answers[req];
          if (val === undefined || val === null || val === "" || val === "skipped") {
            missing.push(req);
          }
        }
      }
    }
  }

  return [missing.length === 0, missing];
}

// ---------------------------------------------------------------------------
// DAG traversal
// ---------------------------------------------------------------------------

function findNextQuestion(
  dag: DAG,
  answers: Answers
): [Question | null, string | null] {
  const questions = dag.questions;
  const startId = dag.start;

  if (!startId || !(startId in questions)) {
    return [null, "Invalid DAG: missing or invalid 'start' field"];
  }

  const visited = new Set<string>();
  const queue: string[] = [startId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const question = questions[currentId];
    if (!question) continue;

    if (!evaluateCondition(question.condition, answers)) continue;

    if (!(currentId in answers)) return [question, null];

    for (const nextId of question.next ?? []) {
      if (!visited.has(nextId)) queue.push(nextId);
    }
  }

  return [null, null];
}

// ---------------------------------------------------------------------------
// Dynamic command execution
// ---------------------------------------------------------------------------

function executeDynamicCommand(
  command: string[],
  answers: Answers
): [unknown[] | null, string | null] {
  try {
    command = substituteVariables(command, answers);

    // Resolve relative script paths
    const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    command = command.map((part) => {
      if (typeof part === "string" && part.startsWith("scripts/")) {
        return join(skillDir, part);
      }
      return part;
    });

    const result = spawnSync(command[0], command.slice(1), {
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (result.status !== 0) {
      return [null, `Command failed: ${(result.stderr || result.stdout || "").trim()}`];
    }

    const output = (result.stdout ?? "").trim();
    if (!output) return [null, "Command returned empty output"];

    // Find JSON in output
    let jsonStart = output.indexOf("[");
    if (jsonStart === -1) jsonStart = output.indexOf("{");
    if (jsonStart === -1) return [null, `No JSON found in command output: ${output}`];

    let parsed: unknown;
    try {
      // Try parsing from the JSON start position
      const jsonStr = output.slice(jsonStart);
      parsed = JSON.parse(jsonStr);
    } catch {
      // Try the whole output as fallback
      parsed = JSON.parse(output);
    }

    if (Array.isArray(parsed)) return [parsed, null];
    if (parsed !== null && typeof parsed === "object") return [[parsed], null];
    return [null, "Command output is not a JSON array or object"];
  } catch (e: unknown) {
    if (e instanceof SyntaxError) {
      return [null, `Failed to parse command output as JSON: ${e}`];
    }
    return [null, `Unexpected error executing command: ${e}`];
  }
}

// ---------------------------------------------------------------------------
// Auto-populate and auto-from-file
// ---------------------------------------------------------------------------

function handleAutoPopulate(
  question: Question,
  answers: Answers,
  answersFile: string
): boolean {
  const autoPop = question.auto_populate;
  if (!autoPop) return false;

  const conditionAnswer = autoPop.condition.answer;
  const currentAnswer = answers[question.id];

  if (currentAnswer !== conditionAnswer) return false;

  const mappings = autoPop.mappings;
  let populated = 0;

  for (const [destKey, sourceKey] of Object.entries(mappings)) {
    if (sourceKey in answers && !(destKey in answers)) {
      answers[destKey] = answers[sourceKey];
      populated++;
      console.error(`Auto-populated '${destKey}' from '${sourceKey}'`);
    }
  }

  if (populated > 0) {
    writeFileSync(answersFile, JSON.stringify(answers, null, 2));
  }

  return populated > 0;
}

function handleAutoFromFile(
  question: Question,
  answers: Answers,
  answersFile: string
): boolean {
  const fileTemplate = question.file_template ?? "";
  const filePath = substituteTemplate(fileTemplate, answers);

  if (!existsSync(filePath)) {
    console.error(`auto_from_file: file not found: ${filePath}`);
    return false;
  }

  let data: unknown;
  try {
    const content = readFileSync(filePath, "utf-8");
    data = JSON.parse(content);
  } catch (e) {
    console.error(`auto_from_file: error reading ${filePath}: ${e}`);
    return false;
  }

  const extract = question.extract ?? {};
  let extracted = 0;

  for (const [answerKey, jsonPath] of Object.entries(extract)) {
    const value = resolveVariable(data as Answers, jsonPath);
    if (value !== undefined && value !== null) {
      answers[answerKey] = value;
      extracted++;
      console.error(`Extracted '${answerKey}' = '${value}' from ${jsonPath}`);
    }
  }

  if (extracted > 0) {
    writeFileSync(answersFile, JSON.stringify(answers, null, 2));
  }

  return extracted > 0;
}

// ---------------------------------------------------------------------------
// Question output preparation
// ---------------------------------------------------------------------------

function prepareQuestionOutput(
  question: Question,
  answers: Answers
): [Record<string, unknown> | null, string | null] {
  const questionType = question.type;

  // Handle agent_task type
  if (questionType === "agent_task") {
    return [
      {
        status: "agent_task",
        question_id: question.id,
        task: {
          agent: question.agent,
          description: substituteTemplate(question.description ?? "", answers),
          prompt: substituteTemplate(question.prompt_template ?? "", answers),
        },
        instruction:
          "1. Spawn this agent using the Task tool with subagent_type set to the agent name. " +
          "2. After the agent completes, mark this question as answered using write-answer.ts " +
          "with value 'completed'. " +
          "3. Re-run gather-requirements.ts to continue to the next question.",
      },
      null,
    ];
  }

  // Handle inline_task type
  if (questionType === "inline_task") {
    return [
      {
        status: "inline_task",
        question_id: question.id,
        task: {
          description: substituteTemplate(question.description ?? "", answers),
          instructions: substituteTemplate(question.instructions ?? "", answers),
          output_file: substituteTemplate(question.output_file ?? "", answers),
        },
        instruction:
          "Perform this task directly using WebFetch/WebSearch. " +
          "Save results to output_file. " +
          "Mark answered with write-answer.ts.",
      },
      null,
    ];
  }

  // Handle auto_from_file type
  if (questionType === "auto_from_file") {
    return [
      {
        status: "auto_from_file",
        question_id: question.id,
      },
      null,
    ];
  }

  const output: Record<string, unknown> = {
    id: question.id,
    text: question.text,
    type: question.type,
  };

  if (question.allow_skip) output.allow_skip = true;

  if (question.allow_inference) {
    output.allow_inference = true;
    const inferenceSources = question.inference_sources ?? [];
    output.inference_sources = inferenceSources;

    const inferenceContext: Record<string, unknown> = {};
    for (const sourceId of inferenceSources) {
      if (sourceId in answers) inferenceContext[sourceId] = answers[sourceId];
    }
    output.inference_context = inferenceContext;
  }

  if (question.validation_pattern) {
    output.validation_pattern = question.validation_pattern;
    output.validation_message =
      question.validation_message ?? `Answer must match: ${question.validation_pattern}`;
  }

  // Handle static choices
  if ((questionType === "choice" || questionType === "multi_choice") && question.choices) {
    output.choices = question.choices;
  }
  // Handle dynamic choices
  else if (questionType === "dynamic_choice") {
    const command = question.command;
    if (!command) return [null, "Dynamic choice question missing 'command' field"];

    const [choicesData, error] = executeDynamicCommand(command, answers);
    if (error) {
      if (question.allow_skip) {
        output.choices = [];
        output.skip_reason = error;
        return [output, null];
      }
      return [null, error];
    }

    const choiceKey = question.choice_key ?? "value";
    const choiceLabel = question.choice_label ?? "label";
    const storeFullObject = question.store_full_object ?? false;

    const choices: Record<string, unknown>[] = [];
    for (const item of choicesData!) {
      if (item !== null && typeof item === "object" && !Array.isArray(item)) {
        const obj = item as Record<string, unknown>;
        const value = obj[choiceKey] ?? String(item);
        const label = obj[choiceLabel] ?? value;

        if (storeFullObject) {
          choices.push({ value: item, label, display_value: value });
        } else {
          choices.push({ value, label });
        }
      } else {
        choices.push({ value: String(item), label: String(item) });
      }
    }

    output.choices = choices;

    // Handle skip_if_empty
    if (question.skip_if_empty && choices.length === 0) {
      return [{ status: "auto_skipped", question_id: question.id }, null];
    }

    if (storeFullObject) {
      output.store_full_object = true;
      output.write_instruction =
        "When writing the answer, use the 'value' field from the selected choice " +
        "(the full object), NOT the 'label' string.";
    }
  }

  return [output, null];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
  const args = process.argv.slice(2);
  let questionsFile = "";
  let answersFile = "";
  let contextFile = "";

  // Parse args: <questions_file> <answers_file> [--context <file>]
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--context" && i + 1 < args.length) {
      contextFile = args[i + 1];
      i++;
    } else if (!args[i].startsWith("-")) {
      positional.push(args[i]);
    }
  }

  if (positional.length < 2) {
    console.error(
      "Usage: npx tsx gather-requirements.ts <questions_file> <answers_file> [--context <file>]"
    );
    return 2;
  }

  questionsFile = positional[0];
  answersFile = positional[1];

  // Load question DAG
  const dag = loadJsonFile(questionsFile) as DAG | null;
  if (dag === null) return 2;

  // Load existing answers
  let answers = (loadJsonFile(answersFile, true) ?? {}) as Answers;

  // Merge context if provided
  if (contextFile) {
    const context = loadJsonFile(contextFile, true) as Answers | null;
    if (context) {
      let mergedCount = 0;
      for (const [key, value] of Object.entries(context)) {
        if (!(key in answers)) {
          answers[key] = value;
          mergedCount++;
        }
      }
      if (mergedCount > 0) {
        writeFileSync(answersFile, JSON.stringify(answers, null, 2));
        console.error(`Merged ${mergedCount} pre-populated answers from context file`);
      }
    }
  }

  // Find next unanswered question, handling auto-skips in a loop
  let questionOutput: Record<string, unknown> | null = null;
  let nextQuestion: Question | null = null;

  while (true) {
    const [foundQuestion, error] = findNextQuestion(dag, answers);

    if (error) {
      console.error(error);
      return 2;
    }

    if (foundQuestion === null) {
      // All questions answered — validate against required_shape
      const [shapeValid, shapeMissing] = validateRequirementsShape(dag, answers);
      if (!shapeValid) {
        console.error(
          `Warning: Requirements incomplete — missing answers: ${shapeMissing.join(", ")}`
        );
      }

      const completion = dag.completion;
      if (!completion || !("next_action" in completion)) {
        console.error(
          "Error: questionnaire JSON is missing a 'completion' block with 'next_action'"
        );
        return 2;
      }

      const nextActionTemplate = completion.next_action;
      const nextAction: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(nextActionTemplate)) {
        if (typeof value === "string") {
          nextAction[key] = substituteTemplate(value, answers);
        } else {
          nextAction[key] = value;
        }
      }

      const output: Record<string, unknown> = {
        status: "complete",
        answers,
        next_action: nextAction,
        shape_valid: shapeValid,
      };
      if (!shapeValid) output.shape_missing = shapeMissing;

      console.log(JSON.stringify(output, null, 2));
      console.error("\nPhase 2 complete - all requirements gathered");
      return 0;
    }

    nextQuestion = foundQuestion;

    // Prepare question for output
    const [prepared, prepError] = prepareQuestionOutput(nextQuestion, answers);
    if (prepError) {
      console.error(prepError);
      return 2;
    }

    questionOutput = prepared!;

    // Handle auto_skipped questions
    if (questionOutput.status === "auto_skipped") {
      const qid = questionOutput.question_id as string;
      answers[qid] = "skipped";
      writeFileSync(answersFile, JSON.stringify(answers, null, 2));
      console.error(`Auto-skipped '${qid}' (skip_if_empty, no choices available)`);
      continue;
    }

    // Handle auto_from_file questions
    if (questionOutput.status === "auto_from_file") {
      const qid = questionOutput.question_id as string;
      if (handleAutoFromFile(nextQuestion, answers, answersFile)) {
        answers[qid] = "auto_extracted";
        writeFileSync(answersFile, JSON.stringify(answers, null, 2));
        console.error(`Auto-extracted answers from file for '${qid}'`);
      } else {
        answers[qid] = "skipped";
        writeFileSync(answersFile, JSON.stringify(answers, null, 2));
        console.error(`Auto-extraction failed for '${qid}', skipping`);
      }
      continue;
    }

    // Normal question — break out of loop
    break;
  }

  // Check for auto_populate on previously answered questions
  for (const [qid, q] of Object.entries(dag.questions)) {
    if (qid in answers && q.auto_populate) {
      handleAutoPopulate(q, answers, answersFile);
    }
  }

  // Handle inline_task type
  if (questionOutput!.status === "inline_task") {
    console.log(JSON.stringify(questionOutput, null, 2));
    return 0;
  }

  // Handle agent_task type
  if (questionOutput!.status === "agent_task") {
    console.log(JSON.stringify(questionOutput, null, 2));
    return 0;
  }

  const hasInference = questionOutput!.allow_inference === true;

  if (hasInference) {
    const output = {
      status: "question",
      allow_inference: true,
      question: questionOutput,
      instruction:
        "You MAY infer the answer if 100% confident from inference_context. " +
        "If ANY uncertainty, ask the user.",
    };
    console.log(JSON.stringify(output, null, 2));
    return 0;
  } else {
    // Question REQUIRES user input — clean, structured output
    const questionData: Record<string, unknown> = {
      id: questionOutput!.id,
      type: questionOutput!.type,
    };
    if ("choices" in questionOutput!) questionData.choices = questionOutput!.choices;
    if (questionOutput!.store_full_object) {
      questionData.store_full_object = true;
      questionData.write_instruction = questionOutput!.write_instruction;
    }

    console.log();
    console.log("EXIT_CODE_42: USER_INPUT_REQUIRED");
    console.log(`Question ID: ${questionOutput!.id}`);
    console.log("---");
    console.log(
      JSON.stringify(
        {
          question: questionOutput!.text,
          data: questionData,
          answers_file: answersFile,
        },
        null,
        2
      )
    );

    return 42;
  }
}

process.exit(main());
