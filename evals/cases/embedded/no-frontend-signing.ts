import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins SKILL.md's Critical Security Rule: JWTs are signed on the backend and the
// private signing key never reaches the frontend. Posed as the tempting anti-pattern.
export default defineEvalCase({
  id: "embedded/no-frontend-signing",
  prompt: withSkill(
    "embedded-patterns",
    `To simplify our setup, can I just sign the embedded Prismatic JWT directly in
our React frontend instead of calling our backend? We already have the signing
key available to the app.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("embedded-patterns")],
    idleTimeoutMs: 120_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "explicitly refuses signing in the frontend",
      // Refusal verb must appear adjacent to "frontend" so an answer that endorses
      // frontend signing cannot pass.
      pattern:
        "(never|do not|don't|must not|should not|shouldn't|cannot|can't|unsafe|insecure|not safe)[\\s\\S]{0,120}(frontend|browser|client[- ]side|React app)|(frontend|browser|client[- ]side|React app)[\\s\\S]{0,120}(never|must not|should not|unsafe|insecure|not safe)",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "keeps the private signing key server-side",
      pattern: "private[\\s-]?(signing[\\s-]?)?key",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "refuses frontend signing; key stays on backend",
      criteria:
        "The answer clearly says NO — the JWT must be signed on the backend using the private signing key, which must never be exposed to or shipped with the frontend. It does not provide or endorse a way to sign the JWT in the React app, and (ideally) notes the frontend should only receive the already-signed JWT from a backend endpoint.",
    },
  ],
  meta: { skill: "embedded-patterns", tags: ["embedded", "security", "jwt", "ci"] },
});
