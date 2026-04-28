#!/usr/bin/env npx tsx
/**
 * generate-mermaid-diagrams.ts
 *
 * Converts parsed Boomi export JSON into Mermaid flowchart diagrams.
 * Generates one .mmd file per business logic process plus a combined
 * migration-diagrams.md summary file.
 *
 * USAGE:
 *   prismatic-tools generate-mermaid-diagrams <parsed-export.json> <output-dir>
 *
 * INPUT:  Path to JSON file produced by the Boomi export parser.
 * OUTPUT: Directory of .mmd files and a combined migration-diagrams.md.
 *
 * EXIT CODES:
 *   0 - Success
 *   1 - Error (missing args, bad input, etc.)
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────

interface ShapeConnection {
  to_shape: string;
  text?: string;
  identifier?: string;
}

interface ShapeConfig {
  action?: string;
  connection_id?: string;
  process_id?: string;
  map_id?: string;
  action_type?: string;
  name?: string;
  num_branches?: string | number;
}

interface Shape {
  name: string;
  type: string;
  label?: string;
  config?: ShapeConfig;
  connections_to?: ShapeConnection[];
}

interface ProcessEntry {
  name?: string;
  shapes?: Shape[];
}

interface ParsedExport {
  platform?: string;
  components?: Record<string, { name?: string }>;
  processes?: Record<string, ProcessEntry>;
}

// ── Monitoring filter ──────────────────────────────────────────────────

const MONITORING_PREFIXES = ["[OTEL]", "[Monitoring]", "[MONITORING]"];

function isMonitoringProcess(name: string): boolean {
  const trimmed = name.trim();
  return MONITORING_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

// ── Slug helper ────────────────────────────────────────────────────────

function slugify(name: string): string {
  // Remove bracket-number prefixes like [0010]
  const cleaned = name.replace(/^\[\d+\]\s*/, "");
  return cleaned
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Component name resolution ──────────────────────────────────────────

function resolveComponentName(
  componentId: string,
  components: Record<string, { name?: string }>,
): string {
  if (!componentId || !(componentId in components)) return "";
  return components[componentId]?.name ?? "";
}

// ── Label resolution ───────────────────────────────────────────────────

function resolveLabel(shape: Shape, components: Record<string, { name?: string }>): string {
  const shapeType = shape.type;
  const label = shape.label ?? "";
  const config = shape.config ?? {};

  if (shapeType === "start") {
    const action = config.action ?? "noaction";
    if (action === "connectoraction") {
      const connName = resolveComponentName(config.connection_id ?? "", components);
      return connName ? `Start: Listen (${connName})` : "Start: Listen";
    }
    return "Start";
  }

  if (shapeType === "stop") return label || "Stop";

  if (shapeType === "processcall") {
    return resolveComponentName(config.process_id ?? "", components) || label || "Process Call";
  }

  if (shapeType === "connectoraction") {
    const connName = resolveComponentName(config.connection_id ?? "", components);
    const actionType = config.action_type ?? "";
    const parts = [connName, actionType].filter(Boolean);
    return parts.length ? parts.join(" ") : label || "Connector Action";
  }

  if (shapeType === "map") {
    return resolveComponentName(config.map_id ?? "", components) || label || "Map";
  }

  if (shapeType === "decision") return config.name ?? (label || "Decision");

  if (shapeType === "branch") {
    const num = config.num_branches;
    return num ? `Branch (${num}-way)` : label || "Branch";
  }

  if (shapeType === "catcherrors") return label || "Try/Catch";
  if (shapeType === "dataprocess") return label || "Data Process";
  if (shapeType === "documentproperties") return label || "Set Properties";
  if (shapeType === "flowcontrol") return label || "Flow Control";
  if (shapeType === "notify") return label || "Notify";

  if (["doccacheload", "doccacheretrieve", "doccacheremove"].includes(shapeType)) {
    const actionMap: Record<string, string> = {
      doccacheload: "Cache Load",
      doccacheretrieve: "Cache Retrieve",
      doccacheremove: "Cache Remove",
    };
    return label || (actionMap[shapeType] ?? "Doc Cache");
  }

  return label || shapeType;
}

// ── Mermaid node syntax ────────────────────────────────────────────────

