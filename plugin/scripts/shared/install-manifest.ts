#!/usr/bin/env npx tsx
/**
 * install-manifest.ts
 *
 * Installs a component manifest into a CNI project. Auto-detects whether
 * the component is public or private and passes the correct flag.
 *
 * USAGE:
 *   prismatic-tools install-manifest <component-key> [--project-dir <dir>]
 *
 * EXIT CODES:
 *   0 - Success
 *   1 - Component not found
 *   2 - Usage error
 *   3 - Manifest installation failed
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { graphql, GraphQLError } from "./graphql.js";
import { isValidComponentKey, resolveLocalBin } from "./local-bin.js";
import { confineToProjectRoot } from "./project-directory.js";

const CHECK_COMPONENT_QUERY = `
query checkComponent($key: String!) {
  components(key: $key) {
    nodes {
      key
      label
      public
    }
  }
}
`;

function findComponent(key: string): { found: boolean; isPublic: boolean; label: string } {
  try {
    const data = graphql(CHECK_COMPONENT_QUERY, { key }) as Record<string, unknown>;
    const nodes = ((data.components as Record<string, unknown>)?.nodes ?? []) as Array<
      Record<string, unknown>
    >;
    for (const node of nodes) {
      if (node.key === key) {
        return {
          found: true,
          isPublic: (node.public as boolean) ?? true,
          label: (node.label as string) ?? key,
        };
      }
    }
  } catch (e) {
    if (e instanceof GraphQLError) {
      console.error(`API error: ${e.message}`);
    }
  }
  return { found: false, isPublic: true, label: key };
}

function main(): number {
  const args = process.argv.slice(2);
  let componentKey = "";
  let projectDir = process.cwd();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--project-dir" && i + 1 < args.length) {
      projectDir = args[i + 1];
      i++;
    } else if (!args[i].startsWith("-")) {
      componentKey = args[i];
    }
  }

  if (!componentKey) {
    console.error("Usage: prismatic-tools install-manifest <component-key> [--project-dir <dir>]");
    return 2;
  }

  if (!isValidComponentKey(componentKey)) {
    console.error(`Invalid component key: ${componentKey}`);
    console.error("Keys contain only letters, digits, hyphens, and underscores.");
    return 2;
  }

  try {
    projectDir = confineToProjectRoot(projectDir);
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }

  // Check if project dir is valid
  if (!existsSync(join(projectDir, "package.json"))) {
    console.error(`Not a valid project directory: ${projectDir}`);
    console.error("Run from inside a CNI project or use --project-dir");
    return 2;
  }

  // Look up component to determine public/private
  console.log(`Looking up component: ${componentKey}`);
  const component = findComponent(componentKey);

  if (!component.found) {
    console.error(`Component "${componentKey}" not found in the Prismatic registry.`);
    console.error("Check the component key and ensure it's published.");
    return 1;
  }

  const isPrivate = !component.isPublic;
  console.log(`Found: ${component.label} (${isPrivate ? "private" : "public"})`);

  // Use the project's lockfile-pinned spectral install.
  const bin = resolveLocalBin(projectDir, "@prismatic-io/spectral", "cni-component-manifest");
  if (!bin) {
    console.error("cni-component-manifest not found in the project's dependencies.");
    console.error("Install @prismatic-io/spectral (>= 10.6.0) in the project, then re-run.");
    return 3;
  }

  const manifestArgs = [...bin.args, componentKey];
  if (isPrivate) {
    manifestArgs.push("--private");
    console.log("Using --private flag (component is not public)");
  }

  console.log(`Installing manifest to: ${join(projectDir, "src", "manifests", componentKey)}/`);

  const result = spawnSync(bin.command, manifestArgs, {
    cwd: projectDir,
    encoding: "utf-8",
    timeout: 120000,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    console.error(`Manifest installation failed (exit ${result.status})`);
    return 3;
  }

  // Verify manifest was created
  const manifestDir = join(projectDir, "src", "manifests", componentKey);
  if (existsSync(manifestDir)) {
    console.log(`Manifest installed at: src/manifests/${componentKey}/`);
  } else {
    console.error("Command succeeded but manifest directory not found");
    return 3;
  }

  return 0;
}

process.exit(main());
