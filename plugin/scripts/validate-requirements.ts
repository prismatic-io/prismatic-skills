#!/usr/bin/env npx tsx
/**
 * validate-requirements.ts
 *
 * Lightweight validator: reads a YAML requirements spec + answers JSON,
 * reports what's complete, what's missing, and whether we're ready to proceed.
 *
 * Usage:
 *   prismatic-tools validate-requirements --session <name> --type <component|integration>
 *
 * Exit codes:
 *   0 — validation ran successfully (check output for completeness)
 *   2 — error (bad files, parse issues)
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadSpec } from "./shared/load-spec.js";
import { getSessionDirectory, getPluginRoot } from "./shared/project-directory.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Spec {
  version: number;
  completion: { action: string; description: string };
  required: {
    always: string[];
    when?: Array<{ condition: Record<string, unknown>; items: string[] }>;
  };
  groups: Array<{ id: string; label: string; items: string[] }>;
  items: Record<string, SpecItem>;
}

interface SpecItem {
  question?: string;
  type: string;
  inference?: "allowed" | "prohibited";
  scope?: "integration" | "flow";
  choices?: string[];
  condition?: Record<string, unknown>;
  depends_on?: string[];
  skippable?: boolean;
  skip_if_empty?: boolean;
  validate?: string;
  lookup?: { script: string; args: string[] };
  auto_populate?: { when: string; copy: Record<string, string> };
  note?: string;
  maps_to?: string;
  default?: unknown;
  info?: string;
  // Enrichment fields (v4.1) — used by the agent for narration, doc lookup, and code gen.
  // The validator does not access these; they're consumed by the agent at question-time and code-gen time.
  agent_context?: string;
  implications?: Record<string, string>;
  docs?: string[];
  cookbook_section?: string;
  references?: Array<{ path: string; phase: string; condition?: string }>;
}

type Answers = Record<string, unknown>;

interface MissingItem {
  id: string;
  question: string;
  group: string;
  inference: string;
  reason: string;
  flow?: string;
}

interface ValidationResult {
  status: "complete" | "incomplete";
  summary: {
    total_applicable: number;
    answered: number;
    missing: number;
    skipped: number;
  };
  missing: MissingItem[];
  not_applicable: Array<{ id: string; reason: string }>;
  warnings: Array<{ id: string; message: string }>;
  completion: { ready: boolean; action: string; description: string };
}

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "skipped" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function isSemanticEmpty(value: unknown): boolean {
  return isEmpty(value) || value === "none";
}

function _resolveVariable(answers: Answers, varPath: string): unknown {
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
    } else {
      return undefined;
    }
  }
  return current;
}

function evaluateCondition(condition: Record<string, unknown>, answers: Answers): boolean {
  for (const [key, expected] of Object.entries(condition)) {
    const actual = answers[key];

    // Simple exact match: { key: "value" }
    if (typeof expected === "string") {
      if (Array.isArray(actual)) {
        if (!actual.includes(expected)) return false;
      } else if (actual !== expected) {
        return false;
      }
      continue;
    }

    // Object condition: { key: { not: "x" } }, { key: { empty: true } }, etc.
    if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
      const cond = expected as Record<string, unknown>;

      if ("not" in cond) {
        if (Array.isArray(actual)) {
          if (actual.includes(cond.not)) return false;
        } else if (actual === cond.not) {
          return false;
        }
      }

      if ("empty" in cond && cond.empty === true) {
        if (!isSemanticEmpty(actual)) return false;
      }

      if ("not_empty" in cond && cond.not_empty === true) {
        if (isSemanticEmpty(actual)) return false;
      }

      if ("equals_answer" in cond) {
        const otherKey = cond.equals_answer as string;
        if (actual !== answers[otherKey]) return false;
      }

      if ("in" in cond) {
        const allowed = cond.in as unknown[];
        if (!allowed.includes(actual)) return false;
      }

      if ("contains" in cond) {
        if (!Array.isArray(actual) || !actual.includes(cond.contains)) return false;
      }
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Applicability check
// ---------------------------------------------------------------------------

function isApplicable(item: SpecItem, answers: Answers): [boolean, string] {
  // Check dependencies — all must be answered
  if (item.depends_on) {
    for (const dep of item.depends_on) {
      if (isEmpty(answers[dep])) {
        return [false, `dependency "${dep}" not yet answered`];
      }
    }
  }

  // Check condition
  if (item.condition) {
    if (!evaluateCondition(item.condition, answers)) {
      return [false, "condition not met"];
    }
  }

  return [true, ""];
}

// ---------------------------------------------------------------------------
// Find group for an item
// ---------------------------------------------------------------------------

function findGroup(spec: Spec, itemId: string): string {
  for (const group of spec.groups) {
    if (group.items.includes(itemId)) return group.id;
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
  const args = process.argv.slice(2);
  let specFile = "";
  let answersFile = "";
  let sessionName = "";
  let sessionType: "integration" | "component" = "integration";

  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--session" && i + 1 < args.length) {
      sessionName = args[i + 1];
      i++;
    } else if (args[i] === "--type" && i + 1 < args.length) {
      sessionType = args[i + 1] as "integration" | "component";
      i++;
    } else if (!args[i].startsWith("-")) {
      positional.push(args[i]);
    }
  }

  if (!sessionName && positional.length < 2) {
    console.error(
      "Usage: npx tsx validate-requirements.ts <spec.yaml> <answers.json>\n" +
        "       npx tsx validate-requirements.ts --session <name> [--type component|integration]",
    );
    return 2;
  }

  if (sessionName) {
    specFile = join(
      getPluginRoot(),
      "scripts",
      "questions",
      sessionType === "component" ? "component.yaml" : "integration.yaml",
    );
    answersFile = join(
      getSessionDirectory(sessionName, sessionType === "component" ? "components" : "integrations"),
      "requirements.json",
    );
  } else {
    specFile = positional[0];
    answersFile = positional[1];
  }

  // Load spec (resolves $include directives for domain files)
  let spec: Spec;
  try {
    spec = loadSpec(specFile) as unknown as Spec;
  } catch (e) {
    console.error(`Failed to load spec: ${e}`);
    return 2;
  }

  // Load answers
  let answers: Answers = {};
  try {
    if (existsSync(answersFile)) {
      answers = JSON.parse(readFileSync(answersFile, "utf-8")) as Answers;
    }
  } catch (e) {
    console.error(`Failed to load answers: ${e}`);
    return 2;
  }

  // Detect multi-flow mode (integrations only — components don't have flows)
  const isMultiFlow =
    sessionType !== "component" &&
    answers.flows !== undefined &&
    typeof answers.flows === "object" &&
    !Array.isArray(answers.flows) &&
    Object.keys(answers.flows as Record<string, unknown>).length > 0;

  const flowIds = isMultiFlow ? Object.keys(answers.flows as Record<string, unknown>) : [];

  // ---------------------------------------------------------------------------
  // Validate items — integration-scoped once, flow-scoped per flow
  // ---------------------------------------------------------------------------

  const missing: MissingItem[] = [];
  const notApplicable: Array<{ id: string; reason: string }> = [];
  const warnings: Array<{ id: string; message: string }> = [];
  let answered = 0;
  let skipped = 0;
  let totalApplicable = 0;

  /**
   * Validate a single item against a set of answers.
   * For flow-scoped items in multi-flow mode, mergedAnswers combines
   * integration-level + flow-level so conditions can reference either.
   */
  function validateItem(
    id: string,
    item: SpecItem,
    effectiveAnswers: Answers,
    flowLabel?: string,
  ): void {
    const [applicable, reason] = isApplicable(item, effectiveAnswers);

    if (!applicable) {
      notApplicable.push({ id, reason });
      return;
    }

    totalApplicable++;
    const value = effectiveAnswers[id];

    if (!isEmpty(value)) {
      if (value === "skipped") {
        skipped++;
      } else {
        answered++;
      }
      return;
    }

    // Item is applicable but not answered
    if (item.skippable) {
      skipped++;
      return;
    }

    missing.push({
      id,
      question: item.question ?? id,
      group: findGroup(spec, id),
      inference: item.inference ?? "allowed",
      reason: "applicable, not answered",
      ...(flowLabel ? { flow: flowLabel } : {}),
    });
  }

  // Process auto_populate before validation
  for (const [id, item] of Object.entries(spec.items)) {
    if (item.auto_populate) {
      const triggerValue = item.auto_populate.when;
      const currentValue = answers[id];
      if (currentValue === triggerValue && item.auto_populate.copy) {
        for (const [targetKey, sourceKey] of Object.entries(item.auto_populate.copy)) {
          if (isEmpty(answers[targetKey]) && !isEmpty(answers[sourceKey])) {
            answers[targetKey] = answers[sourceKey];
            warnings.push({
              id: targetKey,
              message: `Auto-populated from ${sourceKey} (via ${id} = "${triggerValue}")`,
            });
          }
        }
      }
    }
  }

  for (const [id, item] of Object.entries(spec.items)) {
    const scope = item.scope ?? "integration";

    // Handle skip_if_empty: if the item depends on a lookup that returned empty, skip it
    if (item.skip_if_empty) {
      const deps = item.depends_on ?? [];
      const shouldSkip = deps.some((dep) => isEmpty(answers[dep]));
      if (shouldSkip) {
        notApplicable.push({ id, reason: "skip_if_empty: dependency is empty" });
        continue;
      }
    }

    if (scope === "flow" && isMultiFlow) {
      // Validate once per flow — merge integration + flow answers
      for (const flowId of flowIds) {
        const flowAnswers =
          (answers.flows as Record<string, Record<string, unknown>>)[flowId] ?? {};
        const merged: Answers = { ...answers, ...flowAnswers };
        // Remove `flows` key from merged to avoid confusion
        delete merged.flows;
        validateItem(id, item, merged, flowId);
      }
    } else {
      // Integration-scoped, or single-flow (answers at root)
      validateItem(id, item, answers);
    }
  }

  // Check required items
  function checkRequired(
    reqId: string,
    reason: string,
    effectiveAnswers: Answers,
    flowLabel?: string,
  ): void {
    const dedupeKey = flowLabel ? `${reqId}::${flowLabel}` : reqId;
    if (
      isEmpty(effectiveAnswers[reqId]) &&
      !missing.some((m) => (m.flow ? `${m.id}::${m.flow}` : m.id) === dedupeKey)
    ) {
      const item = spec.items[reqId];
      if (item) {
        missing.push({
          id: reqId,
          question: item.question ?? reqId,
          group: findGroup(spec, reqId),
          inference: item.inference ?? "allowed",
          reason,
          ...(flowLabel ? { flow: flowLabel } : {}),
        });
      }
    }
  }

  for (const reqId of spec.required.always) {
    const item = spec.items[reqId];
    const scope = item?.scope ?? "integration";

    if (scope === "flow" && isMultiFlow) {
      for (const flowId of flowIds) {
        const flowAnswers =
          (answers.flows as Record<string, Record<string, unknown>>)[flowId] ?? {};
        const merged: Answers = { ...answers, ...flowAnswers };
        delete merged.flows;
        checkRequired(reqId, "required, not answered", merged, flowId);
      }
    } else {
      checkRequired(reqId, "required, not answered", answers);
    }
  }

  // Check conditional required items
  for (const conditional of spec.required.when ?? []) {
    for (const reqId of conditional.items) {
      const item = spec.items[reqId];
      const scope = item?.scope ?? "integration";

      if (scope === "flow" && isMultiFlow) {
        for (const flowId of flowIds) {
          const flowAnswers =
            (answers.flows as Record<string, Record<string, unknown>>)[flowId] ?? {};
          const merged: Answers = { ...answers, ...flowAnswers };
          delete merged.flows;
          if (evaluateCondition(conditional.condition, merged)) {
            checkRequired(reqId, "conditionally required, not answered", merged, flowId);
          }
        }
      } else {
        if (evaluateCondition(conditional.condition, answers)) {
          checkRequired(reqId, "conditionally required, not answered", answers);
        }
      }
    }
  }

  // Deduplicate missing
  const seen = new Set<string>();
  const deduped = missing.filter((m) => {
    const key = m.flow ? `${m.id}::${m.flow}` : m.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const isComplete = deduped.length === 0;

  const result: ValidationResult = {
    status: isComplete ? "complete" : "incomplete",
    summary: {
      total_applicable: totalApplicable,
      answered,
      missing: deduped.length,
      skipped,
    },
    missing: deduped,
    not_applicable: notApplicable,
    warnings,
    completion: {
      ready: isComplete,
      action: spec.completion.action,
      description: spec.completion.description,
    },
  };

  console.log(JSON.stringify(result, null, 2));
  return 0;
}

process.exit(main());
