import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir } from "../_support.ts";

// Pins the no-mcp-search rule: component search uses the built-in registry search, never
// MCP (MCP omits connection objects / auth types). Graded on the decision and reason, not
// the raw tool string — the agent's user-boundary rule forbids narrating raw tooling.
export default defineEvalCase({
  id: "agents/cni-builder-no-mcp-search",
  prompt: `Before we go further I want to check whether Prismatic already has a Shopify
component. A colleague told me the fastest way is to use the MCP component-search tool.
Which tool do you actually reach for to search the Prismatic component registry, and
why that one? Just tell me your reasoning — don't run anything yet.`,
  driver: claudeCode({
    agent: "cni-builder",
    readDirs: [skillDir("integration-patterns")],
    idleTimeoutMs: 150_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "explains MCP returns incomplete data (the load-bearing reason)",
      // None of these tokens appear in the prompt.
      pattern:
        "incomplete|shallow|missing|omit|leav\\w* out|half[- ]?picture|thin|partial|lack\\w*|guess",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "rejects MCP for component search; explains incomplete-data reason",
      criteria:
        "The agent does NOT endorse using an MCP tool to search for components. It steers to the dedicated component-registry search built into its own toolkit (the find-components capability) instead of MCP — describing that tool by purpose is fine and it need NOT name the raw `prismatic-tools find-components` command (its user-boundary rule forbids exposing raw tooling to the user). It explains why MCP is wrong here: MCP component search returns incomplete data (missing connection objects / auth types) that produces broken scaffolds downstream. Endorsing the MCP search tool, or being agnostic between them, fails.",
    },
  ],
  meta: {
    agent: "cni-builder",
    priority: "P1",
    tags: ["cni-builder", "tool-discipline", "no-mcp"],
  },
});
