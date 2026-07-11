import { beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

/**
 * parse-cyclr-export turns a Cyclr JSON export into the structured shape the migration
 * pipeline consumes. Load-bearing bits: numeric AuthType codes map to Prismatic auth
 * strings, and edges resolve into a topological execution order (not the JSON's array
 * order, not an alphabetical sort of step ids).
 */

const SCRIPT = join(import.meta.dirname, "parse-cyclr-export.ts");
const FIXTURE = join(import.meta.dirname, "..", "__fixtures__", "cyclr", "cycle.json");

interface ParsedCyclr {
  summary: { total_steps: number };
  cycles: Record<string, { steps: unknown[]; execution_order: Array<{ step_id: string }> }>;
  connectors: Record<string, { auth_type?: string; oauth2_type?: string }>;
}

let out: ParsedCyclr;

beforeAll(() => {
  const r = spawnSync("npx", ["tsx", SCRIPT, FIXTURE], { encoding: "utf-8" });
  expect(r.status).toBe(0);
  out = JSON.parse(r.stdout) as ParsedCyclr;
});

describe("parse-cyclr-export", () => {
  test("counts every step in the cycle", () => {
    expect(out.summary.total_steps).toBe(2);
    expect(Object.keys(out.cycles)).toEqual(["Order Sync Cycle"]);
    expect(out.cycles["Order Sync Cycle"].steps).toHaveLength(2);
  });

  test("maps numeric AuthType codes to Prismatic auth strings", () => {
    // AuthType 4 -> oauth2, OAuth2Type 1 -> AuthorizationCode; AuthType 1 -> apiKey.
    expect(out.connectors["ERP API"].auth_type).toBe("oauth2");
    expect(out.connectors["ERP API"].oauth2_type).toBe("AuthorizationCode");
    expect(out.connectors["Store Webhook"].auth_type).toBe("apiKey");
  });

  test("resolves edges into a topological execution order", () => {
    // The trigger is declared SECOND and sorts after "step-post" alphabetically, but the
    // edge trigger -> post forces it first.
    const order = out.cycles["Order Sync Cycle"].execution_order.map((e) => e.step_id);
    expect(order).toEqual(["step-trigger", "step-post"]);
  });
});
