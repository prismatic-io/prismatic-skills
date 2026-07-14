#!/usr/bin/env npx tsx
/**
 * package-for-download.ts
 *
 * PURPOSE: Package completed integration for user download
 *
 * USAGE: npx tsx package-for-download.ts <project-directory> [version-name]
 *
 * EXIT CODES:
 *   0 - Success: Package created
 *   1 - Error: Project directory not found
 *   2 - Error: Zip creation failed
 */

import { mkdirSync, statSync, readdirSync } from "node:fs";
import { join, resolve, basename, relative } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { confineToProjectRoot } from "../shared/project-directory.js";

const EXCLUDED_PATTERNS = [
  "node_modules",
  ".git",
  "__pycache__",
  ".DS_Store",
  ".env",
  "components",
];

function walkDir(dir: string, baseDir: string, excluded: string[]): string[] {
  const results: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (excluded.includes(entry)) continue;

    const fullPath = join(dir, entry);

    // Check if any parent path component is excluded
    const relPath = relative(baseDir, fullPath);
    const parts = relPath.split(/[/\\]/);
    if (parts.some((p) => excluded.includes(p))) continue;

    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...walkDir(fullPath, baseDir, excluded));
      } else if (!entry.endsWith(".pyc")) {
        results.push(fullPath);
      }
    } catch {
      // skip inaccessible files
    }
  }

  return results;
}

function createPackage(projectDir: string, versionName?: string): number {
  try {
    if (!statSync(projectDir).isDirectory()) {
      console.log(`Project directory not found: ${projectDir}`);
      return 1;
    }
  } catch {
    console.log(`Project directory not found: ${projectDir}`);
    return 1;
  }

  const projectName = basename(resolve(projectDir));
  let packageName: string;
  if (versionName) {
    packageName = `${projectName}-${versionName}.zip`;
  } else {
    const now = new Date();
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      "-",
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");
    packageName = `${projectName}-${timestamp}.zip`;
  }

  const outputsDir =
    process.env.PRISMATIC_OUTPUT_DIR ||
    join(process.env.HOME || process.env.USERPROFILE || tmpdir(), "prismatic-outputs");
  mkdirSync(outputsDir, { recursive: true });
  const outputPath = join(outputsDir, packageName);

  console.log(`Packaging integration: ${projectDir}`);
  console.log(`Package: ${packageName}`);
  console.log("");

  try {
    // Use the zip command which is available on most systems
    const files = walkDir(projectDir, resolve(projectDir, ".."), EXCLUDED_PATTERNS);

    if (files.length === 0) {
      console.log("No files to package");
      return 2;
    }

    // Build relative paths for zip
    const parentDir = resolve(projectDir, "..");
    const relFiles = files.map((f) => relative(parentDir, f));

    // Use system zip command
    const result = spawnSync("zip", ["-r", outputPath, ...relFiles], {
      cwd: parentDir,
      encoding: "utf-8",
      timeout: 60000,
    });

    if (result.status !== 0) {
      // Fallback: try tar.gz if zip is not available
      const tarPath = outputPath.replace(".zip", ".tar.gz");
      const tarResult = spawnSync("tar", ["-czf", tarPath, "-C", parentDir, ...relFiles], {
        encoding: "utf-8",
        timeout: 60000,
      });

      if (tarResult.status !== 0) {
        console.log("Error creating package");
        if (result.stderr) console.log(result.stderr.slice(0, 500));
        return 2;
      }

      const stat = statSync(tarPath);
      const sizeKb = stat.size / 1024;
      const sizeMb = sizeKb / 1024;

      console.log("Package created successfully (tar.gz)");
      console.log("");
      console.log(`Files included: ${files.length}`);
      console.log(
        `Package size: ${sizeMb >= 1 ? `${sizeMb.toFixed(2)} MB` : `${sizeKb.toFixed(2)} KB`}`,
      );
      console.log("");
      console.log(`Download location: ${tarPath}`);
      return 0;
    }

    const stat = statSync(outputPath);
    const sizeKb = stat.size / 1024;
    const sizeMb = sizeKb / 1024;

    console.log("Package created successfully");
    console.log("");
    console.log(`Files included: ${files.length}`);
    console.log(
      `Package size: ${sizeMb >= 1 ? `${sizeMb.toFixed(2)} MB` : `${sizeKb.toFixed(2)} KB`}`,
    );
    console.log("");
    console.log(`Download location: ${outputPath}`);
    console.log(`Download link: computer:///${outputPath}`);
    console.log("");
    console.log("Package contents:");
    console.log("  - Source code (src/)");
    console.log("  - Built artifacts (dist/)");
    console.log("  - Configuration files (package.json, tsconfig.json)");
    console.log("  - Documentation");
    console.log("");
    console.log("Excluded from package:");
    console.log("  - node_modules/ (dependencies)");
    console.log("  - components/ (downloaded component source)");
    console.log("  - .git/ (version control)");
    console.log("  - .env (secrets)");
    console.log("");
    console.log("To use this package:");
    console.log("  1. Download the zip file");
    console.log("  2. Extract on your local machine");
    console.log("  3. Run: npm install");
    console.log("  4. Deploy to Prismatic");

    return 0;
  } catch (e) {
    console.log(`Error creating package: ${e}`);
    return 2;
  }
}

function main(): number {
  if (process.argv.length < 3) {
    console.log("No project directory provided");
    console.log("Usage: npx tsx package-for-download.ts <project-directory> [version-name]");
    return 1;
  }

  let projectDir: string;
  try {
    projectDir = confineToProjectRoot(process.argv[2]);
  } catch (e) {
    console.log((e as Error).message);
    return 1;
  }
  const versionName = process.argv[3] ?? undefined;

  return createPackage(projectDir, versionName);
}

process.exit(main());
