import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exec } from "../../vendor/tinyexec/main.mjs";

/**
 * generate-mermaid-diagrams renders one flow diagram per business process. Key rule under
 * test: [OTEL]/[Monitoring]-prefixed processes are observability plumbing, not business
 * logic — excluded from the diagrams and only counted in the "excluded" summary line.
 */

const SCRIPT = join(import.meta.dirname, "generate-mermaid-diagrams.ts");
const FIXTURE = join(import.meta.dirname, "..", "__fixtures__", "boomi-parsed.json");

describe("generate-mermaid-diagrams", () => {
  test("excludes [OTEL] processes from the business diagrams", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "mmd-"));
    const r = await exec("node", [SCRIPT, FIXTURE, outDir]);
    expect(r.exitCode).toBe(0);

    const files = await readdir(outDir);
    // A .mmd is emitted for the business process, but not for the OTEL one.
    expect(files).toContain("flow-main-order-sync.mmd");
    expect(files.some((f) => f.startsWith("flow-") && f.includes("telemetry"))).toBe(false);

    const md = await readFile(join(outDir, "migration-diagrams.md"), "utf-8");
    expect(md).toContain("**Business logic processes**: 1");
    expect(md).toContain("**Excluded (monitoring/OTEL)**: 1");
    // The OTEL process appears only in the excluded list, never as a rendered "## " section.
    expect(md).toContain("## MAIN - Order Sync");
    expect(md).not.toContain("## [OTEL] Telemetry Exporter");
  });
});
