#!/usr/bin/env npx tsx
/**
 * update-tasks.ts
 *
 * Bridges the spec's condition/dependency structure with Claude Code's Task system.
 * Reads the spec + current answers, evaluates conditions, and outputs a task
 * manifest describing what the task list SHOULD look like.
 *
 * USAGE:
 *   prismatic-tools update-tasks --session <name> --type <component|integration> --actionable
 *   prismatic-tools update-tasks --session <name> --type <component|integration> --actionable --mode modify --extracted-state <state.json>
 *
 * OPTIONS:
 *   --session <name>        Session name (required)
 *   --type component|integration  Spec type (default: integration)
 *   --mode build|modify     Workflow mode (default: build)
 *   --extracted-state <file> Path to extracted state JSON (modify mode only)
 *   --scope <scope-list>     Comma-separated modification scopes to filter items
 *
 * OUTPUT (JSON):
 *   {
 *     "tasks": [
 *       {
 *         "spec_key": "error_handler_type",
 *         "subject": "Resolve: What should happen when the flow throws an error?",
 *         "description": "...",
 *         "group": "error_handling",
 *         "scope": "flow",
 *         "status": "pending|answered|not_applicable",
 *         "blocked_by_keys": ["trigger_type"],
 *         "flow_id": null,
 *         "inference": "prohibited",
 *         "current_value": null
 *       }
 *     ],
 *     "summary": {
 *       "total_applicable": 14,
 *       "answered": 6,
 *       "pending": 5,
 *       "blocked": 3,
 *       "not_applicable": 22
 *     },
 *     "ready_for_next_phase": false
 *   }
 *
 * EXIT CODES:
 *   0 - Success
 *   2 - Error (bad files, parse issues)
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadSpec } from "../shared/load-spec.js";
import { getSessionDirectory, getPluginRoot } from "../shared/project-directory.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpecItem {
  question?: string;
  type?: string;
  inference?: "allowed" | "prohibited";
  scope?: "integration" | "flow";
  choices?: string[];
  condition?: Record<string, unknown>;
  depends_on?: string[];
  skippable?: boolean;
  skip_if_empty?: boolean;
  default?: unknown;
  agent_context?: string;
  implications?: Record<string, string>;
  suggestions?: string[];
  cookbook_section?: string;
  maps_to?: string;
  note?: string;
  on_answer?: Record<string, string>;
}

interface Spec {
  version: number;
  completion: { action: string; description: string };
  required: {
    always: string[];
    when?: Array<{ condition: Record<string, unknown>; items: string[] }>;
  };
  groups: Array<{ id: string; label: string; items?: string[] }>;
  items: Record<string, SpecItem>;
}

type Answers = Record<string, unknown>;

interface TaskEntry {
  spec_key: string;
  subject: string;
  description: string;
  group: string;
  scope: "integration" | "flow";
  status: "pending" | "answered" | "not_applicable" | "blocked";
  blocked_by_keys: string[];
  flow_id: string | null;
  inference: string;
  current_value: unknown;
  is_required: boolean;
}

interface TaskManifest {
  tasks: TaskEntry[];
  summary: {
    total_applicable: number;
    answered: number;
    pending: number;
    blocked: number;
    not_applicable: number;
  };
  ready_for_next_phase: boolean;
}

// ---------------------------------------------------------------------------
// Condition evaluation (reused from validate-requirements.ts)
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

/** Check if a value is "semantically empty" — used for condition evaluation.
 * "none" is treated as empty for conditions (so downstream items like api_docs_url activate)
 * but NOT for isEmpty (so the item is still marked as "answered" by update-tasks). */
function isSemanticEmpty(value: unknown): boolean {
  return isEmpty(value) || value === "none";
}

/** Normalize common truthy/falsy representations to match spec string values */
function normalizeForComparison(value: unknown): unknown {
  if (value === true || value === "true") return "Yes";
  if (value === false || value === "false") return "No";
  return value;
}

