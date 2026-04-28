#!/usr/bin/env npx tsx
/**
 * validate-phase.ts
 *
 * PURPOSE: Structural validation at phase boundaries. Checks whether the project
 * directory contains the expected files and patterns for the completed phase.
 *
 * USAGE:
 *   npx tsx validate-phase.ts <project-dir> --phase <phase> --type <component|integration>
 *
 * PHASES:
 *   scaffold  - After scaffolding (project structure exists)
 *   code-gen  - After code generation (source files written)
 *   build     - After build (compiled output exists)
 *   deploy    - Before deploy (trigger configuration validation)
 *
 * EXIT CODES:
 *   0 - All checks pass
 *   1 - Structural gaps found (printed as JSON)
 *   2 - Usage error
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// --- Shape Definitions ---

interface Shape {
  required_files?: string[];
  required_dirs?: string[];
  required_one_of?: string[][];
  optional_files?: string[];
  file_patterns?: Record<string, string[]>;
  description: string;
}

const COMPONENT_SHAPES: Record<string, Shape> = {
  scaffold: {
    required_files: ["package.json", "tsconfig.json", "webpack.config.js", "src/index.ts"],
    required_dirs: ["src", "node_modules"],
    description: "Scaffolded component project",
  },
  "code-gen": {
    required_files: ["package.json", "tsconfig.json", "webpack.config.js", "src/index.ts"],
    required_one_of: [["src/actions.ts", "src/actions/index.ts"]],
    optional_files: ["src/connections.ts", "src/triggers.ts", "src/client.ts", "assets/icon.png"],
    file_patterns: {
      "src/index.ts": ["export\\s+default\\s+component\\(", "component\\(\\s*\\{"],
    },
    description: "Component with generated source code",
  },
  build: {
    required_files: ["package.json", "src/index.ts", "dist/index.js"],
    description: "Built component with compiled output",
  },
};

const INTEGRATION_SHAPES: Record<string, Shape> = {
  scaffold: {
    required_files: ["package.json", "tsconfig.json", "src/index.ts"],
    required_dirs: ["src", "node_modules"],
    description: "Scaffolded CNI project",
  },
  "code-gen": {
    required_files: [
      "package.json",
      "tsconfig.json",
      "src/index.ts",
      "src/configPages.ts",
      "src/componentRegistry.ts",
    ],
    // Accept either src/flows.ts (single-flow) or src/flows/index.ts (multi-flow)
    required_one_of: [["src/flows.ts", "src/flows/index.ts"]],
    required_dirs: ["test-data"],
    optional_files: [
      "src/documentation.md",
      "test-data/trigger-config.json",
      "test-data/sample-payload.json",
    ],
    file_patterns: {
      "src/index.ts": ["integration\\s*\\("],
      "src/configPages.ts": [
        "configVar\\s*\\(|connectionConfigVar\\s*\\(|dataSourceConfigVar\\s*\\(|\\w+Manifest\\.|from\\s+[\"']\\./.*[Mm]anifest",
      ],
      "src/componentRegistry.ts": ["componentManifests?\\s*\\("],
    },
    description: "CNI with generated source code",
  },
  build: {
    required_files: ["package.json", "src/index.ts", "dist/index.js"],
    description: "Built CNI with compiled output",
  },
  deploy: {
    required_files: ["package.json", "src/index.ts", "dist/index.js"],
    description: "Pre-deploy trigger configuration validation",
  },
};

function checkFilePatterns(projectDir: string, filePath: string, patterns: string[]): string[] {
  const fullPath = join(projectDir, filePath);
  if (!existsSync(fullPath)) return [];

  let content: string;
  try {
    content = readFileSync(fullPath, "utf-8");
  } catch {
    return [`${filePath}: unable to read file`];
  }

  const missing: string[] = [];
  for (const pattern of patterns) {
    if (!new RegExp(pattern).test(content)) {
      missing.push(`${filePath}: missing expected pattern \`${pattern}\``);
    }
  }
  return missing;
}

/**
 * For multi-flow integrations, check that at least one .ts file in src/flows/
 * contains the expected patterns (onTrigger|onExecution).
 */
