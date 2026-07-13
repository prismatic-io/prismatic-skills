import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineEvalCase, type Run } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// The agent may answer in prose or scaffold files, so init/authenticate evidence
// can land in the transcript or an artifact; collect both. Call ordering is graded
// by the rubric.
const runCorpus = (run: Run): string => {
  const transcript = run.events
    .filter((e) => e.type === "progress" && e.kind === "agent-message")
    .map((e) => String((e.payload as { text?: unknown })?.text ?? ""))
    .join("\n");
  const artifacts = run.artifacts
    .map((a) => {
      try {
        return readFileSync(join(a.root ?? join(run.runDir, "artifacts"), a.path), "utf-8");
      } catch {
        return "";
      }
    })
    .join("\n");
  return `${transcript}\n${artifacts}`;
};

export default defineEvalCase({
  id: "embedded/marketplace-jwt-setup",
  prompt: withSkill(
    "embedded-patterns",
    `Show me how to set up the Prismatic embedded marketplace in a React app,
including the JWT token flow.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("embedded-patterns")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 3,
  }),
  ...scripted,
  assertions: [
    {
      type: "predicate",
      name: "calls both prismatic.init() and prismatic.authenticate()",
      fn: (run: Run) => {
        const corpus = runCorpus(run);
        return corpus.includes("prismatic.init(") && corpus.includes("prismatic.authenticate");
      },
    },
    {
      type: "regex",
      name: "emphasizes backend-only JWT signing",
      pattern: "backend|server.side|server side",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "backend-only signing, 5 claims, 10-min expiry, init before authenticate",
      criteria:
        "JWT signing happens on the backend only — the private signing key is never exposed to the frontend. The JWT payload includes all five required claims: sub, organization, customer, iat, and exp. JWT expiry is short-lived (~10 minutes / exp = iat + 600), not a long-lived token. The frontend calls prismatic.init() before prismatic.authenticate({ token }).",
    },
  ],
  meta: { skill: "embedded-patterns", tags: ["embedded", "jwt", "marketplace"] },
});
