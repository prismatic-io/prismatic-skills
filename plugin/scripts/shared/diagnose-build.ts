#!/usr/bin/env npx tsx
/**
 * diagnose-build.ts
 *
 * PURPOSE: Parse build errors and produce structural gap descriptions.
 * Maps errors to missing files, broken imports, and incorrect patterns.
 *
 * USAGE:
 *   npx tsx diagnose-build.ts <project-dir> --type <component|integration> [--error <error-text>]
 *
 * If --error is not provided, attempts to re-run the build and capture the error.
 *
 * EXIT CODES:
 *   0 - Diagnosis complete (output is JSON with findings)
 *   2 - Usage error
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { confineToProjectRoot } from "./project-directory.js";

interface ErrorPattern {
  pattern: RegExp;
  diagnosis: string;
  fix: string;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /[Ii]nvalid trigger configuration/g,
    diagnosis: "Invalid trigger configuration",
    fix: "Run validate-phase.ts --phase deploy to check: (1) endpointType requires routing config (triggerPreprocessFlowConfig or preprocessFlowConfig), (2) retryConfig not allowed on synchronous flows, (3) organization security requires organizationApiKeys, (4) webhookLifecycleHandlers may cause issues — use onInstanceDeploy/onInstanceDelete instead",
  },
  {
    pattern: /Cannot find module ['"]\.\/([\w/.-]+)['"]/g,
    diagnosis: "Missing local import",
    fix: "Create the file `src/{match}` or fix the import path",
  },
  {
    pattern: /Cannot find module ['"](@prismatic-io\/[\w/-]+)['"]/g,
    diagnosis: "Missing Prismatic SDK dependency",
    fix: "Run `npm install {match}` or check package.json",
  },
  {
    pattern: /Cannot find module ['"](\.+\/[\w.-]+Manifest\.json)['"]/g,
    diagnosis: "Missing component manifest",
    fix: "Run `prismatic-tools install-manifest <component-key>` to generate the manifest, or check componentRegistry.ts imports",
  },
  {
    pattern: /Property ['"](\w+)['"] does not exist on type/g,
    diagnosis: "Incorrect type usage",
    fix: "Check the Spectral SDK type definitions for the correct property name",
  },
  {
    pattern: /has no exported member ['"](\w+)['"]/g,
    diagnosis: "Incorrect export reference",
    fix: "Check the source file exports — `{match}` is not exported from the referenced module",
  },
  {
    pattern: /Argument of type .+ is not assignable to parameter of type ['"]ConnectionInput['"]/g,
    diagnosis: "Connection passed incorrectly",
    fix: 'Use `connectionConfigVar()` wrapper, not a raw object. Access via `context.configVars["connectionKey"]`',
  },
  {
    pattern: /Type ['"]string['"] is not assignable to type ['"]ConfigVarResultCollection['"]/g,
    diagnosis: "Config variable accessed incorrectly",
    fix: "Use `configVar()` wrapper function, not a raw string",
  },
  {
    pattern: /TS2307.*Cannot find module/g,
    diagnosis: "Module resolution failure",
    fix: "Check tsconfig.json paths and ensure all dependencies are installed (run `npm install`)",
  },
  {
    pattern: /TS2558/g,
    diagnosis: "Flow called with generic type parameter",
    fix: "Remove the generic type parameter from flow(). Use `flow({...})` without generics — type annotations cause TS2558 mismatches with Spectral's internal types",
  },
  {
    pattern: /Property ['"]components['"] does not exist/g,
    diagnosis: "context.components API does not exist in CNIs",
    fix: "Import the component manifest and call actions through it: `import slack from './manifests/slack'; await slack.actions.postMessage.perform({...})`",
  },
  {
    pattern: /Cannot find module ['"]@prismatic-io\/spectral\/dist\//g,
    diagnosis: "Import from internal spectral path",
    fix: "Import from `@prismatic-io/spectral` (the root package), not from internal `dist/` paths. Internal paths break on SDK version updates",
  },
  {
    pattern: /webpack.*Module not found/g,
    diagnosis: "Webpack cannot resolve a module",
    fix: "Check webpack.config.js entry point and ensure all imports resolve to existing files",
  },
];

interface Finding {
  diagnosis: string;
  match: string;
  fix: string;
}

function diagnoseErrorText(errorText: string, projectDir: string, projectType: string): Finding[] {
  const findings: Finding[] = [];

  for (const ep of ERROR_PATTERNS) {
    for (const match of errorText.matchAll(ep.pattern)) {
      const matchedText = match[1] ?? match[0];
      findings.push({
        diagnosis: ep.diagnosis,
        match: matchedText,
        fix: ep.fix.replace("{match}", matchedText),
      });
    }
  }

  // Check for structural issues regardless of error text
  findings.push(...checkStructuralIssues(projectDir, projectType));

  return findings;
}

function checkStructuralIssues(projectDir: string, projectType: string): Finding[] {
  const issues: Finding[] = [];

  // Check node_modules exists
  try {
    if (!statSync(join(projectDir, "node_modules")).isDirectory()) {
      issues.push({
        diagnosis: "Dependencies not installed",
        match: "node_modules/",
        fix: "Run `npm install` in the project directory",
      });
    }
  } catch {
    issues.push({
      diagnosis: "Dependencies not installed",
      match: "node_modules/",
      fix: "Run `npm install` in the project directory",
    });
  }

  if (projectType === "integration") {
    // Check for plain objects in configPages (missing wrapper functions)
    const configPath = join(projectDir, "src", "configPages.ts");
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, "utf-8");
        if (
          /\{\s*key\s*:/.test(content) &&
          !/configVar\s*\(|connectionConfigVar\s*\(|dataSourceConfigVar\s*\(/.test(content)
        ) {
          issues.push({
            diagnosis: "Config elements missing wrapper functions",
            match: "src/configPages.ts",
            fix: "Wrap all config elements: configVar(), connectionConfigVar(), or dataSourceConfigVar()",
          });
        }
      } catch {
        // ignore read errors
      }
    }

    // Check for instanceState in lifecycle hooks
    const flowsPath = join(projectDir, "src", "flows.ts");
    if (existsSync(flowsPath)) {
      try {
        const content = readFileSync(flowsPath, "utf-8");
        if (
          content.includes("instanceState") &&
          (content.includes("onInstanceDeploy") || content.includes("onInstanceDelete"))
        ) {
          issues.push({
            diagnosis: "instanceState used in lifecycle hook",
            match: "src/flows.ts",
            fix: "Use crossFlowState instead of instanceState in onInstanceDeploy/onInstanceDelete",
          });
        }
      } catch {
        // ignore read errors
      }
    }

    // Check for lifecycle hooks without onTrigger passthrough (single-file and multi-flow)
    const flowFilesToCheck: Array<{ path: string; label: string }> = [];
    if (existsSync(flowsPath)) {
      flowFilesToCheck.push({ path: flowsPath, label: "src/flows.ts" });
    }
    const flowsDir = join(projectDir, "src", "flows");
    if (existsSync(flowsDir)) {
      try {
        for (const f of readdirSync(flowsDir)) {
          if (f.endsWith(".ts") && f !== "index.ts") {
            flowFilesToCheck.push({
              path: join(flowsDir, f),
              label: `src/flows/${f}`,
            });
          }
        }
      } catch {
        // ignore read errors
      }
    }
    for (const { path: fp, label } of flowFilesToCheck) {
      try {
        const content = readFileSync(fp, "utf-8");
        if (
          (content.includes("onInstanceDeploy") || content.includes("onInstanceDelete")) &&
          !content.includes("onTrigger")
        ) {
          issues.push({
            diagnosis: "Lifecycle hooks without onTrigger passthrough",
            match: label,
            fix: "Add `onTrigger: async (_context, payload) => ({ payload })` to the flow. Without it, webhook payloads are not forwarded to onExecution.",
          });
        }
      } catch {
        // ignore read errors
      }
    }

    // Check componentRegistry imports match manifest files
    const registryPath = join(projectDir, "src", "componentRegistry.ts");
    if (existsSync(registryPath)) {
      try {
        const content = readFileSync(registryPath, "utf-8");
        const manifestImports = [...content.matchAll(/from\s+["']\.\/([\w-]+Manifest\.json)["']/g)];
        for (const m of manifestImports) {
          if (!existsSync(join(projectDir, "src", m[1]))) {
            issues.push({
              diagnosis: "Missing manifest file",
              match: `src/${m[1]}`,
              fix: "Generate manifest: `prismatic-tools install-manifest <component-key>` or check import path",
            });
          }
        }
      } catch {
        // ignore read errors
      }
    }
  } else if (projectType === "component") {
    // Check for missing connection in connector components
    const indexPath = join(projectDir, "src", "index.ts");
    if (existsSync(indexPath)) {
      try {
        const content = readFileSync(indexPath, "utf-8");
        if (
          content.includes("connections") &&
          !existsSync(join(projectDir, "src", "connections.ts"))
        ) {
          issues.push({
            diagnosis: "Component references connections but connections.ts is missing",
            match: "src/connections.ts",
            fix: "Create src/connections.ts with a connection() definition",
          });
        }
      } catch {
        // ignore read errors
      }
    }
  }

  return issues;
}

function runBuildAndCapture(
  projectDir: string,
  projectType: string,
): { errorText: string | null; err: string | null } {
  const scriptDir = dirname(dirname(resolve(__filename)));

  const buildScript =
    projectType === "component"
      ? join(scriptDir, "components", "build-component.ts")
      : join(scriptDir, "integrations", "build-integration.ts");

  if (!existsSync(buildScript)) {
    return { errorText: null, err: `Build script not found: ${buildScript}` };
  }

  try {
    const result = spawnSync("npx", ["tsx", buildScript, projectDir], {
      encoding: "utf-8",
      timeout: 120000,
    });

    if (result.status === 0) {
      return { errorText: null, err: null };
    }
    return {
      errorText: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      err: null,
    };
  } catch (e) {
    if (e instanceof Error && e.message.includes("TIMEOUT")) {
      return {
        errorText: "Build timed out after 120 seconds",
        err: null,
      };
    }
    return { errorText: null, err: String(e) };
  }
}

function main(): number {
  const args = process.argv.slice(2);

  let projectDir: string | undefined;
  let projectType: string | undefined;
  let errorText: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--type" && i + 1 < args.length) {
      projectType = args[++i];
    } else if (args[i] === "--error" && i + 1 < args.length) {
      errorText = args[++i];
    } else if (!args[i].startsWith("-")) {
      projectDir = args[i];
    }
  }

  if (!projectDir || !projectType) {
    console.error(
      "Usage: npx tsx diagnose-build.ts <project-dir> --type <component|integration> [--error <error-text>]",
    );
    return 2;
  }

  if (!["component", "integration"].includes(projectType)) {
    console.log(JSON.stringify({ error: `Unknown type: ${projectType}` }));
    return 2;
  }

  try {
    projectDir = confineToProjectRoot(projectDir);
  } catch (e) {
    console.log(JSON.stringify({ error: (e as Error).message }));
    return 2;
  }

  if (!errorText) {
    const buildResult = runBuildAndCapture(projectDir, projectType);
    if (buildResult.err) {
      console.log(JSON.stringify({ error: buildResult.err }));
      return 2;
    }
    if (buildResult.errorText === null) {
      console.log(JSON.stringify({ status: "build_succeeded", findings: [] }));
      return 0;
    }
    errorText = buildResult.errorText;
  }

  const findings = diagnoseErrorText(errorText, projectDir, projectType);

  const output: Record<string, unknown> = {
    status: "diagnosed",
    findings_count: findings.length,
    findings,
  };

  if (findings.length === 0) {
    output.note = "No known patterns matched. Raw error may require manual analysis.";
    output.raw_error_preview = errorText.slice(0, 500);
  }

  console.log(JSON.stringify(output, null, 2));

  // Summary to stderr
  if (findings.length > 0) {
    console.error(`\nFound ${findings.length} structural issue(s):`);
    for (const f of findings) {
      console.error(`  - ${f.diagnosis}: ${f.match}`);
      console.error(`    Fix: ${f.fix}`);
    }
  } else {
    console.error("\nNo known structural issues found. Check raw error output.");
  }

  return 0;
}

process.exit(main());
