#!/usr/bin/env npx tsx
/**
 * code-plan.ts
 *
 * Generates a code-gen manifest mapping answered spec items to their
 * cookbook sections, reference files, and implications. The agent runs
 * this as step 1 of code generation so the manifest is fresh in context.
 *
 * USAGE:
 *   prismatic-tools code-plan --session <name> --type component|integration
 *
 * OUTPUT: XML manifest on stdout with <code-plan>, <verify-coverage> blocks.
 *
 * EXIT CODES:
 *   0 - Success
 *   2 - Error (bad files, parse issues)
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadSpec } from "./load-spec.js";
import { getSessionDirectory, getPluginRoot } from "./project-directory.js";

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "skipped" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function main(): number {
  const args = process.argv.slice(2);
  let sessionName = "";
  let sessionType: "integration" | "component" = "integration";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--session" && i + 1 < args.length) {
      sessionName = args[i + 1];
      i++;
    } else if (args[i] === "--type" && i + 1 < args.length) {
      sessionType = args[i + 1] as "integration" | "component";
      i++;
    }
  }

  if (!sessionName) {
    console.error(
      "Usage: prismatic-tools code-plan --session <name> --type <component|integration>"
    );
    return 2;
  }

  // Load spec
  const specName = sessionType === "component" ? "component.yaml" : "integration.yaml";
  const specFile = join(getPluginRoot(), "scripts", "questions", specName);
  let spec: ReturnType<typeof loadSpec>;
  try {
    spec = loadSpec(specFile);
  } catch (e) {
    console.error(`Failed to load spec: ${e}`);
    return 2;
  }

  // Load answers
  const sessionDir = getSessionDirectory(
    sessionName,
    sessionType === "component" ? "components" : "integrations"
  );
  const answersFile = join(sessionDir, "requirements.json");
  let answers: Record<string, unknown> = {};
  try {
    if (existsSync(answersFile)) {
      const raw = JSON.parse(readFileSync(answersFile, "utf-8")) as Record<string, unknown>;
      answers = (raw.answers && typeof raw.answers === "object"
        ? (raw.answers as Record<string, unknown>)
        : raw) as Record<string, unknown>;
    }
  } catch (e) {
    console.error(`Failed to load answers: ${e}`);
    return 2;
  }

  // Build manifest
  const covered: string[] = [];
  const uncovered: Array<{ key: string; value: string }> = [];

  console.log("<code-plan>");

  for (const [id, item] of Object.entries(spec.items)) {
    const value = answers[id];
    if (isEmpty(value)) continue;

    const specItem = item as Record<string, unknown>;
    const cookbookSection = specItem.cookbook_section as string | undefined;
    const references = specItem.references as Array<{
      file?: string;
      path?: string;
      phase?: string;
      condition?: string;
    }> | undefined;
    const implications = specItem.implications as Record<string, string> | undefined;
    const valueStr = typeof value === "string" ? value : JSON.stringify(value);

    const hasCookbook = !!cookbookSection;
    const codeGenRefs = (references ?? []).filter(
      (r) => r.phase && r.phase.includes("code-gen")
    );
    const hasRefs = codeGenRefs.length > 0;

    if (hasCookbook || hasRefs) {
      covered.push(id);
      console.log(`  <answer key="${id}" value="${escapeXml(valueStr)}">`);
      if (hasCookbook) {
        console.log(`    <cookbook>${escapeXml(cookbookSection!)}</cookbook>`);
      }
      if (implications && typeof value === "string" && implications[value]) {
        const imp = implications[value].trim().split("\n")[0];
        console.log(`    <implication>${escapeXml(imp)}</implication>`);
      }
      for (const ref of codeGenRefs) {
        const file = ref.file || ref.path || "";
        console.log(`    <reference file="${escapeXml(file)}" />`);
      }
      console.log(`  </answer>`);
    } else {
      uncovered.push({ key: id, value: valueStr });
    }
  }

  // Check for api-research.json
  const researchCandidates = [
    join(sessionDir, "api-research.json"),
    join(sessionDir, "source-api-research.json"),
    join(sessionDir, "destination-api-research.json"),
  ];
  for (const researchFile of researchCandidates) {
    if (existsSync(researchFile)) {
      console.log(`  <api-research file="${researchFile}" />`);
    }
  }

  // Instructions
  const skillName = sessionType === "component"
    ? "component-patterns"
    : "integration-patterns";
  console.log(`  <instructions>`);
  console.log(`    For each <cookbook> heading: Grep for it in answer-to-code-cookbook.md and read the matching section.`);
  console.log(`    For each <reference> file: Read it from the ${skillName} skill references/ directory.`);
  console.log(`    For each <api-research> file: Read it for API-specific endpoint details.`);
  console.log(`    Use <implication> text to understand the architectural decision for each answer.`);
  console.log(`    For uncovered items that affect code structure: escalate to Orby before writing code.`);
  console.log(`  </instructions>`);
  console.log("</code-plan>");

  // Verify coverage
  console.log("");
  console.log("<verify-coverage>");
  console.log(`  <covered count="${covered.length}">${covered.join(", ")}</covered>`);
  if (uncovered.length > 0) {
    console.log(`  <uncovered count="${uncovered.length}">`);
    for (const item of uncovered) {
      console.log(`    <item key="${item.key}" value="${escapeXml(truncate(item.value, 60))}" />`);
    }
    console.log(`  </uncovered>`);
  } else {
    console.log(`  <uncovered count="0" />`);
  }
  console.log(`  <note>Uncovered items may be metadata (names, descriptions) or free-text.</note>`);
  console.log(`  <note>If any uncovered item is a choice that affects code structure, escalate to Orby:</note>`);
  console.log(`  <note>  &lt;orby-request&gt;The code-plan shows [item]=[value] has no cookbook section. What is the correct Prismatic pattern?&lt;/orby-request&gt;</note>`);
  console.log("</verify-coverage>");

  return 0;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen) + "..." : s;
}

process.exit(main());
