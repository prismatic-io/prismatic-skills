import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir } from "../_support.ts";

// Pins the cni-builder connection rule: build-only connections must not ship to production.
// Non-tautology: "customer_activated" never appears in the prompt (which supplies only the
// tempting wrong path), so the regex fires only if the agent supplies the correction.
export default defineEvalCase({
  id: "agents/cni-builder-build-only-connection",
  prompt: `Quick architecture question — no need to run or check anything. In my org
there's already a Salesforce connection, but it's a build-only connection. For the
production Code Native Integration we're building I was planning to wire it in with
organizationActivatedConnection(). Is that going to work, and what would you actually
recommend? Just advise — don't run any scripts and don't check my account.`,
  driver: claudeCode({
    agent: "cni-builder",
    readDirs: [skillDir("integration-patterns")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "recommends a customer-activated connection instead",
      // Tolerates hyphen/space/underscore/camelCase separators.
      pattern: "customer[ _-]?activated",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "just advised — ran nothing",
      // No prism_* MCP call and no prismatic-tools synthetic command.
      fn: (run: Run) =>
        !calledPlatform(run) && !toolCallInputs(run).some((i) => i.includes("prismatic-tools")),
    },
    {
      type: "rubric",
      name: "says NO to build-only in production, recommends customer_activated",
      criteria:
        "The agent says NO — a build-only connection cannot be used in production and must not be used with organizationActivatedConnection(); it explains build-only exists only for development/testing and recommends replacing it for production with a customer_activated (customerActivatedConnection) connection, or an org-activated connection backed by the org's own OAuth app/SCV. An answer that endorses build-only with organizationActivatedConnection() in production, or is agnostic, fails.",
    },
  ],
  meta: {
    agent: "cni-builder",
    priority: "P1",
    tags: ["cni-builder", "connections", "decision"],
  },
});