function evaluateCondition(condition: Record<string, unknown>, answers: Answers): boolean {
  for (const [key, expected] of Object.entries(condition)) {
    const actual = normalizeForComparison(answers[key]);

    if (typeof expected === "string") {
      if (Array.isArray(actual)) {
        if (!actual.includes(expected)) return false;
      } else if (actual !== expected) {
        return false;
      }
      continue;
    }

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
// Applicability and blocking
// ---------------------------------------------------------------------------

function getItemStatus(
  item: SpecItem,
  answers: Answers,
  value: unknown,
): "pending" | "answered" | "not_applicable" | "blocked" {
  // Check if answered
  if (!isEmpty(value)) return "answered";

  // Check dependencies — if a dependency isn't answered, item is blocked
  if (item.depends_on) {
    for (const dep of item.depends_on) {
      if (isEmpty(answers[dep])) return "blocked";
    }
  }

  // Check condition — if condition not met, item is not applicable
  if (item.condition) {
    if (!evaluateCondition(item.condition, answers)) return "not_applicable";
  }

  return "pending";
}

/**
 * Determine which spec keys block a given item.
 * This combines explicit depends_on AND condition-referenced keys.
 */
function getBlockingKeys(item: SpecItem): string[] {
  const keys: string[] = [];

  if (item.depends_on) {
    keys.push(...item.depends_on);
  }

  // Also extract keys from conditions — if a condition references a key,
  // that key effectively blocks this item until it has a value
  if (item.condition) {
    for (const key of Object.keys(item.condition)) {
      if (!keys.includes(key)) {
        keys.push(key);
      }
    }
  }

  return keys;
}

// ---------------------------------------------------------------------------
// Group lookup
// ---------------------------------------------------------------------------

function findGroup(spec: Spec, itemId: string): string {
  for (const group of spec.groups) {
    if (group.items?.includes(itemId)) return group.id;
  }
  return "unknown";
}

function findGroupLabel(spec: Spec, groupId: string): string {
  for (const group of spec.groups) {
    if (group.id === groupId) return group.label ?? groupId;
  }
  return groupId;
}

/**
 * Build an actionable task subject from a spec item.
 * Instead of "[flow-id] What should happen when...?" we produce
 * "New Order Sync: choose error handling strategy"
 *
 * Strategy: humanize the spec key into an imperative action.
 * The spec key is the most concise identifier (e.g., "error_handler_type",
 * "source_connection_type", "trigger_type"). The question field is too long
 * for a task subject but good for description.
 */
// Override subjects for spec keys that don't humanize well (integration)
const SUBJECT_OVERRIDES: Record<string, string> = {
  systems: "Identify source and destination systems",
  data_flow: "Describe what data moves between systems and how",
  flow_count: "How many flows does this integration need?",
  flow_definitions: "Name each flow and describe what it does",
  flow_description: "What does this flow do — what actions in the destination system?",
  is_synchronous: "Should the flow respond synchronously (29s timeout) or async?",
  error_handler_type: "What happens when a flow's execution throws an error?",
  error_retry_max_attempts: "How many times should a failed execution retry?",
  error_retry_delay_seconds: "How many seconds between retry attempts?",
  error_retry_backoff: "Should retry delay increase exponentially?",
  error_retry_ignore_final: "If all retries fail, mark as success or failure?",
  execution_retry_enabled: "Enable delayed retry (minutes apart, separate executions)?",
  execution_retry_max_attempts: "Max delayed retry attempts",
  execution_retry_delay_minutes: "Minutes between delayed retries",
  source_component: "Search for a Prismatic component for the source system",
  destination_component: "Search for a Prismatic component for the destination system",
  source_connection_type: "Which auth method for the source system (OAuth, API key, etc.)?",
  source_connection: "How should the source connection be managed?",
  destination_connection_type: "Which auth method for the destination system?",
  destination_connection: "How should the destination connection be managed?",
  endpoint_type: "How should webhook URLs be structured (per-flow or shared)?",
  endpoint_security: "How should webhook endpoints be secured?",
  trigger_type: "What triggers execution — webhook, schedule, or polling?",
  needs_deploy_hooks: "Run setup/teardown code on instance deploy and delete?",
  needs_state_management: "Does the integration need to remember state between executions?",
  transformations: "What data transformations are needed (field mapping, filtering, enrichment)?",
  schedule_value: "What schedule should the flow run on?",
};

// Override subjects for component spec keys
const COMPONENT_SUBJECT_OVERRIDES: Record<string, string> = {
  component_type: "What type of component are you building?",
  component_name: "Name the component",
  component_description: "Describe what the component does",
  api_name: "What external API does this connector wrap?",
  api_docs_url: "API documentation URL",
  auth_type: "Which authentication method?",
  base_url: "Base URL for the API",
  confirm_resources: "Which API resources should the component support?",
  resource_actions: "What operations per resource (CRUD)?",
  pagination_strategy: "How should pagination be handled?",
  webhook_support: "Does this API support webhooks?",
  webhook_events: "Which webhook events to listen for?",
  webhook_security: "How are webhooks verified?",
  polling_support: "Should the component support polling?",
  data_source_support: "Include data source (picklist) actions?",
  data_source_resources: "Which resources need data sources?",
  utility_actions: "What actions should this utility provide?",
  utility_inputs: "What input types will actions work with?",
  error_handling_strategy: "How should API errors be handled?",
  additional_requirements: "Any additional requirements?",
};

function buildSubject(
  item: SpecItem,
  id: string,
  _groupLabel: string,
  flowName?: string,
  sessionType?: string,
): string {
  const prefix = flowName ? `${flowName}: ` : "";

  // Use override if available (type-aware)
  const overrides = sessionType === "component" ? COMPONENT_SUBJECT_OVERRIDES : SUBJECT_OVERRIDES;
  const override = overrides[id];
  if (override) return `${prefix}${override}`;

  // Humanize the spec key: some_config_option → "some config option"
  const humanized = id.replace(/_/g, " ");

  // Pick a verb based on item type
  const verb =
    item.type === "choice" || item.type === "multi_choice"
      ? "Choose"
      : item.type === "lookup"
        ? "Select"
        : item.type === "text"
          ? "Define"
          : "Configure";

  return `${prefix}${verb} ${humanized}`;
}

// ---------------------------------------------------------------------------
// Required items check
// ---------------------------------------------------------------------------

function isRequired(spec: Spec, itemId: string, answers: Answers): boolean {
  if (spec.required.always.includes(itemId)) return true;

  // inference: prohibited items are implicitly required — they can't be
  // inferred, so the user must be asked. Without this, prohibited items
  // that aren't in required.always/when get classified as optional and
  // the agent skips them (e.g., execution_retry_enabled, queue config).
  const item = spec.items[itemId];
  if (item?.inference === "prohibited") return true;

  for (const conditional of spec.required.when ?? []) {
    if (conditional.items.includes(itemId) && evaluateCondition(conditional.condition, answers)) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Scope filtering for modify mode
// ---------------------------------------------------------------------------

/** Map modification_scope choices to relevant spec group IDs */
const SCOPE_TO_GROUPS: Record<string, string[]> = {
  "Add a new flow": [
    "overview",
    "flow_planning",
    "flow_config",
    "source",
    "destination",
    "error_handling",
    "execution_retry",
    "queue_config",
    "lifecycle_hooks",
    "state_management",
    "payload_and_config",
    "behavior",
  ],
  "Modify a flow's behavior": [
    "flow_config",
    "error_handling",
    "execution_retry",
    "queue_config",
    "lifecycle_hooks",
    "state_management",
  ],
  "Change error handling / retry config": ["error_handling", "execution_retry"],
  "Add or change a component": ["source", "destination"],
  "Modify config pages": ["payload_and_config"],
  "Add lifecycle hooks": ["lifecycle_hooks"],
  "Add state management": ["state_management"],
  "Fix a bug": [], // No spec items for bug fixes — agent handles directly
};

function getRelevantGroups(modificationScopes: string[], sessionType?: string): Set<string> | null {
  // Scope filtering only applies to integrations; components have no scope map
  if (sessionType === "component") return null;
  if (modificationScopes.length === 0) return null; // No filter — show all

  const groups = new Set<string>();
  for (const scope of modificationScopes) {
    const mapped = SCOPE_TO_GROUPS[scope];
    if (mapped) {
      for (const g of mapped) groups.add(g);
    }
  }
  return groups.size > 0 ? groups : null;
}

// ---------------------------------------------------------------------------
// Connector template expansion (for 3+ connectors)
// ---------------------------------------------------------------------------

/**
 * Expand the connector template for additional systems beyond source/destination.
 * Reads additional_systems from answers, loads the template YAML, and creates
 * dynamically-prefixed items (connector_2_*, connector_3_*, etc.).
 *
 * Source (connectors[0]) and destination (connectors[1]) use existing items.
 * This only creates items for connectors[2+].
 */
function expandConnectorTemplate(spec: Spec, answers: Answers): void {
  // Parse additional_systems — should be a JSON array of system names
  const raw = answers.additional_systems;
  if (!raw) return;

  let additionalSystems: string[];
  if (Array.isArray(raw)) {
    additionalSystems = raw.map(String);
  } else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        additionalSystems = parsed.map(String);
      } else {
        return; // Not an array
      }
    } catch {
      // Could be a comma-separated string
      additionalSystems = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } else {
    return;
  }

  if (additionalSystems.length === 0) return;

  // Load the connector template
  const templatePath = join(
    getPluginRoot(),
    "scripts",
    "questions",
    "integration",
    "connector-template.yaml",
  );
  if (!existsSync(templatePath)) return;

  let templateContent: string;
  try {
    templateContent = readFileSync(templatePath, "utf-8");
  } catch {
    return;
  }

  // For each additional system, expand the template with the appropriate prefix
  for (let i = 0; i < additionalSystems.length; i++) {
    const systemName = additionalSystems[i];
    const connectorIndex = i + 2; // 0=source, 1=destination, 2+=additional
    const prefix = `connector_${connectorIndex}`;

    // Pre-populate the system answer from the connectors array
    if (!answers[`${prefix}_system`]) {
      answers[`${prefix}_system`] = systemName;
    }

    // Substitute template variables
    let expanded = templateContent;
    expanded = expanded.replace(/\{PREFIX\}/g, prefix);
    expanded = expanded.replace(/\{SYSTEM\}/g, systemName);
    expanded = expanded.replace(/\{INDEX\}/g, String(connectorIndex));

    // Parse the expanded YAML into items
    // Simple YAML parser: extract top-level keys and their properties
    const items = parseSimpleYaml(expanded);

    // Add each item to the spec
    for (const [id, item] of Object.entries(items)) {
      if (!spec.items[id]) {
        spec.items[id] = item;
      }
    }

    // Find or create a group for this connector
    const groupId = `connector_${connectorIndex}`;
    const existingGroup = spec.groups.find((g) => g.id === groupId);
    if (!existingGroup) {
      const itemIds = Object.keys(items);
      spec.groups.push({
        id: groupId,
        label: `${systemName} (Connector ${connectorIndex + 1})`,
        items: itemIds,
      });
    }
  }
}

/**
 * Simple YAML-like parser for the connector template.
 * Extracts top-level quoted keys and their properties.
 * This is not a full YAML parser — it handles the specific format of connector-template.yaml.
 */
function parseSimpleYaml(content: string): Record<string, SpecItem> {
  const items: Record<string, SpecItem> = {};
  const lines = content.split("\n");
  let currentKey = "";
  let currentItem: Record<string, unknown> = {};

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith("#") || line.trim() === "") continue;

    // Top-level key (starts with " at column 0)
    const topLevelMatch = line.match(/^"([^"]+)":\s*$/);
    if (topLevelMatch) {
      if (currentKey) {
        items[currentKey] = finalizeItem(currentItem);
      }
      currentKey = topLevelMatch[1];
      currentItem = {};
      continue;
    }

    // Property line (indented)
    if (currentKey && line.startsWith("  ")) {
      const propMatch = line.match(/^\s{2}(\w+):\s*(.*)$/);
      if (propMatch) {
        const [, prop, value] = propMatch;
        if (value.startsWith(">") || value.startsWith("|")) {
          // Multi-line string — collect until next property
          currentItem[prop] = ""; // Will be filled by subsequent lines
          currentItem[`_multiline_${prop}`] = true;
        } else if (value.startsWith("[") && value.endsWith("]")) {
          // Inline array
          try {
            currentItem[prop] = JSON.parse(value);
          } catch {
            currentItem[prop] = value
              .slice(1, -1)
              .split(",")
              .map((s) => s.trim().replace(/^["']|["']$/g, ""));
          }
        } else if (value.startsWith("{")) {
          // Inline object
          try {
            currentItem[prop] = JSON.parse(value);
          } catch {
            currentItem[prop] = value;
          }
        } else if (value === "true" || value === "false") {
          currentItem[prop] = value === "true";
        } else {
          // String value — strip quotes
          currentItem[prop] = value.replace(/^["']|["']$/g, "");
        }
      } else {
        // Continuation of multi-line or nested content — append to last property
        const trimmed = line.trim();
        for (const key of Object.keys(currentItem)) {
          if (currentItem[`_multiline_${key}`]) {
            currentItem[key] = `${currentItem[key] as string} ${trimmed}`.trim();
          }
        }
      }
    }
  }

  // Don't forget the last item
  if (currentKey) {
    items[currentKey] = finalizeItem(currentItem);
  }

  return items;
}

function finalizeItem(raw: Record<string, unknown>): SpecItem {
  // Remove multiline markers
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!k.startsWith("_multiline_")) {
      clean[k] = v;
    }
  }

  return {
    question: clean.question as string | undefined,
    type: clean.type as string | undefined,
    inference: clean.inference as "allowed" | "prohibited" | undefined,
    scope: (clean.scope as "integration" | "flow") ?? "integration",
    choices: clean.choices as string[] | undefined,
    condition: clean.condition as Record<string, unknown> | undefined,
    depends_on: clean.depends_on as string[] | undefined,
    skippable: clean.skippable as boolean | undefined,
    skip_if_empty: clean.skip_if_empty as boolean | undefined,
    default: clean.default,
    agent_context: clean.agent_context as string | undefined,
    implications: clean.implications as Record<string, string> | undefined,
    cookbook_section: clean.cookbook_section as string | undefined,
    maps_to: clean.maps_to as string | undefined,
    note: clean.note as string | undefined,
    on_answer: clean.on_answer as Record<string, string> | undefined,
  };
}

// ---------------------------------------------------------------------------
// Build task manifest
// ---------------------------------------------------------------------------

function buildManifest(
  spec: Spec,
  answers: Answers,
  options: {
    mode: "build" | "modify";
    extractedState?: Answers;
    modificationScopes?: string[];
    sessionType?: string;
  },
): TaskManifest {
  const tasks: TaskEntry[] = [];

  const isMultiFlow =
    answers.flows !== undefined &&
    typeof answers.flows === "object" &&
    !Array.isArray(answers.flows) &&
    Object.keys(answers.flows as Record<string, unknown>).length > 0;

  const flowIds = isMultiFlow ? Object.keys(answers.flows as Record<string, unknown>) : [];

  // In modify mode, filter to relevant groups based on modification scope
  const relevantGroups =
    options.mode === "modify" && options.modificationScopes
      ? getRelevantGroups(options.modificationScopes, options.sessionType)
      : null;

  for (const [id, item] of Object.entries(spec.items)) {
    const scope = (item.scope as "integration" | "flow") ?? "integration";
    const group = findGroup(spec, id);

    // In modify mode, skip items outside the relevant groups
    if (relevantGroups && !relevantGroups.has(group)) continue;

    // Skip skip_if_empty items with empty dependencies
    if (item.skip_if_empty) {
      const deps = item.depends_on ?? [];
      const shouldSkip = deps.some((dep) => isEmpty(answers[dep]));
      if (shouldSkip) continue;
    }

    if (scope === "flow" && isMultiFlow) {
      // Create per-flow tasks
      for (const flowId of flowIds) {
        const flowAnswers =
          (answers.flows as Record<string, Record<string, unknown>>)[flowId] ?? {};
        const merged: Answers = { ...answers, ...flowAnswers };
        delete merged.flows;

        const value = merged[id];
        const status = getItemStatus(item, merged, value);
        const blockingKeys = getBlockingKeys(item);

        // In modify mode, skip items that are already answered (from extracted state)
        // unless the status would be "pending" (user wants to change it)
        if (options.mode === "modify" && options.extractedState && status === "answered") {
          continue; // Already known — don't create a task
        }

        const flowData = (answers.flows as Record<string, Record<string, unknown>>)[flowId];
        const flowDisplayName =
          (flowData?.flow_name as string) ??
          flowId
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
        const groupLabel = findGroupLabel(spec, group);

        tasks.push({
          spec_key: id,
          subject: buildSubject(item, id, groupLabel, flowDisplayName, options.sessionType),
          description: buildDescription(item, id, options.extractedState),
          group,
          scope,
          status,
          blocked_by_keys: blockingKeys,
          flow_id: flowId,
          inference: (item.inference as string) ?? "allowed",
          current_value: value ?? null,
          is_required: isRequired(spec, id, merged),
        });
      }
    } else {
      // Integration-scoped or single-flow
      const value = answers[id];
      const status = getItemStatus(item, answers, value);
      const blockingKeys = getBlockingKeys(item);

      // In modify mode, skip already-answered items
      if (options.mode === "modify" && options.extractedState && status === "answered") {
        continue;
      }

      const groupLabel = findGroupLabel(spec, group);

      tasks.push({
        spec_key: id,
        subject: buildSubject(item, id, groupLabel, undefined, options.sessionType),
        description: buildDescription(item, id, options.extractedState),
        group,
        scope,
        status,
        blocked_by_keys: blockingKeys,
        flow_id: null,
        inference: (item.inference as string) ?? "allowed",
        current_value: value ?? null,
        is_required: isRequired(spec, id, answers),
      });
    }
  }

  // Compute summary
  const answered = tasks.filter((t) => t.status === "answered").length;
  const pending = tasks.filter((t) => t.status === "pending").length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  const notApplicable = tasks.filter((t) => t.status === "not_applicable").length;

  // Ready when all required pending items are zero
  const requiredPending = tasks.filter(
    (t) => t.is_required && (t.status === "pending" || t.status === "blocked"),
  );
  const readyForNextPhase = requiredPending.length === 0;

  return {
    tasks,
    summary: {
      total_applicable: pending + answered + blocked,
      answered,
      pending,
      blocked,
      not_applicable: notApplicable,
    },
    ready_for_next_phase: readyForNextPhase,
  };
}

// ---------------------------------------------------------------------------
// Task description builder
// ---------------------------------------------------------------------------

function buildDescription(item: SpecItem, specKey: string, extractedState?: Answers): string {
  const parts: string[] = [];

  // Spec key for task metadata linkage
  parts.push(`spec_key: ${specKey}`);

  // Current value from extracted state (modify mode)
  if (extractedState && !isEmpty(extractedState[specKey])) {
    parts.push(`Current value: ${String(extractedState[specKey])}`);
  }

  // Agent context (narration backbone)
  if (item.agent_context) {
    parts.push(String(item.agent_context).trim());
  }

  // Cookbook pointer
  if (item.cookbook_section) {
    parts.push(`Cookbook: ${item.cookbook_section}`);
  }

  // Maps to (code target)
  if (item.maps_to) {
    parts.push(`Maps to: ${item.maps_to}`);
  }

  // Choices
  if (item.choices && item.choices.length > 0) {
    parts.push(`Options: ${item.choices.join(", ")}`);
  }

  // Default
  if (item.default !== undefined) {
    parts.push(`Default: ${String(item.default)}`);
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inferPhase(answered: number, total: number, ready: boolean): string {
  if (answered === 0) return "greeting";
  if (!ready && answered < total * 0.5) return "early-requirements";
  if (!ready) return "late-requirements";
  return "confirm-scaffold";
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(): number {
  const args = process.argv.slice(2);
  let specFile = "";
  let answersFile = "";
  let mode: "build" | "modify" = "build";
  let extractedStateFile = "";
  let scopeFilter: string[] = [];
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
    } else if (args[i] === "--mode" && i + 1 < args.length) {
      mode = args[i + 1] as "build" | "modify";
      i++;
    } else if (args[i] === "--extracted-state" && i + 1 < args.length) {
      extractedStateFile = args[i + 1];
      i++;
    } else if (args[i] === "--scope" && i + 1 < args.length) {
      scopeFilter = args[i + 1].split(",").map((s) => s.trim());
      i++;
    } else if (!args[i].startsWith("-")) {
      positional.push(args[i]);
    }
  }

  if (!sessionName && positional.length < 2) {
    console.error(
      "Usage: npx tsx sync-task-list.ts <spec.yaml> <answers.json> [--mode build|modify] [--extracted-state <file>] [--scope <scopes>]\n" +
        "       npx tsx sync-task-list.ts --session <name> [--type component|integration] --actionable [--mode build|modify]",
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

  // Load spec
  let spec: Spec;
  try {
    spec = loadSpec(specFile) as unknown as Spec;
  } catch (e) {
    console.error(`Failed to load spec: ${e}`);
    return 2;
  }

  // Load answers — requirements.json wraps answers in { name, answers: {...} }
  let answers: Answers = {};
  try {
    if (existsSync(answersFile)) {
      const raw = JSON.parse(readFileSync(answersFile, "utf-8")) as Record<string, unknown>;
      // Support both { answers: {...} } wrapper and flat { key: value } formats
      answers = (
        raw.answers && typeof raw.answers === "object" ? (raw.answers as Answers) : raw
      ) as Answers;
    }
  } catch (e) {
    console.error(`Failed to load answers: ${e}`);
    return 2;
  }

  // Load extracted state (modify mode)
  let extractedState: Answers | undefined;
  if (extractedStateFile && existsSync(extractedStateFile)) {
    try {
      const raw = JSON.parse(readFileSync(extractedStateFile, "utf-8")) as Record<string, unknown>;
      extractedState = (raw.state as Answers) ?? raw;
    } catch (e) {
      console.error(`Failed to load extracted state: ${e}`);
      return 2;
    }
  }

  // Expand connector template for additional systems (3+ connectors)
  if (sessionType === "integration") {
    expandConnectorTemplate(spec, answers);
  }

  const manifest = buildManifest(spec, answers, {
    mode,
    extractedState,
    modificationScopes: scopeFilter,
    sessionType,
  });

  // --actionable mode: output only items the agent should act on NOW
  // (pending items to create as tasks, answered items to mark complete)
  const actionable = args.includes("--actionable");

  if (actionable) {
    const toCreate = manifest.tasks.filter((t) => t.status === "pending" && t.is_required);
    const toCreateOptional = manifest.tasks.filter((t) => t.status === "pending" && !t.is_required);
    const toComplete = manifest.tasks.filter((t) => t.status === "answered");

    // Categorize inferable completed items
    const fromDescription: Array<{ key: string; subject: string; value: string }> = [];
    const defaults: Array<{ key: string; subject: string; value: string; rationale: string }> = [];

    for (const task of toComplete) {
      const specItem = spec.items[task.spec_key];
      if (!specItem) continue;
      if (task.inference === "prohibited") continue; // These were explicitly asked

      const defaultVal = (specItem as Record<string, unknown>).default;
      const currentVal = String(task.current_value ?? "");
      const note =
        typeof (specItem as Record<string, unknown>).note === "string"
          ? ((specItem as Record<string, unknown>).note as string).split("\n")[0]
          : "";

      if (defaultVal !== undefined && currentVal === String(defaultVal)) {
        defaults.push({
          key: task.spec_key,
          subject: task.subject,
          value: currentVal,
          rationale: note || "Standard default",
        });
      } else if (currentVal) {
        fromDescription.push({ key: task.spec_key, subject: task.subject, value: currentVal });
      }
    }

    if (fromDescription.length > 0 || defaults.length > 0) {
      console.log(`<present-before-writing>`);
      if (fromDescription.length > 0) {
        console.log(`  <from-description count="${fromDescription.length}">`);
        console.log(
          `    These were inferred from the user's description. Cite the user's words when presenting.`,
        );
        for (const item of fromDescription) {
          console.log(
            `    <inferred key="${escapeXml(item.key)}" value="${escapeXml(item.value)}">${escapeXml(item.subject)}</inferred>`,
          );
        }
        console.log(`  </from-description>`);
      }
      if (defaults.length > 0) {
        console.log(`  <defaults count="${defaults.length}">`);
        console.log(`    These are sensible defaults. Label them as defaults with rationale.`);
        for (const item of defaults) {
          console.log(
            `    <default key="${escapeXml(item.key)}" value="${escapeXml(item.value)}" rationale="${escapeXml(item.rationale)}">${escapeXml(item.subject)}</default>`,
          );
        }
        console.log(`  </defaults>`);
      }
      console.log(`  <gate>`);
      console.log(`    Do NOT call record-choices in the same response as this presentation.`);
      console.log(`    Present these to the user and WAIT for their next message.`);
      console.log(`    WRONG: Present inferences AND call record-choices in the same turn.`);
      console.log(`    RIGHT: Present inferences → user says "looks good" → THEN record-choices.`);
      console.log(`  </gate>`);
      console.log(`</present-before-writing>`);
    }

    // Emit connection setup instruction when connection items are pending (integrations only)
    if (sessionType !== "component") {
      const connectionKeys = [
        "source_connection",
        "destination_connection",
        ...Object.keys(spec.items).filter((k) => /^connector_\d+_connection$/.test(k)),
      ];
      const pendingConnectionItems = toCreate.filter((t) => connectionKeys.includes(t.spec_key));
      if (pendingConnectionItems.length > 0) {
        const systems = pendingConnectionItems.map((t) => {
          // Extract the prefix: source_, destination_, or connector_N_
          let systemKey: string;
          if (t.spec_key.startsWith("source_")) systemKey = "source_system";
          else if (t.spec_key.startsWith("destination_")) systemKey = "destination_system";
          else {
            const match = t.spec_key.match(/^(connector_\d+)_/);
            systemKey = match ? `${match[1]}_system` : t.spec_key;
          }
          const raw = answers[systemKey];
          if (typeof raw === "string") return raw;
          if (raw && typeof raw === "object")
            return (
              ((raw as Record<string, unknown>).source as string) ||
              ((raw as Record<string, unknown>).name as string) ||
              systemKey
            );
          return systemKey;
        });
        console.log(
          `<connection-setup-required systems="${systems.join(",")}">\n` +
            `  Connection management decisions are pending. These CANNOT be inferred or batch-written.\n` +
            `  For EACH system, you MUST:\n` +
            `  1. Run prismatic-tools search-connections <system> to check for existing reusable connections\n` +
            `  2. Present the results to the user and recommend reusable (customer-activated) connections\n` +
            `  3. Ask the user which approach they want — do NOT choose for them\n` +
            `  4. Record the connection ONLY after the user responds\n` +
            `  Do NOT batch these with other answers. Do NOT infer a connection strategy.\n` +
            `</connection-setup-required>`,
        );
      }
    }

    // Emit API research gate for components: api_docs_url must be written alone
    // and trigger research BEFORE downstream answers can be written.
    if (sessionType === "component") {
      const allPending = [...toCreate, ...toCreateOptional];
      const docsUrlPending = allPending.find((t) => t.spec_key === "api_docs_url");
      const docsUrlInferred = toComplete.find((t) => t.spec_key === "api_docs_url");
      const researchDependents = [
        "auth_type",
        "base_url",
        "confirm_resources",
        "resource_actions",
        "webhook_support",
        "webhook_events",
        "webhook_security",
        "pagination_strategy",
      ];

      if (docsUrlPending || docsUrlInferred) {
        // api_docs_url is about to be written — gate everything downstream
        console.log(
          `<api-research-required>\n` +
            `  api_docs_url MUST be written ALONE — do NOT batch it with other answers.\n` +
            `  After writing api_docs_url, IMMEDIATELY spawn the external-api-researcher agent\n` +
            `  with the URL. WAIT for research to complete before writing any of these:\n` +
            `  ${researchDependents.join(", ")}\n` +
            `  Do NOT infer auth_type, resources, or webhook support from training data.\n` +
            `  Use the researcher's findings.\n` +
            `</api-research-required>`,
        );
      }
    }

    // Emit AskUserQuestion directive for ALL pending choice items with ≤4 choices.
    // This gives the agent the exact valid choices for every question, preventing hallucinated options.
    const allPendingItems = [...toCreate, ...toCreateOptional];
    const askItems: Array<{
      spec_key: string;
      subject: string;
      choices: string[];
      implications: Record<string, string>;
      inference: string;
    }> = [];
    const askTextItems: Array<{
      spec_key: string;
      subject: string;
      suggestions: string[];
      inference: string;
    }> = [];

    for (const task of allPendingItems) {
      const specItem = spec.items[task.spec_key];
      if (specItem?.choices && Array.isArray(specItem.choices) && specItem.choices.length <= 4) {
        askItems.push({
          spec_key: task.spec_key,
          subject: task.subject,
          choices: specItem.choices as string[],
          implications: (specItem.implications as Record<string, string>) ?? {},
          inference: task.inference,
        });
      } else if (
        task.inference === "prohibited" &&
        (!specItem?.choices || !Array.isArray(specItem.choices))
      ) {
        askTextItems.push({
          spec_key: task.spec_key,
          subject: task.subject,
          suggestions: (specItem?.suggestions as string[]) ?? [],
          inference: task.inference,
        });
      }
    }

    if (askTextItems.length > 0) {
      console.log(
        `<ask-user-text-inputs>\n` +
          `  The following items accept free-text values.\n` +
          `  Ask the user for EACH ONE individually. Present the question and STOP.\n` +
          `  Present ONE question per message.\n` +
          askTextItems
            .map(
              (item) =>
                `  <ask-text spec_key="${item.spec_key}" subject="${item.subject}"` +
                (item.suggestions.length > 0
                  ? ` suggestions="${item.suggestions.join(", ")}"`
                  : "") +
                ` />`,
            )
            .join("\n") +
          `\n` +
          `</ask-user-text-inputs>`,
      );
    }

    if (askItems.length > 0) {
      console.log(`<ask-user-payloads>`);
      console.log(`  Use AskUserQuestion for each of these. Copy the JSON payload verbatim.`);
      console.log(`  Present ONE per message. Wait for the user's response before the next.`);
      for (const item of askItems) {
        const options = item.choices.map((c) => ({
          label:
            item.implications[c]?.split("\n")[0]?.split("—")[0]?.trim() || c.replace(/_/g, " "),
          description: item.implications[c]?.split("\n")[0]?.trim() || c,
        }));
        const payload = {
          question: item.subject,
          header: item.spec_key.replace(/_/g, " ").slice(0, 12),
          options: options.map((o) => ({
            label: o.label,
            description: o.description,
          })),
          multiSelect: false,
        };
        console.log(`  <payload spec_key="${item.spec_key}" inference="${item.inference}">`);
        console.log(`  ${JSON.stringify(payload, null, 2).split("\n").join("\n  ")}`);
        console.log(`  </payload>`);
      }
      console.log(`</ask-user-payloads>`);
    }

    // Emit parallel batch directive for mutually-independent lookup items
    // Lookups that have all deps satisfied AND don't depend on each other can run in parallel
    const lookupItems: Array<{ spec_key: string; subject: string; script: string }> = [];
    for (const task of allPendingItems) {
      const specItem = spec.items[task.spec_key];
      if (specItem?.type === "lookup" && (specItem as Record<string, unknown>).lookup) {
        const lookup = (specItem as Record<string, unknown>).lookup as Record<string, unknown>;
        if (lookup.script) {
          // Check all deps are satisfied
          const deps = specItem.depends_on ?? [];
          const condKeys = specItem.condition ? Object.keys(specItem.condition) : [];
          const allDeps = [...new Set([...deps, ...condKeys])];
          const allSatisfied = allDeps.every((d) => !isEmpty(answers[d]));
          if (allSatisfied) {
            lookupItems.push({
              spec_key: task.spec_key,
              subject: task.subject,
              script: String(lookup.script),
            });
          }
        }
      }
    }

    if (lookupItems.length > 1) {
      // Verify mutual independence: none of these items depend on each other
      const lookupKeys = new Set(lookupItems.map((l) => l.spec_key));
      const independent = lookupItems.filter((item) => {
        const specItem = spec.items[item.spec_key];
        const deps = [...(specItem?.depends_on ?? [])];
        if (specItem?.condition) deps.push(...Object.keys(specItem.condition));
        return !deps.some((d) => lookupKeys.has(d));
      });

      if (independent.length > 1) {
        console.log(`<parallel-batch>`);
        console.log(
          `  These ${independent.length} lookups are mutually independent — run them ALL as separate Bash commands in ONE response.`,
        );
        console.log(`  Do NOT wait for one to finish before starting the next.`);
        for (const item of independent) {
          console.log(
            `  <action spec_key="${escapeXml(item.spec_key)}" type="lookup" script="${escapeXml(item.script)}">${escapeXml(item.subject)}</action>`,
          );
        }
        console.log(`</parallel-batch>`);
      }
    }

    // Emit task creation instruction
    const totalItems = toCreate.length + toCreateOptional.length + toComplete.length;
    console.log(
      `<task-creation>\n` +
        `  Create tasks for ALL ${totalItems} items — answered AND pending.\n` +
        `  - ${toComplete.length} answered items: TaskCreate then immediately TaskUpdate(completed).\n` +
        `  - ${toCreate.length} required pending: TaskCreate as open.\n` +
        `  - ${toCreateOptional.length} optional pending: TaskCreate as open.\n` +
        `  ALL in one response. The task list is the user's dashboard — they need to see everything.\n` +
        `</task-creation>`,
    );

    // Emit draft-proposal when all lookups are complete and remaining items are choice/text
    // This enables the "review a proposal" metaphor instead of sequential question-answer
    const pendingLookups = allPendingItems.filter((t) => {
      const si = spec.items[t.spec_key];
      return si?.type === "lookup";
    });
    const pendingChoiceOrText = allPendingItems.filter((t) => {
      const si = spec.items[t.spec_key];
      return si?.type === "choice" || si?.type === "multi_choice" || si?.type === "text";
    });

    if (
      pendingLookups.length === 0 &&
      pendingChoiceOrText.length > 0 &&
      manifest.summary.answered > manifest.summary.pending &&
      manifest.summary.answered >= 5
    ) {
      // All lookups done, remaining items are decisions — draft a proposal
      console.log(`<draft-proposal>`);
      console.log(`  All system lookups are complete. Instead of asking questions one by one,`);
      console.log(`  present a complete draft of what you plan to build.`);
      console.log(`  `);
      console.log(`  Include in the proposal:`);
      console.log(`  - All systems and components found`);
      console.log(`  - All existing connections matched`);
      console.log(`  - Pending choices with your recommended defaults`);
      console.log(`  `);
      console.log(`  Format: "Here's what I plan to build. [full picture]. Confirm or correct."`);
      console.log(`  `);
      console.log(`  Pending decisions to include in the proposal:`);
      for (const item of pendingChoiceOrText) {
        const si = spec.items[item.spec_key];
        const defaultVal = si?.default !== undefined ? ` (recommend: ${si.default})` : "";
        const choicesStr = si?.choices ? ` [${(si.choices as string[]).join(", ")}]` : "";
        console.log(
          `  <decision key="${escapeXml(item.spec_key)}" subject="${escapeXml(item.subject)}"${choicesStr}${defaultVal} />`,
        );
      }
      console.log(`  `);
      console.log(`  The user can correct any decision with a simple phrase:`);
      console.log(`  "change error handling to retry" or "make BigQuery org-activated"`);
      console.log(`  Record all confirmed+corrected answers in one batch after the user responds.`);
      console.log(`</draft-proposal>`);
    }

    // Emit spec-reading directive with group→file mapping for pending items
    const pendingGroups = new Set<string>();
    for (const t of [...toCreate, ...toCreateOptional]) {
      pendingGroups.add(t.group);
    }
    if (pendingGroups.size > 0) {
      const componentGroupFileMap: Record<string, string> = {
        overview: "component/overview.yaml",
        connector_config: "component/connector-config.yaml",
        resources: "component/resources.yaml",
        triggers: "component/triggers.yaml",
        data_sources: "component/data-sources.yaml",
        utility_config: "component/utility-config.yaml",
        additional: "component/additional.yaml",
      };
      const integrationGroupFileMap: Record<string, string> = {
        overview: "integration/overview.yaml",
        flow_planning: "integration/flow-planning.yaml",
        flow_config: "integration/flow-config.yaml",
        source: "integration/source-system.yaml",
        destination: "integration/destination-system.yaml",
        error_handling: "integration/error-handling.yaml",
        execution_retry: "integration/execution-retry.yaml",
        queue_config: "integration/queue-config.yaml",
        lifecycle_hooks: "integration/lifecycle-hooks.yaml",
        state_management: "integration/state-management.yaml",
        payload_and_config: "integration/payload-and-behavior.yaml",
        behavior: "integration/payload-and-behavior.yaml",
      };
      const groupFileMap =
        sessionType === "component" ? componentGroupFileMap : integrationGroupFileMap;
      const filesToRead = [
        ...new Set([...pendingGroups].map((g) => groupFileMap[g]).filter(Boolean)),
      ];
      console.log(
        `<read-spec-before-asking>\n` +
          `  Before presenting any choice to the user, read the spec item from its domain file.\n` +
          `  The item's agent_context contains <present-as> XML with the exact options and natural language labels.\n` +
          `  Use the <option value="..."> labels when talking to the user. Write the value= attribute to requirements.\n` +
          `  Domain files for pending items:\n` +
          filesToRead.map((f) => `    ${f}`).join("\n") +
          `\n` +
          `</read-spec-before-asking>`,
      );
    }

    // Emit communication and voice reminders
    console.log(
      `<communication>Do not mention scripts, sync, spec, tasks, requirements, validation, items, or internal process to the user. Rewrite as what the user experiences.</communication>`,
    );
    const phase = inferPhase(
      manifest.summary.answered,
      manifest.summary.total_applicable,
      manifest.ready_for_next_phase,
    );
    const voiceExemplars: Record<string, string> = {
      greeting: [
        `<voice phase="greeting">`,
        `Speak like:`,
        `  "Hey! I'm Orby. I build Prismatic integrations through conversation — you describe what you need, I handle the wiring."`,
        `  "Let's figure out what you're connecting and how data should flow."`,
        `Never:`,
        `  "I'd be happy to help you today!" or "Welcome! How can I assist you?"`,
        `</voice>`,
      ].join("\n"),
      "early-requirements": [
        `<voice phase="requirements">`,
        `Speak like:`,
        `  "That's a solid choice — retry with backoff is basically insurance for transient failures."`,
        `  "Checking if Prismatic has a component for that..."`,
        `Never:`,
        `  "Great question!" or "I'd be happy to explain that!"`,
        `  "Let me run the sync script to check what's next."`,
        `</voice>`,
      ].join("\n"),
      "late-requirements": [
        `<voice phase="late-requirements">`,
        `Speak like:`,
        `  "Almost there — just need to sort out how connections are managed."`,
        `  "That covers error handling. A couple more things and we can start building."`,
        `Never:`,
        `  "We're making great progress!" or "Excellent choice!"`,
        `</voice>`,
      ].join("\n"),
      "confirm-scaffold": [
        `<voice phase="confirm-scaffold">`,
        `Speak like:`,
        `  "Here's the full picture of what I'm planning to build. Take a look and tell me if anything's off."`,
        `  "Everything checks out. Ready when you are."`,
        `Never:`,
        `  "All requirements have been successfully gathered!"`,
        `</voice>`,
      ].join("\n"),
    };
    console.log(voiceExemplars[phase] || voiceExemplars["early-requirements"]);

    // Emit confirm gate instruction when ready
    if (manifest.ready_for_next_phase) {
      console.log(
        `<confirm-before-scaffold>\n` +
          `  All required answers are collected. Before scaffolding:\n` +
          `  1. Present a summary of ALL decisions to the user (systems, components, connections, flows, error handling, everything).\n` +
          `  2. Ask: "Does this look right? Anything you'd like to add or change before I scaffold the project?"\n` +
          `  3. WAIT for the user to respond before proceeding.\n` +
          `</confirm-before-scaffold>`,
      );
      console.log(
        `<exit-states>\n` +
          `  After deployment, the session must end in one of these states:\n` +
          `  <state id="tested_and_passing">All flows tested successfully. The only "complete" state.</state>\n` +
          `  <state id="deployed_awaiting_config">Deployed but needs configuration. A pause, not an exit.</state>\n` +
          `  <state id="deployed_testing_deferred">User chose to defer testing. Valid exit with acknowledgment.</state>\n` +
          `  The summary MUST include test_outcome identifying which state applies.\n` +
          `</exit-states>`,
      );
    }

    const output = {
      create_required: toCreate.map((t) => ({
        spec_key: t.spec_key,
        subject: t.subject,
        group: t.group,
        inference: t.inference,
        flow_id: t.flow_id,
      })),
      create_optional: toCreateOptional.map((t) => ({
        spec_key: t.spec_key,
        subject: t.subject,
        group: t.group,
        inference: t.inference,
        flow_id: t.flow_id,
      })),
      mark_completed: toComplete.map((t) => ({
        spec_key: t.spec_key,
        subject: t.subject,
        group: t.group,
      })),
      blocked_count: manifest.tasks.filter((t) => t.status === "blocked").length,
      summary: manifest.summary,
      ready_for_next_phase: manifest.ready_for_next_phase,
      ...(toCreateOptional.length > 0
        ? {
            optional_items_instruction: `${toCreateOptional.length} optional items remain. Present each to the user with your recommendation. Do not fill them silently — these are architectural decisions that affect production behavior.`,
          }
        : {}),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(JSON.stringify(manifest, null, 2));
  }
  return 0;
}

process.exit(main());