function checkFlowsDirectoryPatterns(projectDir: string, patterns: string[]): string[] {
  const flowsDir = join(projectDir, "src/flows");
  if (!existsSync(flowsDir)) return [];

  let files: string[];
  try {
    files = readdirSync(flowsDir).filter((f) => f.endsWith(".ts") && f !== "index.ts");
  } catch {
    return ["src/flows/: unable to read directory"];
  }

  if (files.length === 0) {
    return ["src/flows/: no flow files found (expected at least one .ts file besides index.ts)"];
  }

  // Check that at least one flow file matches each pattern
  const missing: string[] = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern);
    const found = files.some((f) => {
      try {
        const content = readFileSync(join(flowsDir, f), "utf-8");
        return regex.test(content);
      } catch {
        return false;
      }
    });
    if (!found) {
      missing.push(`src/flows/*.ts: no flow file contains expected pattern \`${pattern}\``);
    }
  }
  return missing;
}

/**
 * Pre-deploy trigger configuration validation.
 * Checks source files for known patterns that cause "Invalid trigger configuration"
 * errors during `prism integrations:import`.
 */
function checkTriggerConfiguration(projectDir: string): string[] {
  const issues: string[] = [];

  // Read index.ts for integration-level config
  const indexPath = join(projectDir, "src", "index.ts");
  let indexContent = "";
  try {
    indexContent = readFileSync(indexPath, "utf-8");
  } catch {
    return ["src/index.ts: unable to read for trigger validation"];
  }

  // Detect endpointType
  const endpointMatch = indexContent.match(/endpointType\s*:\s*["'](\w+)["']/);
  const endpointType = endpointMatch ? endpointMatch[1] : "flow_specific";

  // If non-default endpointType, check for routing config
  if (endpointType === "instance_specific" || endpointType === "shared_instance") {
    const hasTriggerPreprocess = /triggerPreprocessFlowConfig\s*:/.test(indexContent);

    // Check if any flow has preprocessFlowConfig
    let hasPreprocessFlow = false;
    const flowFiles = collectFlowFiles(projectDir);
    for (const fp of flowFiles) {
      try {
        const content = readFileSync(fp, "utf-8");
        if (/preprocessFlowConfig\s*:/.test(content)) {
          hasPreprocessFlow = true;
          break;
        }
      } catch {
        // skip
      }
    }

    if (!hasTriggerPreprocess && !hasPreprocessFlow) {
      issues.push(
        `endpointType "${endpointType}" requires routing config. ` +
          `Add triggerPreprocessFlowConfig to integration() in index.ts, ` +
          `OR add preprocessFlowConfig to exactly one flow. ` +
          `Without routing, deploy fails with "Invalid trigger configuration".`,
      );
    }

    if (hasTriggerPreprocess && hasPreprocessFlow) {
      issues.push(
        `Cannot have BOTH triggerPreprocessFlowConfig (on integration) AND ` +
          `preprocessFlowConfig (on a flow). Use one or the other.`,
      );
    }

    if (hasTriggerPreprocess) {
      if (!/flowNameField\s*:/.test(indexContent)) {
        issues.push(
          `triggerPreprocessFlowConfig is missing flowNameField. ` +
            `This is required to route requests to the correct flow.`,
        );
      }
      if (endpointType === "shared_instance" && !/externalCustomerIdField\s*:/.test(indexContent)) {
        issues.push(
          `shared_instance endpointType requires externalCustomerIdField in ` +
            `triggerPreprocessFlowConfig. Without it, the platform can't identify ` +
            `which customer instance should handle the request.`,
        );
      }
    }
  }

  // Check each flow file for trigger issues
  const flowFiles = collectFlowFiles(projectDir);
  for (const fp of flowFiles) {
    const relPath = fp.replace(`${projectDir}/`, "");
    let content: string;
    try {
      content = readFileSync(fp, "utf-8");
    } catch {
      continue;
    }

    // Check: retryConfig on synchronous flow
    if (/isSynchronous\s*:\s*true/.test(content) && /retryConfig\s*:/.test(content)) {
      issues.push(
        `${relPath}: retryConfig on synchronous flow. ` +
          `Platform REJECTS retryConfig on synchronous flows. ` +
          `Remove retryConfig or set isSynchronous: false.`,
      );
    }

    // Check: schedule on a flow with onTrigger (likely conflict)
    if (
      /schedule\s*:\s*\{/.test(content) &&
      /onTrigger\s*:\s*async/.test(content) &&
      !/triggerType\s*:\s*["']polling["']/.test(content)
    ) {
      issues.push(
        `${relPath}: has both schedule and onTrigger without triggerType: "polling". ` +
          `Scheduled flows should not define onTrigger unless polling.`,
      );
    }

    // Check: organization security without API keys
    if (
      /endpointSecurityType\s*:\s*["']organization["']/.test(content) &&
      !/organizationApiKeys\s*:\s*\[/.test(content)
    ) {
      issues.push(
        `${relPath}: endpointSecurityType "organization" without organizationApiKeys. ` +
          `Platform REJECTS flows with organization security and empty API keys.`,
      );
    }

    // Check: webhookLifecycleHandlers (warn — use onInstanceDeploy instead)
    if (/webhookLifecycleHandlers\s*:/.test(content)) {
      issues.push(
        `${relPath}: uses webhookLifecycleHandlers. ` +
          `Prefer onInstanceDeploy/onInstanceDelete — webhookLifecycleHandlers ` +
          `has been reported to cause "Invalid trigger configuration" on some platform versions. ` +
          `See flows.ts.template for the correct pattern.`,
      );
    }
  }

  return issues;
}

/** Collect all flow .ts files (single-file or multi-flow directory) */
function collectFlowFiles(projectDir: string): string[] {
  const singleFlow = join(projectDir, "src", "flows.ts");
  if (existsSync(singleFlow)) return [singleFlow];

  const flowsDir = join(projectDir, "src", "flows");
  if (!existsSync(flowsDir)) return [];

  try {
    return readdirSync(flowsDir)
      .filter((f) => f.endsWith(".ts") && f !== "index.ts")
      .map((f) => join(flowsDir, f));
  } catch {
    return [];
  }
}

interface Guidance {
  severity: "error" | "warning";
  issue: string;
  fix: string;
  reference?: string;
}

interface ValidationResult {
  complete: boolean;
  description: string;
  present: string[];
  missing: string[];
  missing_patterns: string[];
  optional_missing: string[];
  guidance: Guidance[];
  completeness?: number;
}

/**
 * Semantic checks that go beyond structural validation.
 * Returns guidance mini-prompts that help the agent fix issues.
 */
function semanticChecks(projectDir: string, phase: string, projectType: string): Guidance[] {
  const guidance: Guidance[] = [];

  if (projectType !== "integration" || phase !== "code-gen") return guidance;

  // Check configPages for raw objects (missing wrapper functions)
  const configPath = join(projectDir, "src", "configPages.ts");
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8");
      if (/\{\s*key\s*:\s*["']/.test(content) && !/configVar\s*\(/.test(content)) {
        guidance.push({
          severity: "error",
          issue: "configPages.ts contains raw objects instead of wrapper functions",
          fix: "Replace plain `{ key: ... }` objects with `configVar()`, `connectionConfigVar()`, or `dataSourceConfigVar()` wrappers. See the configPages.ts.template for correct patterns.",
          reference: "code-anti-patterns.md#raw-config-objects",
        });
      }

      // Check for process.env in configPages (secrets should be in connections, not env vars)
      if (/process\.env\./.test(content)) {
        guidance.push({
          severity: "error",
          issue:
            "configPages.ts references process.env — secrets should not be in environment variables",
          fix: "Use reusable connections (customerActivatedConnection or organizationActivatedConnection) for credentials. Do not embed secrets via process.env. Connection credentials should be managed in Prismatic's connection system, not in build-time environment variables.",
          reference: "cni-examples/integration-agnostic-connections.md",
        });
      }
    } catch {}
  }

  // Check flows for instanceState in lifecycle hooks
  const flowFiles = collectFlowFiles(projectDir);
  for (const fp of flowFiles) {
    const relPath = fp.replace(`${projectDir}/`, "");
    try {
      const content = readFileSync(fp, "utf-8");

      if (
        content.includes("instanceState") &&
        (content.includes("onInstanceDeploy") || content.includes("onInstanceDelete"))
      ) {
        guidance.push({
          severity: "error",
          issue: `${relPath}: instanceState used in lifecycle hook`,
          fix: "Replace `context.instanceState` with `context.crossFlowState` in onInstanceDeploy/onInstanceDelete. instanceState is not available during lifecycle callbacks.",
          reference: "code-anti-patterns.md#instanceState-in-lifecycle",
        });
      }

      // Check for lifecycle hooks without onTrigger passthrough
      if (
        (content.includes("onInstanceDeploy") || content.includes("onInstanceDelete")) &&
        !content.includes("onTrigger")
      ) {
        guidance.push({
          severity: "error",
          issue: `${relPath}: lifecycle hooks without onTrigger passthrough`,
          fix: "Add `onTrigger: async (_context, payload) => ({ payload })` to the flow. Without it, webhook payloads are not forwarded to onExecution.",
          reference: "code-anti-patterns.md#missing-onTrigger-passthrough",
        });
      }

      // Check for typed flow generics
      if (/flow\s*</.test(content)) {
        guidance.push({
          severity: "error",
          issue: `${relPath}: flow() called with generic type parameters`,
          fix: "Remove the generic type parameter from flow(). Use `flow({...})` without generics — type annotations on callbacks cause TS2345 mismatches with Spectral's internal types.",
          reference: "code-anti-patterns.md#typed-flow-generics",
        });
      }

      // Check for passthrough onTrigger when component triggers might exist
      if (
        /onTrigger\s*:\s*async\s*\(_?context,?\s*payload\)\s*=>\s*\(\s*\{\s*payload\s*\}\s*\)/.test(
          content,
        )
      ) {
        // Check if any manifest has a triggers/ directory
        const manifestsDir = join(projectDir, "src", "manifests");
        if (existsSync(manifestsDir)) {
          try {
            const components = readdirSync(manifestsDir);
            const triggersExist = components.some((c) =>
              existsSync(join(manifestsDir, c, "triggers")),
            );
            if (triggersExist) {
              guidance.push({
                severity: "warning",
                issue: `${relPath}: passthrough onTrigger but component triggers exist in manifests`,
                fix: "Check src/manifests/*/triggers/ for built-in triggers that handle HMAC validation and webhook lifecycle. Import and use them instead of a passthrough: `import { triggerName } from './manifests/<component>/triggers/<key>'`",
                reference: "code-generation-guide.md#trigger-decision-tree",
              });
            }
          } catch {}
        }
      }

      // Check for webhookLifecycleHandlers
      if (/webhookLifecycleHandlers\s*:/.test(content)) {
        guidance.push({
          severity: "error",
          issue: `${relPath}: uses webhookLifecycleHandlers (unstable API)`,
          fix: "Replace with onInstanceDeploy/onInstanceDelete callbacks. webhookLifecycleHandlers has been reported to cause 'Invalid trigger configuration' on some platform versions.",
          reference: "code-anti-patterns.md#webhook-lifecycle-handlers",
        });
      }
    } catch {}
  }

  // Check for internal spectral imports
  const srcDir = join(projectDir, "src");
  if (existsSync(srcDir)) {
    try {
      const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
      for (const f of files) {
        try {
          const content = readFileSync(join(srcDir, f), "utf-8");
          if (/@prismatic-io\/spectral\/dist/.test(content)) {
            guidance.push({
              severity: "error",
              issue: `src/${f}: imports from internal spectral path`,
              fix: "Import from `@prismatic-io/spectral` (the root package), not from internal `dist/` paths. Internal paths break on SDK version updates.",
              reference: "code-anti-patterns.md#internal-spectral-imports",
            });
          }
          if (/as\s+any/.test(content)) {
            guidance.push({
              severity: "warning",
              issue: `src/${f}: uses 'as any' cast`,
              fix: "Remove 'as any' and fix the underlying type mismatch. For generic-to-specific casts, use `as unknown as MyType`. 'as any' silences real type errors that cause runtime failures.",
              reference: "code-anti-patterns.md#as-any-for-spectral-types",
            });
          }
        } catch {}
      }
    } catch {}
  }

  // Check for context.components usage (wrong API for CNIs)
  for (const fp of flowFiles) {
    const relPath = fp.replace(`${projectDir}/`, "");
    try {
      const content = readFileSync(fp, "utf-8");
      if (/context\.components\./.test(content)) {
        guidance.push({
          severity: "error",
          issue: `${relPath}: uses context.components API (does not exist in CNIs)`,
          fix: "Import the component manifest and call actions through it: `import slack from './manifests/slack'; await slack.actions.postMessage.perform({...})`",
          reference: "code-anti-patterns.md#context-components-api",
        });
      }
    } catch {}
  }

  // Check documentation style (if documentation.md exists)
  const docPath = join(projectDir, "src", "documentation.md");
  if (existsSync(docPath)) {
    try {
      const content = readFileSync(docPath, "utf-8");
      if (/\byou\b|\byour\b|\byou'll\b|\byou're\b/i.test(content)) {
        guidance.push({
          severity: "warning",
          issue: "documentation.md: contains second-person pronouns",
          fix: "Rewrite sentences that use 'you/your' to use impersonal constructions. Example: 'You need to configure...' → 'Configure...'",
          reference: "documentation-style.md",
        });
      }
      if (/\bPrismatic\b/.test(content)) {
        guidance.push({
          severity: "warning",
          issue: "documentation.md: mentions product name 'Prismatic'",
          fix: "Remove references to 'Prismatic'. Use 'the integration', 'the platform', or 'the config page' instead. The docs are shown inside the platform — naming it is redundant.",
          reference: "documentation-style.md",
        });
      }
    } catch {}
  }

  return guidance;
}

function validatePhase(projectDir: string, shape: Shape): ValidationResult {
  const result: ValidationResult = {
    complete: true,
    description: shape.description,
    present: [],
    missing: [],
    missing_patterns: [],
    optional_missing: [],
    guidance: [],
  };

  // Check required files
  for (const f of shape.required_files ?? []) {
    if (existsSync(join(projectDir, f))) {
      result.present.push(f);
    } else {
      result.missing.push(f);
      result.complete = false;
    }
  }

  // Check required dirs
  for (const d of shape.required_dirs ?? []) {
    const full = join(projectDir, d);
    try {
      if (statSync(full).isDirectory()) {
        result.present.push(`${d}/`);
      } else {
        result.missing.push(`${d}/`);
        result.complete = false;
      }
    } catch {
      result.missing.push(`${d}/`);
      result.complete = false;
    }
  }

  // Check required_one_of groups
  for (const group of shape.required_one_of ?? []) {
    let found = false;
    for (const f of group) {
      if (existsSync(join(projectDir, f))) {
        result.present.push(f);
        found = true;
        break;
      }
    }
    if (!found) {
      result.missing.push(`one of: ${group.join(", ")}`);
      result.complete = false;
    }
  }

  // Check optional files
  for (const f of shape.optional_files ?? []) {
    if (existsSync(join(projectDir, f))) {
      result.present.push(f);
    } else {
      result.optional_missing.push(f);
    }
  }

  // Check file patterns
  for (const [filePath, patterns] of Object.entries(shape.file_patterns ?? {})) {
    const issues = checkFilePatterns(projectDir, filePath, patterns);
    if (issues.length > 0) {
      result.missing_patterns.push(...issues);
      result.complete = false;
    }
  }

  // For integrations: if src/flows/index.ts exists (multi-flow), check flow patterns in directory
  if (
    existsSync(join(projectDir, "src/flows/index.ts")) &&
    !existsSync(join(projectDir, "src/flows.ts"))
  ) {
    const flowPatterns = shape.file_patterns?.["src/flows.ts"];
    if (flowPatterns) {
      const issues = checkFlowsDirectoryPatterns(projectDir, flowPatterns);
      if (issues.length > 0) {
        result.missing_patterns.push(...issues);
        result.complete = false;
      }
    }
  }

  return result;
}

function main(): number {
  const args = process.argv.slice(2);

  let projectDir: string | undefined;
  let phase: string | undefined;
  let projectType: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--phase" && i + 1 < args.length) {
      phase = args[++i];
    } else if (args[i] === "--type" && i + 1 < args.length) {
      projectType = args[++i];
    } else if (!args[i].startsWith("-")) {
      projectDir = args[i];
    }
  }

  if (!projectDir || !phase || !projectType) {
    console.error(
      "Usage: npx tsx validate-phase.ts <project-dir> --phase <phase> --type <component|integration>",
    );
    return 2;
  }

  if (!["scaffold", "code-gen", "build", "deploy"].includes(phase)) {
    console.log(JSON.stringify({ error: `Unknown phase: ${phase}` }));
    return 2;
  }

  if (!["component", "integration"].includes(projectType)) {
    console.log(JSON.stringify({ error: `Unknown type: ${projectType}` }));
    return 2;
  }

  projectDir = resolve(projectDir);
  try {
    if (!statSync(projectDir).isDirectory()) {
      console.log(JSON.stringify({ error: `Directory not found: ${projectDir}` }));
      return 2;
    }
  } catch {
    console.log(JSON.stringify({ error: `Directory not found: ${projectDir}` }));
    return 2;
  }

  const shapes = projectType === "component" ? COMPONENT_SHAPES : INTEGRATION_SHAPES;
  const shape = shapes[phase];
  if (!shape) {
    console.log(JSON.stringify({ error: `Unknown phase: ${phase}` }));
    return 2;
  }

  const result = validatePhase(projectDir, shape);

  // For deploy phase, run trigger configuration validation
  if (phase === "deploy" && projectType === "integration") {
    const triggerIssues = checkTriggerConfiguration(projectDir);
    if (triggerIssues.length > 0) {
      result.missing_patterns.push(...triggerIssues);
      result.complete = false;
    }
  }

  // Run semantic checks and append guidance
  const guidanceItems = semanticChecks(projectDir, phase, projectType);
  result.guidance.push(...guidanceItems);
  const errors = guidanceItems.filter((g) => g.severity === "error");
  if (errors.length > 0) {
    result.complete = false;
  }

  // Compute completeness percentage
  let total = (shape.required_files?.length ?? 0) + (shape.required_dirs?.length ?? 0);
  total += shape.required_one_of?.length ?? 0;
  total += Object.keys(shape.file_patterns ?? {}).length;
  const filled = total - result.missing.length - result.missing_patterns.length;
  result.completeness = total > 0 ? Math.round((filled / total) * 1000) / 10 : 100.0;

  // Output
  console.log(JSON.stringify(result, null, 2));

  if (result.complete) {
    console.error(`\n✓ Phase '${phase}' validation passed (${result.completeness}%)`);
    if (result.optional_missing.length > 0) {
      console.error(`  Optional files missing: ${result.optional_missing.join(", ")}`);
    }
    return 0;
  } else {
    console.error(`\n✗ Phase '${phase}' validation failed (${result.completeness}%)`);
    for (const m of result.missing) {
      console.error(`  Missing: ${m}`);
    }
    for (const m of result.missing_patterns) {
      console.error(`  Pattern: ${m}`);
    }
    for (const g of result.guidance) {
      console.error(`  Issue: ${g.issue}`);
      console.error(`    Fix: ${g.fix}`);
      if (g.reference) {
        console.error(`    See: ${g.reference}`);
      }
    }
    return 1;
  }
}

process.exit(main());
