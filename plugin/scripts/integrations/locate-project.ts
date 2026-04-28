#!/usr/bin/env npx tsx
/**
 * locate-project.ts
 *
 * Finds an existing CNI project and extracts its architecture.
 * Used by the modify-integration workflow to understand what exists
 * before making changes.
 *
 * USAGE:
 *   npx tsx locate-project.ts <path-or-name>
 *   npx tsx locate-project.ts .                    # search current directory
 *   npx tsx locate-project.ts my-integration       # search by name
 *   npx tsx locate-project.ts /absolute/path       # use exact path
 *
 * OUTPUT (JSON):
 *   {
 *     "found": true,
 *     "project_dir": "/path/to/project",
 *     "name": "my-integration",
 *     "architecture": {
 *       "flow_structure": "single-file" | "directory",
 *       "flows": [{ "name": "...", "stableKey": "...", "file": "..." }],
 *       "components": ["slack", "salesforce"],
 *       "connections": ["Slack Connection"],
 *       "config_pages": ["Slack Connection", "Channel Settings"],
 *       "has_lifecycle_hooks": false
 *     }
 *   }
 *
 * EXIT CODES:
 *   0 - Project found
 *   1 - Project not found or invalid
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

interface FlowInfo {
  name: string;
  stableKey: string;
  file: string;
  hasTrigger: boolean;
  hasExecution: boolean;
}

interface Architecture {
  flow_structure: "single-file" | "directory";
  flows: FlowInfo[];
  components: string[];
  connections: string[];
  config_pages: string[];
  has_lifecycle_hooks: boolean;
}

interface ProjectResult {
  found: boolean;
  project_dir?: string;
  name?: string;
  architecture?: Architecture;
  error?: string;
}

function isValidCNIProject(dir: string): boolean {
  const pkgPath = join(dir, "package.json");
  const indexPath = join(dir, "src/index.ts");

  if (!existsSync(pkgPath) || !existsSync(indexPath)) return false;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return "@prismatic-io/spectral" in deps;
  } catch {
    return false;
  }
}

function extractFlows(dir: string): { structure: "single-file" | "directory"; flows: FlowInfo[] } {
  const singleFile = join(dir, "src/flows.ts");
  const flowsDir = join(dir, "src/flows");

  if (existsSync(join(flowsDir, "index.ts"))) {
    // Multi-flow directory structure
    const flows: FlowInfo[] = [];
    const files = readdirSync(flowsDir).filter((f) => f.endsWith(".ts") && f !== "index.ts");

    for (const file of files) {
      const content = readFileSync(join(flowsDir, file), "utf-8");
      const flow = parseFlowFromContent(content, `src/flows/${file}`);
      if (flow) flows.push(flow);
    }

    return { structure: "directory", flows };
  }

  if (existsSync(singleFile)) {
    const content = readFileSync(singleFile, "utf-8");
    const flow = parseFlowFromContent(content, "src/flows.ts");
    return { structure: "single-file", flows: flow ? [flow] : [] };
  }

  return { structure: "single-file", flows: [] };
}

function parseFlowFromContent(content: string, file: string): FlowInfo | null {
  const nameMatch = content.match(/name:\s*["']([^"']+)["']/);
  const keyMatch = content.match(/stableKey:\s*["']([^"']+)["']/);

  if (!nameMatch) return null;

  return {
    name: nameMatch[1],
    stableKey: keyMatch?.[1] ?? nameMatch[1].toLowerCase().replace(/\s+/g, "-"),
    file,
    hasTrigger: /onTrigger\s*:/.test(content),
    hasExecution: /onExecution\s*:/.test(content),
  };
}

function extractComponents(dir: string): string[] {
  const regPath = join(dir, "src/componentRegistry.ts");
  if (!existsSync(regPath)) return [];

  const content = readFileSync(regPath, "utf-8");
  const components: string[] = [];

  // Match import patterns like: import slackManifest from "./manifests/slack"
  const importRe = /import\s+\w+\s+from\s+["']\.\/manifests\/([^"'/]+)["']/g;
  for (const match of content.matchAll(importRe)) {
    components.push(match[1]);
  }

  return components;
}

function extractConfigPages(dir: string): { pages: string[]; connections: string[] } {
  const cpPath = join(dir, "src/configPages.ts");
  if (!existsSync(cpPath)) return { pages: [], connections: [] };

  const content = readFileSync(cpPath, "utf-8");
  const pages: string[] = [];
  const connections: string[] = [];

  // Match config page keys
  const pageRe = /["']([^"']+)["']\s*:\s*configPage\s*\(/g;
  for (const match of content.matchAll(pageRe)) {
    pages.push(match[1]);
  }

  // Match connection config vars
  const connRe = /connectionConfigVar\s*\(\s*\{[^}]*key\s*:\s*["']([^"']+)["']/g;
  for (const match of content.matchAll(connRe)) {
    connections.push(match[1]);
  }

  // Also check for manifest connection helpers
  const manifestConnRe = /["']([^"']+)["']\s*:\s*\w+(?:Oauth2|ApiKey|Basic)\s*\(/g;
  for (const match of content.matchAll(manifestConnRe)) {
    connections.push(match[1]);
  }

  return { pages, connections };
}

function hasLifecycleHooks(dir: string): boolean {
  const flowsDir = join(dir, "src/flows");
  const singleFile = join(dir, "src/flows.ts");

  const filesToCheck: string[] = [];

  if (existsSync(join(flowsDir, "index.ts"))) {
    const files = readdirSync(flowsDir).filter((f) => f.endsWith(".ts"));
    filesToCheck.push(...files.map((f) => join(flowsDir, f)));
  } else if (existsSync(singleFile)) {
    filesToCheck.push(singleFile);
  }

  for (const file of filesToCheck) {
    const content = readFileSync(file, "utf-8");
    if (/onInstanceDeploy|onInstanceDelete/.test(content)) return true;
  }

  return false;
}

function findProject(pathOrName: string): string | null {
  // Direct path
  const resolved = resolve(pathOrName);
  if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    if (isValidCNIProject(resolved)) return resolved;
  }

  // Search by name in current directory
  const cwd = process.cwd();
  const byName = join(cwd, pathOrName);
  if (existsSync(byName) && statSync(byName).isDirectory()) {
    if (isValidCNIProject(byName)) return byName;
  }

  // Search .prismatic/integrations/
  const prismaticDir = join(cwd, ".prismatic", "integrations", pathOrName);
  if (existsSync(prismaticDir) && statSync(prismaticDir).isDirectory()) {
    if (isValidCNIProject(prismaticDir)) return prismaticDir;
  }

  // If "." was passed, check cwd directly
  if (pathOrName === ".") {
    if (isValidCNIProject(cwd)) return cwd;
  }

  return null;
}

function main(): number {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error("Usage: npx tsx locate-project.ts <path-or-name>");
    return 1;
  }

  const pathOrName = args[0];
  const projectDir = findProject(pathOrName);

  if (!projectDir) {
    const result: ProjectResult = {
      found: false,
      error: `No valid CNI project found for "${pathOrName}". Looked for package.json with @prismatic-io/spectral and src/index.ts.`,
    };
    console.log(JSON.stringify(result, null, 2));
    return 1;
  }

  const { structure, flows } = extractFlows(projectDir);
  const components = extractComponents(projectDir);
  const { pages, connections } = extractConfigPages(projectDir);
  const lifecycle = hasLifecycleHooks(projectDir);

  const result: ProjectResult = {
    found: true,
    project_dir: projectDir,
    name: basename(projectDir),
    architecture: {
      flow_structure: structure,
      flows,
      components,
      connections,
      config_pages: pages,
      has_lifecycle_hooks: lifecycle,
    },
  };

  console.log(JSON.stringify(result, null, 2));
  return 0;
}

process.exit(main());
