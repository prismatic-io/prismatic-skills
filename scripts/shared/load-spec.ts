/**
 * load-spec.ts
 *
 * Loads a YAML requirements spec with $include support.
 * Resolves `$include` directives under `items:` by loading and merging
 * domain-specific YAML files.
 *
 * Master YAML format:
 *   items:
 *     $include:
 *       - integration/flow-planning.yaml
 *       - integration/overview.yaml
 *
 * Each included file contains a flat map of item definitions (no wrapper key).
 * All items are merged into a single `items` map on the resulting spec.
 *
 * Paths are resolved relative to the master YAML file's directory.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseYaml } from "./parse-yaml.js";

export interface LoadedSpec {
  version: number;
  completion: { action: string; description: string };
  required: {
    always: string[];
    when?: Array<{ condition: Record<string, unknown>; items: string[] }>;
  };
  groups: Array<{ id: string; label: string; items?: string[]; info?: string; docs?: string[] }>;
  items: Record<string, Record<string, unknown>>;
}

export function loadSpec(specPath: string): LoadedSpec {
  const raw = readFileSync(specPath, "utf-8");
  const spec = parseYaml(raw) as Record<string, unknown>;

  const items = spec.items as Record<string, unknown> | undefined;

  if (items && typeof items === "object" && "$include" in items) {
    const includes = items.$include as string[];
    const baseDir = dirname(specPath);
    const merged: Record<string, Record<string, unknown>> = {};

    for (const includePath of includes) {
      const fullPath = join(baseDir, includePath);
      const includeRaw = readFileSync(fullPath, "utf-8");
      const includeItems = parseYaml(includeRaw) as Record<string, Record<string, unknown>>;

      for (const [key, value] of Object.entries(includeItems)) {
        if (merged[key]) {
          console.error(`WARNING: Duplicate item key "${key}" in ${includePath} — overwriting`);
        }
        merged[key] = value;
      }
    }

    spec.items = merged;
  }

  return spec as unknown as LoadedSpec;
}
