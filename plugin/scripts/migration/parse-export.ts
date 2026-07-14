#!/usr/bin/env npx tsx
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type CliConfig, parseCliArgs } from "../shared/cli-help.js";
import { getSessionDirectory } from "../shared/project-directory.js";

const CLI = {
  command: "prismatic-tools parse-export",
  description: "Parse an integration export into structured JSON.",
  positionals: [{ name: "export-path", required: true }],
  options: [
    {
      name: "platform",
      type: "string",
      value: "boomi|cyclr",
      required: true,
      choices: ["boomi", "cyclr"],
      description: "Source platform.",
    },
    { name: "summary", type: "boolean", description: "Emit summary output." },
    {
      name: "session",
      type: "string",
      value: "name",
      description: "Session to receive parsed-export.json.",
    },
  ],
} as const satisfies CliConfig;

const __dirname = dirname(fileURLToPath(import.meta.url));

function main(): number {
  const { values, positionals } = parseCliArgs(process.argv.slice(2), CLI);
  const exportPath = positionals.at(-1) ?? "";
  const platform = typeof values.platform === "string" ? values.platform : "";
  const summary = values.summary === true;
  const sessionName = typeof values.session === "string" ? values.session : "";

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
