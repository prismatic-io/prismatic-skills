#!/usr/bin/env npx tsx
/**
 * verify-code.ts
 *
 * PURPOSE: Read requirements.json, map each answered spec item to an expected
 * code pattern, grep generated source files, and report gaps as XML that the
 * agent can act on directly.
 *
 * USAGE:
 *   prismatic-tools verify-code <project-dir> --session <name> [--type component|integration]
 *
 * EXIT CODES:
 *   0 - All verified (or pass with notes)
 *   1 - Gaps found
 *   2 - Usage error
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getSessionDirectory } from "../shared/project-directory.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VerifyMapping {
  answerKey: string;
  value: string;
  /** Which file(s) to check: "flows", "index.ts", "configPages.ts" */
  target: "flows" | "index" | "configPages";
  /** Regex the file content must match (or must NOT match if `absent` is true) */
  pattern: RegExp;
  /** When true, the pattern should be ABSENT (default-omission rule) */
  absent?: boolean;
  /** Human-readable fix instruction */
  fix: string;
  /** When true, this is a soft note (default explicitly set), not a hard gap */
  softNote?: boolean;
}

interface Gap {
  file: string;
  answerLabel: string;
  message: string;
  fix: string;
}

interface Note {
  file: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Verification mappings
// ---------------------------------------------------------------------------

function buildMappings(answers: Record<string, unknown>): VerifyMapping[] {
  const mappings: VerifyMapping[] = [];

  const val = (key: string): string | undefined => {
    const v = answers[key];
    return typeof v === "string" ? v : undefined;
  };

  // --- error_handler_type ---
  const errorHandler = val("error_handler_type");
  if (errorHandler === "fail" || errorHandler === undefined) {
    mappings.push({
      answerKey: "error_handler_type",
      value: errorHandler ?? "(default: fail)",
      target: "flows",
      pattern: /errorConfig\s*:/,
      absent: true,
      fix: "errorConfig should be absent when error_handler_type is fail (the default). Remove the errorConfig property.",
      softNote: errorHandler === undefined,
    });
  } else if (errorHandler === "ignore" || errorHandler === "retry") {
    const typeMap: Record<string, string> = {
      ignore: "ErrorHandlerType.Ignore",
      retry: "ErrorHandlerType.Retry",
    };
    mappings.push({
      answerKey: "error_handler_type",
      value: errorHandler,
      target: "flows",
      pattern: /errorConfig\s*:/,
      fix: `Add to the flow definition:\n\`\`\`typescript\nerrorConfig: { errorHandlerType: ${typeMap[errorHandler]} }\n\`\`\``,
    });
  }

  // --- is_synchronous ---
  const isSync = val("is_synchronous");
  if (isSync === "Yes") {
    mappings.push({
      answerKey: "is_synchronous",
      value: "Yes",
      target: "flows",
      pattern: /isSynchronous\s*:\s*true/,
      fix: "Add `isSynchronous: true` to the flow definition.",
    });
  } else if (isSync === "No" || isSync === undefined) {
    mappings.push({
      answerKey: "is_synchronous",
      value: isSync ?? "(default: No)",
      target: "flows",
      pattern: /isSynchronous\s*:\s*false/,
      absent: true,
      fix: "isSynchronous: false is the default. Remove the explicit `isSynchronous: false` property.",
      softNote: true,
    });
  }

  // --- endpoint_type ---
  const endpointType = val("endpoint_type");
  if (endpointType === "flow_specific" || endpointType === undefined) {
    mappings.push({
      answerKey: "endpoint_type",
      value: endpointType ?? "(default: flow_specific)",
      target: "index",
      pattern: /endpointType\s*:/,
      absent: true,
      fix: "endpointType should be absent when flow_specific (the default). Remove the endpointType property from the integration() call.",
      softNote: endpointType === undefined,
    });
  } else {
    mappings.push({
      answerKey: "endpoint_type",
      value: endpointType,
      target: "index",
      pattern: new RegExp(`endpointType\\s*:\\s*["']${endpointType}["']`),
      fix: `Add \`endpointType: "${endpointType}"\` to the \`integration({...})\` call in index.ts.`,
    });
  }

  // --- endpoint_security ---
  const endpointSecurity = val("endpoint_security");
  if (endpointSecurity === "customer_optional" || endpointSecurity === undefined) {
    mappings.push({
      answerKey: "endpoint_security",
      value: endpointSecurity ?? "(default: customer_optional)",
      target: "flows",
      pattern: /endpointSecurityType\s*:/,
      absent: true,
      fix: "endpointSecurityType should be absent when customer_optional (the default). Remove the property.",
      softNote: endpointSecurity === undefined,
    });
  } else {
    mappings.push({
      answerKey: "endpoint_security",
      value: endpointSecurity,
      target: "flows",
      pattern: /endpointSecurityType\s*:/,
      fix: `Add \`endpointSecurityType: "${endpointSecurity}"\` to the flow definition.`,
    });
  }

  // --- execution_retry_enabled ---
  const retryEnabled = val("execution_retry_enabled");
  if (retryEnabled === "Yes") {
    mappings.push({
      answerKey: "execution_retry_enabled",
      value: "Yes",
      target: "flows",
      pattern: /retryConfig\s*:\s*\{/,
      fix: "Add `retryConfig: { ... }` to the flow definition with maxAttempts, delaySeconds, etc.",
    });
  } else if (retryEnabled === "No" || retryEnabled === undefined) {
    mappings.push({
      answerKey: "execution_retry_enabled",
      value: retryEnabled ?? "(default: No)",
      target: "flows",
      pattern: /retryConfig\s*:/,
      absent: true,
      fix: "retryConfig should be absent when retry is disabled (the default). Remove the retryConfig property.",
      softNote: retryEnabled === undefined,
    });
  }

  // --- trigger_type: scheduled ---
  const triggerType = val("trigger_type");
  if (triggerType === "scheduled") {
    mappings.push({
      answerKey: "trigger_type",
      value: "scheduled",
      target: "flows",
      pattern: /schedule\s*:\s*\{/,
      fix: 'Add `schedule: { value: "..." }` to the flow definition for scheduled execution.',
    });
  }

  // --- trigger_type: polling ---
  if (triggerType === "polling") {
    mappings.push({
      answerKey: "trigger_type",
      value: "polling",
      target: "flows",
      pattern: /schedule\s*:\s*\{/,
      fix: 'Polling flows require a `schedule: { value: "..." }` to set the poll interval.',
    });
  }

  // --- queue_fifo_enabled ---
  const queueFifo = val("queue_fifo_enabled");
  if (queueFifo === "Yes") {
    mappings.push({
      answerKey: "queue_fifo_enabled",
      value: "Yes",
      target: "flows",
      pattern: /usesFifoQueue\s*:\s*true/,
      fix: "Add `usesFifoQueue: true` to the flow's queueConfig.",
    });
  }

  // --- needs_deploy_hooks ---
  const deployHooks = val("needs_deploy_hooks");
  if (deployHooks === "Yes") {
    mappings.push({
      answerKey: "needs_deploy_hooks",
      value: "Yes",
      target: "flows",
      pattern: /onInstanceDeploy\s*:/,
      fix: "Add `onInstanceDeploy` lifecycle hook to the flow definition.",
    });
    mappings.push({
      answerKey: "needs_deploy_hooks",
      value: "Yes (onTrigger passthrough)",
      target: "flows",
      pattern: /onTrigger\s*:/,
      fix: "Flows with lifecycle hooks must include `onTrigger: async (_context, payload) => ({ payload })` passthrough.",
    });
  }

  // --- needs_state_management ---
  const stateManagement = val("needs_state_management");
  if (stateManagement === "Yes") {
    mappings.push({
      answerKey: "needs_state_management",
      value: "Yes",
      target: "flows",
      pattern: /instanceState|crossFlowState|integrationState/,
      fix: "Add state management (instanceState, crossFlowState, or integrationState) to the flow's onExecution handler.",
    });
  }

  return mappings;
}

// ---------------------------------------------------------------------------
// Flow file resolution
// ---------------------------------------------------------------------------

interface FlowFile {
  path: string;
  label: string;
  content: string;
}

function resolveFlowFiles(projectDir: string): FlowFile[] {
  const files: FlowFile[] = [];

  // Single-flow
  const singleFlow = join(projectDir, "src", "flows.ts");
  if (existsSync(singleFlow)) {
    try {
      files.push({
        path: singleFlow,
        label: "src/flows.ts",
        content: readFileSync(singleFlow, "utf-8"),
      });
    } catch {
      // skip
    }
    return files;
  }

  // Multi-flow
  const flowsDir = join(projectDir, "src", "flows");
  if (existsSync(flowsDir)) {
    try {
      for (const f of readdirSync(flowsDir)) {
        if (f.endsWith(".ts") && f !== "index.ts") {
          const fp = join(flowsDir, f);
          try {
            files.push({
              path: fp,
              label: `src/flows/${f}`,
              content: readFileSync(fp, "utf-8"),
            });
          } catch {
            // skip
          }
        }
      }
    } catch {
      // skip
    }
  }

  return files;
}

function readFileContent(projectDir: string, relativePath: string): string | null {
  const fp = join(projectDir, relativePath);
  if (!existsSync(fp)) return null;
  try {
    return readFileSync(fp, "utf-8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Verification engine
// ---------------------------------------------------------------------------

function verify(
  projectDir: string,
  answers: Record<string, unknown>,
): { gaps: Gap[]; notes: Note[]; verified: number } {
  // Handle per-flow answers: merge root + first flow for single-flow compat
  const flatAnswers: Record<string, unknown> = { ...answers };
  if (answers.flows && typeof answers.flows === "object") {
    const flows = answers.flows as Record<string, Record<string, unknown>>;
    const flowIds = Object.keys(flows);
    // For single-flow, merge the flow's answers into root
    if (flowIds.length === 1) {
      Object.assign(flatAnswers, flows[flowIds[0]]);
    }
  }

  const mappings = buildMappings(flatAnswers as Record<string, unknown>);
  const flowFiles = resolveFlowFiles(projectDir);
  const indexContent = readFileContent(projectDir, "src/index.ts");
  const configContent = readFileContent(projectDir, "src/configPages.ts");

  const gaps: Gap[] = [];
  const notes: Note[] = [];
  let verified = 0;

  for (const m of mappings) {
    let targets: Array<{ label: string; content: string }> = [];

    if (m.target === "flows") {
      targets = flowFiles.map((f) => ({ label: f.label, content: f.content }));
    } else if (m.target === "index") {
      if (indexContent !== null) {
        targets = [{ label: "src/index.ts", content: indexContent }];
      }
    } else if (m.target === "configPages") {
      if (configContent !== null) {
        targets = [{ label: "src/configPages.ts", content: configContent }];
      }
    }

    if (targets.length === 0) {
      gaps.push({
        file: m.target === "flows" ? "src/flows.ts" : `src/${m.target}.ts`,
        answerLabel: `${m.answerKey}=${m.value}`,
        message: `Target file not found for verification.`,
        fix: m.fix,
      });
      continue;
    }

    if (m.absent) {
      // Pattern should NOT be present
      const found = targets.find((t) => m.pattern.test(t.content));
      if (found) {
        if (m.softNote) {
          notes.push({
            file: found.label,
            message: `Explicitly sets a default value for \`${m.answerKey}\` — consider removing it per the cookbook's default omission rule.`,
          });
        } else {
          gaps.push({
            file: found.label,
            answerLabel: `${m.answerKey}=${m.value}`,
            message: `Property should be absent (default behavior) but was found.`,
            fix: m.fix,
          });
        }
      }
      verified++;
    } else {
      // Pattern should be present in at least one target
      const found = targets.some((t) => m.pattern.test(t.content));
      if (!found) {
        // Use the first target's label for the gap report
        gaps.push({
          file: targets[0].label,
          answerLabel: `${m.answerKey}=${m.value}`,
          message: `Expected pattern not found.`,
          fix: m.fix,
        });
      } else {
        verified++;
      }
    }
  }

  return { gaps, notes, verified };
}

// ---------------------------------------------------------------------------
// XML output
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatOutput(gaps: Gap[], notes: Note[], verified: number): string {
  if (gaps.length === 0 && notes.length === 0) {
    return `<verify-codegen status="pass">\nAll ${verified} requirements verified in generated code.\n</verify-codegen>`;
  }

  if (gaps.length === 0 && notes.length > 0) {
    const noteLines = notes
      .map((n) => `<note>${escapeXml(n.file)} ${escapeXml(n.message)}</note>`)
      .join("\n");
    return `<verify-codegen status="pass">\nAll requirements verified.\n${noteLines}\n</verify-codegen>`;
  }

  // Group gaps by file
  const byFile = new Map<string, Gap[]>();
  for (const g of gaps) {
    if (!byFile.has(g.file)) byFile.set(g.file, []);
    byFile.get(g.file)?.push(g);
  }

  let xml = `<verify-codegen status="gaps-found">\n`;
  for (const [file, fileGaps] of byFile) {
    xml += `\n<file path="${escapeXml(file)}">\n`;
    for (const g of fileGaps) {
      xml += `<gap answer="${escapeXml(g.answerLabel)}">\n`;
      xml += `${g.message}\n${g.fix}\n`;
      xml += `</gap>\n`;
    }
    xml += `</file>\n`;
  }

  if (notes.length > 0) {
    xml += `\n`;
    for (const n of notes) {
      xml += `<note>${escapeXml(n.file)} ${escapeXml(n.message)}</note>\n`;
    }
  }

  xml += `\nAfter fixing, re-run verify-codegen to confirm.\n</verify-codegen>`;
  return xml;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
  const args = process.argv.slice(2);

  // Parse flags
  let sessionName: string | null = null;
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

  if (positional.length < 1 || (!sessionName && positional.length < 2)) {
    console.error(
      "Usage: prismatic-tools verify-code <project-dir> --session <name> [--type component|integration]",
    );
    return 2;
  }

  const projectDir = resolve(positional[0]);
  const requirementsPath = sessionName
    ? resolve(
        join(
          getSessionDirectory(
            sessionName,
            sessionType === "component" ? "components" : "integrations",
          ),
          "requirements.json",
        ),
      )
    : resolve(positional[1]);

  try {
    if (!existsSync(projectDir)) {
      console.error(`Directory not found: ${projectDir}`);
      return 2;
    }
  } catch {
    console.error(`Directory not found: ${projectDir}`);
    return 2;
  }

  if (!existsSync(requirementsPath)) {
    console.error(`Requirements file not found: ${requirementsPath}`);
    return 2;
  }

  let answers: Record<string, unknown>;
  try {
    answers = JSON.parse(readFileSync(requirementsPath, "utf-8"));
  } catch (e) {
    console.error(`Failed to parse requirements JSON: ${e}`);
    return 2;
  }

  const { gaps, notes, verified } = verify(projectDir, answers);

  // Check for test payloads on webhook flows (soft note, not a hard gap)
  // Only applies to webhook-triggered integrations — scheduled/polling/ai_agent don't send payloads
  if (sessionType !== "component") {
    const flatAnswers: Record<string, unknown> = { ...answers };
    if (answers.flows && typeof answers.flows === "object") {
      const flows = answers.flows as Record<string, Record<string, unknown>>;
      const flowIds = Object.keys(flows);
      if (flowIds.length === 1) {
        Object.assign(flatAnswers, flows[flowIds[0]]);
      }
    }

    const triggerType =
      typeof flatAnswers.trigger_type === "string" ? flatAnswers.trigger_type : "";
    if (triggerType === "webhook") {
      // Check for .spectral/flows/*/payloads/ or test-data/trigger-config.json
      const spectralDir = join(projectDir, ".spectral", "flows");
      const triggerConfig = join(projectDir, "test-data", "trigger-config.json");
      let hasPayloads = false;

      if (existsSync(spectralDir)) {
        try {
          for (const flowDir of readdirSync(spectralDir)) {
            const payloadsDir = join(spectralDir, flowDir, "payloads");
            if (existsSync(payloadsDir)) {
              const files = readdirSync(payloadsDir).filter((f) => f.endsWith(".json"));
              if (files.length > 0) {
                hasPayloads = true;
                break;
              }
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (!hasPayloads && existsSync(triggerConfig)) {
        hasPayloads = true;
      }

      if (!hasPayloads) {
        notes.push({
          file: ".spectral/flows/",
          message:
            'Webhook flow has no test payload. Generate .spectral/flows/<flow-key>/payloads/sample-payload.json with { headers: {}, data: <sample>, contentType: "application/json" }. Without it, test-integration will fire the flow with an empty body.',
        });
      }
    }
  }

  console.log(formatOutput(gaps, notes, verified));

  const resultPath = join(projectDir, "verify-code-result.json");
  writeFileSync(
    resultPath,
    JSON.stringify(
      { verified: gaps.length === 0, gaps: gaps.length, timestamp: Date.now() },
      null,
      2,
    ),
  );

  return gaps.length > 0 ? 1 : 0;
}

process.exit(main());
