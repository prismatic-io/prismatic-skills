import { defineEvalCase } from "@prismatic-io/lux";
import { AGENTS_DIR, claudeCode, scripted, skillDir } from "../_support.ts";

// Pins the read-only review contract: migration-reviewer emits <review-result> and changes
// nothing. The fixture plants an untranslated Groovy script (TODO) and a fabricated
// endpoint; both exist only in the staged files, so matching them proves a real review.
export default defineEvalCase({
  id: "agents/migration-reviewer-readonly",
  prompt: `A migration-schema.json and the generated CNI code (./src/flows.ts) are both
present in the current working directory. Review the generated code against the schema
using your checklist and produce your review findings.`,
  driver: claudeCode({
    agent: "migration-reviewer",
    readDirs: [skillDir("migration-framework"), skillDir("integration-patterns")],
    idleTimeoutMs: 240_000,
    maxInterrupts: 2,
  }),
  fixtures: { kind: "dir", path: "migration-review" },
  ...scripted,
  assertions: [
    { type: "tool-called", name: "Read", minTimes: 1 },
    {
      type: "tool-called",
      name: "Write",
      // Write isn't in the reviewer's tools; maxTimes:0 catches it being added to the frontmatter.
      maxTimes: 0,
    },
    { type: "tool-called", name: "Edit", maxTimes: 0 },
    {
      type: "regex",
      name: "emits the <review-result> report",
      pattern: "<review-result",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "flags the fabricated endpoint absent from the schema",
      // Exists only in the staged flows.ts (the schema has /api/v2/orders).
      pattern: "/api/v3/orders/bulk",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "flags the untranslated normalizeOrder Groovy script",
      pattern: "normalizeOrder",
      against: "transcript-all",
    },
    {
      type: "command-exits-zero",
      name: "static: migration-reviewer frontmatter is read-only (no Write/Edit/Bash)",
      command: `f='${AGENTS_DIR}/migration-reviewer.md'; grep -q '^tools:' "$f" && ! grep -Eq '^tools:.*(Write|Edit|Bash)' "$f"`,
      timeoutMs: 15_000,
    },
    {
      type: "rubric",
      name: "catches the untranslated script and the out-of-schema endpoint; changes nothing",
      criteria:
        "The review reports (as <review-result> findings) at least these two defects: (1) the normalizeOrder Groovy script was NOT translated — a `TODO` placeholder was left in src/flows.ts (script-translation, critical); and (2) the endpoint `/api/v3/orders/bulk` used in the code is not present in the migration schema (endpoints list only /api/v2/orders), so it is flagged as fabricated / needs-verification. The reviewer only reports findings — it does not modify any file.",
    },
  ],
  meta: {
    agent: "migration-reviewer",
    priority: "P0",
    tags: ["migration-reviewer", "read-only", "review", "ci"],
  },
});