function mermaidNode(shapeName: string, label: string, shapeType: string): string {
  // Escape special Mermaid characters in label
  const safe = label.replace(/"/g, "'").replace(/\[/g, "(").replace(/\]/g, ")");

  if (shapeType === "start") return `${shapeName}(["${safe}"])`;
  if (shapeType === "stop") return `${shapeName}((("${safe}")))`;
  if (shapeType === "decision" || shapeType === "branch") return `${shapeName}{"${safe}"}`;
  if (shapeType === "processcall") return `${shapeName}[["${safe}"]]`;
  if (shapeType === "connectoraction") return `${shapeName}[/"${safe}"/]`;
  if (shapeType === "notify") return `${shapeName}>"${safe}"]`;
  // Default: rectangle
  return `${shapeName}["${safe}"]`;
}

// ── Single process diagram ─────────────────────────────────────────────

function generateProcessDiagram(
  process: ProcessEntry,
  components: Record<string, { name?: string }>,
): string {
  const shapes = process.shapes ?? [];
  if (shapes.length === 0) return "";

  const lines: string[] = ["flowchart TD"];

  // Generate nodes
  for (const shape of shapes) {
    const label = resolveLabel(shape, components);
    lines.push(`    ${mermaidNode(shape.name, label, shape.type)}`);
  }

  lines.push("");

  // Generate edges
  for (const shape of shapes) {
    const src = shape.name;
    for (const conn of shape.connections_to ?? []) {
      const dst = conn.to_shape;
      let edgeLabel = conn.text ?? "";
      if (!edgeLabel) {
        const ident = conn.identifier ?? "";
        if (ident && !ident.startsWith("shape")) {
          edgeLabel = ident;
        }
      }
      if (edgeLabel) {
        lines.push(`    ${src} -- ${edgeLabel} --> ${dst}`);
      } else {
        lines.push(`    ${src} --> ${dst}`);
      }
    }
  }

  return lines.join("\n");
}

// ── Generate all diagrams ──────────────────────────────────────────────

function generateDiagrams(parsedData: ParsedExport, outputDir: string): string[] {
  mkdirSync(outputDir, { recursive: true });

  const components = parsedData.components ?? {};
  const processes = parsedData.processes ?? {};

  const businessProcesses: Array<[string, ProcessEntry]> = [];
  const excludedProcesses: string[] = [];

  for (const [procId, proc] of Object.entries(processes)) {
    const procName = proc.name ?? procId;
    if (isMonitoringProcess(procName)) {
      excludedProcesses.push(procName);
    } else {
      businessProcesses.push([procId, proc]);
    }
  }

  const generatedFiles: string[] = [];
  const combinedSections: string[] = [];

  for (const [, proc] of businessProcesses) {
    const procName = proc.name ?? "";
    const slug = slugify(procName);
    const filename = `flow-${slug}.mmd`;
    const filepath = join(outputDir, filename);

    const diagram = generateProcessDiagram(proc, components);
    if (!diagram) continue;

    writeFileSync(filepath, `${diagram}\n`, "utf-8");
    generatedFiles.push(filepath);

    combinedSections.push(`## ${procName}\n\n\`\`\`mermaid\n${diagram}\n\`\`\`\n`);
  }

  // Write combined summary file
  const combinedPath = join(outputDir, "migration-diagrams.md");
  const combinedLines: string[] = [
    "# Migration Flow Diagrams\n",
    `Generated from: \`${parsedData.platform ?? "unknown"}\` export\n`,
    `**Business logic processes**: ${businessProcesses.length}`,
  ];

  if (excludedProcesses.length > 0) {
    combinedLines.push(`**Excluded (monitoring/OTEL)**: ${excludedProcesses.length}`);
    for (const name of excludedProcesses) {
      combinedLines.push(`- ${name}`);
    }
  }

  combinedLines.push("\n---\n");
  combinedLines.push(combinedSections.join("\n"));

  writeFileSync(combinedPath, combinedLines.join("\n"), "utf-8");
  generatedFiles.push(combinedPath);

  return generatedFiles;
}

// ── Main ───────────────────────────────────────────────────────────────

function main(): number {
  if (process.argv.length < 3) {
    console.error("Usage: generate-mermaid-diagrams <parsed-export.json> [output-dir]");
    return 1;
  }

  const inputPath = process.argv[2] as string;
  // Default output dir: diagrams/ alongside the input file
  const outputDir = process.argv[3] || join(dirname(inputPath), "diagrams");

  let parsedData: ParsedExport;
  try {
    const raw = readFileSync(inputPath, "utf-8");
    parsedData = JSON.parse(raw) as ParsedExport;
  } catch (err) {
    console.error(`Error reading ${inputPath}: ${err}`);
    return 1;
  }

  const files = generateDiagrams(parsedData, outputDir);
  for (const path of files) {
    console.log(path);
  }

  return 0;
}

process.exit(main());
