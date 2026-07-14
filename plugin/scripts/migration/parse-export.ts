#!/usr/bin/env npx tsx
/**
 * parse-export.ts
 *
 * Dispatcher that calls the correct platform-specific parser.
 * Writes parsed output to the session directory as parsed-export.json.
 *
 * USAGE:
 *   prismatic-tools parse-export <export-path> --platform <boomi|cyclr> [--summary] [--session <name>]
 *
 * OUTPUT: Parsed export JSON (also written to session if --session provided)
 *
 * EXIT CODES:
 *   0 - Success
 *   1 - Error
 */

import { spawnSync } from "node:child_process";
import { writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { getSessionDirectory } from "../shared/project-directory.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function main(): number {
  const args = process.argv.slice(2);

  let exportPath = "";
  let platform = "";
  let summary = false;
  let sessionName = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--platform" && i + 1 < args.length) {
      platform = args[i + 1];
      i++;
    } else if (args[i] === "--summary") {
      summary = true;
    } else if (args[i] === "--session" && i + 1 < args.length) {
      sessionName = args[i + 1];
      i++;
    } else if (!args[i].startsWith("-")) {
      exportPath = args[i];
    }
  }

  if (!exportPath || !platform) {
    console.log(
      "Usage: prismatic-tools parse-export <export-path> --platform <boomi|cyclr> [--summary] [--session <name>]",
    );
    return 1;
  }

  if (!["boomi", "cyclr"].includes(platform)) {
    console.error(`Unknown platform: ${platform}. Must be 'boomi' or 'cyclr'.`);
    return 1;
  }

  // Resolve the parser script
  const parserScript = join(__dirname, `parse-${platform}-export.ts`);
  if (!existsSync(parserScript)) {
    console.error(`Parser not found: ${parserScript}`);
    return 1;
  }

  // Build args for the parser
  const parserArgs = [parserScript, exportPath];
  if (summary) parserArgs.push("--summary");

  // Boomi's parser needs @xmldom/xmldom, pinned via npx --package.
  const npxArgs =
    platform === "boomi"
      ? ["--yes", "--package=@xmldom/xmldom@0.8.13", "--package=tsx@4.22.4", "tsx", ...parserArgs]
      : ["tsx", ...parserArgs];

  const result = spawnSync("npx", npxArgs, {
    encoding: "utf-8",
    timeout: 120000,
    maxBuffer: 256 * 1024 * 1024, // exports can be tens of MB
  });

  if (result.status !== 0) {
    console.error(`Parser failed with exit code ${result.status}`);
    if (result.stderr) console.error(result.stderr);
    return 1;
  }
  const output: string = result.stdout;

  // Validate JSON output
  try {
    JSON.parse(output);
  } catch {
    console.error("Parser produced invalid JSON");
    if (output.length < 500) console.error(output);
    return 1;
  }

  // Write to session if --session provided
  if (sessionName) {
    const sessionDir = getSessionDirectory(sessionName, "integrations");
    const outputPath = join(sessionDir, "parsed-export.json");
    writeFileSync(outputPath, output);
    console.error(`Parsed export written to: ${outputPath}`);

    // Copy raw export into session so it's preserved alongside parsed output
    const exportDir = join(sessionDir, "raw-export");
    mkdirSync(exportDir, { recursive: true });
    try {
      const stat = statSync(exportPath);
      if (stat.isDirectory()) {
        for (const f of readdirSync(exportPath)) {
          copyFileSync(join(exportPath, f), join(exportDir, f));
        }
      } else {
        copyFileSync(exportPath, join(exportDir, basename(exportPath)));
      }
      console.error(`Raw export copied to: ${exportDir}`);
    } catch (e) {
      console.error(`Warning: could not copy raw export: ${e}`);
    }
  }

  // Output to stdout (the hook captures this)
  console.log(output);
  return 0;
}

process.exit(main());
