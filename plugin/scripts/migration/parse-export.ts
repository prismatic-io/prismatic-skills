#!/usr/bin/env node
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

import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { exec, type Output } from "../../vendor/tinyexec/main.mjs";
import { getSessionDirectory } from "../shared/project-directory.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const main = async (): Promise<number> => {
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

  let result: Output;
  try {
    result = await exec(process.execPath, parserArgs, {
      timeout: 120000,
    });
  } catch (error) {
    console.error(`Parser failed: ${error}`);
    return 1;
  }

  if (result.exitCode !== 0) {
    console.error(`Parser failed with exit code ${result.exitCode}`);
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
    await writeFile(outputPath, output);
    console.error(`Parsed export written to: ${outputPath}`);

    // Copy raw export into session so it's preserved alongside parsed output
    const exportDir = join(sessionDir, "raw-export");
    await mkdir(exportDir, { recursive: true });
    try {
      const exportStat = await stat(exportPath);
      if (exportStat.isDirectory()) {
        for (const f of await readdir(exportPath)) {
          await copyFile(join(exportPath, f), join(exportDir, f));
        }
      } else {
        await copyFile(exportPath, join(exportDir, basename(exportPath)));
      }
      console.error(`Raw export copied to: ${exportDir}`);
    } catch (e) {
      console.error(`Warning: could not copy raw export: ${e}`);
    }
  }

  // Output to stdout (the hook captures this)
  console.log(output);
  return 0;
};

process.exit(await main());
