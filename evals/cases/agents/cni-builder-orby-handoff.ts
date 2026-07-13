import { defineEvalCase } from "@prismatic-io/lux";
import { AGENTS_DIR, claudeCode, scripted, skillDir } from "../_support.ts";

// Pins the cross-agent protocol: when cni-builder needs platform data its tools can't
// fetch, it emits a literal <orby-request> and stops rather than fabricating.
// Non-tautology: the prompt never says "orby-request", so the tag appears only on escalation.
export default defineEvalCase({
  id: "agents/cni-builder-orby-handoff",
  prompt: `We are deep in a Code Native Integration build. The integration is already
deployed and I just ran the test flow — it failed with an opaque error I can't make
sense of. You do NOT have a way to pull the platform execution logs yourself, and I
don't want you to run any setup, scaffold, build, or platform scripts right now. What
is your very next move? Be concrete.`,
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
      name: "emits the literal <orby-request> handoff tag",
      pattern: "<orby-request>",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "the request is for execution logs, not a guessed explanation",
      pattern: "<orby-request>[\\s\\S]{0,200}(execution|logs?)",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "command-exits-zero",
      name: "static: cni-builder frontmatter declares Bash + AskUserQuestion and the integration-patterns skill",
      command: `f='${AGENTS_DIR}/cni-builder.md'; grep -Eq '^tools:.*Bash' "$f" && grep -Eq '^tools:.*AskUserQuestion' "$f" && grep -Eq '^[[:space:]]*-[[:space:]]*integration-patterns' "$f"`,
      timeoutMs: 15_000,
    },
    {
      type: "rubric",
      name: "escalates to Orby for logs; does not fabricate platform state",
      criteria:
        "The agent recognizes it needs platform data (the failed execution's logs) that its own tools cannot fetch, and requests it by emitting an <orby-request> tag describing the task (fetch the recent execution logs / error for this integration), then stops and waits. It must NOT invent or assert a specific root cause, error message, or log contents that it has no way of knowing, and must NOT claim to have fetched the logs itself.",
    },
  ],
  meta: {
    agent: "cni-builder",
    priority: "P0",
    tags: ["cni-builder", "orby-handoff", "escalation"],
  },
});
