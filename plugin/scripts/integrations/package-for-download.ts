#!/usr/bin/env node
/**
 * package-for-download.ts
 *
 * PURPOSE: Package completed integration for user download
 *
 * USAGE: node package-for-download.ts <project-directory> [version-name]
 *
 * EXIT CODES:
 *   0 - Success: Package created
 *   1 - Error: Project directory not found
 *   2 - Error: Zip creation failed
 */

import type { Dirent } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve, basename, relative } from "node:path";
import { tmpdir } from "node:os";
import { exec } from "../../vendor/tinyexec/main.mjs";
import { confineToProjectRoot } from "../shared/project-directory.ts";

const EXCLUDED_PATTERNS = [
  "node_modules",
  ".git",
  "__pycache__",
  ".DS_Store",
  ".env",
  "components",
];

const walkDir = async (dir: string, baseDir: string, excluded: string[]): Promise<string[]> => {
  const results: string[] = [];

  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (excluded.includes(entry.name)) continue;

    const fullPath = join(dir, entry.name);

    // Check if any parent path component is excluded
    const relPath = relative(baseDir, fullPath);
    const parts = relPath.split(/[/\\]/);
    if (parts.some((p) => excluded.includes(p))) continue;

    if (entry.isDirectory()) {
      results.push(...(await walkDir(fullPath, baseDir, excluded)));
    } else if (entry.isFile() && !entry.name.endsWith(".pyc")) {
      results.push(fullPath);
    }
  }

  return results;
};

const createPackage = async (projectDir: string, versionName?: string): Promise<number> => {
  try {
    if (!(await stat(projectDir)).isDirectory()) {
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
  await mkdir(outputsDir, { recursive: true });
  const outputPath = join(outputsDir, packageName);

  console.log(`Packaging integration: ${projectDir}`);
  console.log(`Package: ${packageName}`);
  console.log("");

  try {
    // Use the zip command which is available on most systems
    const files = await walkDir(projectDir, resolve(projectDir, ".."), EXCLUDED_PATTERNS);

    if (files.length === 0) {
      console.log("No files to package");
      return 2;
    }

    // Build relative paths for zip
    const parentDir = resolve(projectDir, "..");
    const relFiles = files.map((f) => relative(parentDir, f));

    // Use system zip command
    let zipError = "";
    let zipCreated = false;
    try {
      const result = await exec("zip", ["-r", outputPath, ...relFiles], {
        timeout: 60000,
        nodeOptions: { cwd: parentDir },
      });
      zipCreated = result.exitCode === 0;
      zipError = result.stderr;
    } catch (error) {
      zipError = String(error);
    }

    if (!zipCreated) {
      // Fallback: try tar.gz if zip is not available
      const tarPath = outputPath.replace(".zip", ".tar.gz");
      let tarError = "";
      let tarCreated = false;
      try {
        const tarResult = await exec("tar", ["-czf", tarPath, "-C", parentDir, ...relFiles], {
          timeout: 60000,
        });
        tarCreated = tarResult.exitCode === 0;
        tarError = tarResult.stderr;
      } catch (error) {
        tarError = String(error);
      }

      if (!tarCreated) {
        console.log("Error creating package");
        console.log((tarError || zipError).slice(0, 500));
        return 2;
      }

      const archiveStat = await stat(tarPath);
      const sizeKb = archiveStat.size / 1024;
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

    const archiveStat = await stat(outputPath);
    const sizeKb = archiveStat.size / 1024;
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
};

const main = async (): Promise<number> => {
  if (process.argv.length < 3) {
    console.log("No project directory provided");
    console.log("Usage: node package-for-download.ts <project-directory> [version-name]");
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
};

process.exit(await main());
