#!/usr/bin/env npx tsx
/**
 * detect-platform.ts
 *
 * Detects whether export files are from Dell Boomi or Cyclr by reading
 * file headers. Boomi exports are XML with bns:Component root elements.
 * Cyclr exports are JSON with Steps[], Edges[], VersionedCycle keys.
 *
 * USAGE:
 *   prismatic-tools detect-platform <export-path>
 *
 * OUTPUT: JSON with platform, file_count, files
 *
 * EXIT CODES:
 *   0 - Success
 *   1 - Error (path not found or unrecognized format)
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";

interface DetectionResult {
  platform: "boomi" | "cyclr" | "unknown";
  file_count: number;
  files: string[];
  confidence: string;
}

function main(): number {
  const exportPath = process.argv[2];

  if (!exportPath) {
    console.log("Usage: prismatic-tools detect-platform <export-path>");
    return 1;
  }

  let files: string[];
  try {
    const stat = statSync(exportPath);
    if (stat.isDirectory()) {
      files = readdirSync(exportPath)
        .filter((f) => !f.startsWith(".") && (f.endsWith(".xml") || f.endsWith(".json")))
        .map((f) => join(exportPath, f));
    } else {
      files = [exportPath];
    }
  } catch {
    console.error(`Path not found: ${exportPath}`);
    return 1;
  }

  if (files.length === 0) {
    console.error(`No XML or JSON files found in: ${exportPath}`);
    return 1;
  }

  // Read first file to detect format
  let platform: "boomi" | "cyclr" | "unknown" = "unknown";
  let confidence = "low";

  for (const file of files.slice(0, 3)) {
    try {
      const content = readFileSync(file, "utf-8").trim();

      // Boomi: XML files with bns:Component namespace
      if (content.startsWith("<?xml") || content.startsWith("<bns:")) {
        if (content.includes("bns:Component") || content.includes("xmlns:bns=")) {
          platform = "boomi";
          confidence = "high";
          break;
        }
      }

      // Cyclr: JSON with Steps, Edges, or VersionedCycle keys
      if (content.startsWith("{") || content.startsWith("[")) {
        try {
          const parsed = JSON.parse(content);
          if (parsed.Steps || parsed.Edges || parsed.VersionedCycle) {
            platform = "cyclr";
            confidence = "high";
            break;
          }
          // Array of cycles
          if (Array.isArray(parsed) && parsed[0]?.Steps) {
            platform = "cyclr";
            confidence = "high";
            break;
          }
        } catch {
          // Not valid JSON, continue checking
        }
      }
    } catch {}
  }

  const result: DetectionResult = {
    platform,
    file_count: files.length,
    files: files.map((f) => basename(f)),
    confidence,
  };

  console.log(JSON.stringify(result, null, 2));
  return platform === "unknown" ? 1 : 0;
}

process.exit(main());
