import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

export default defineEvalCase({
  id: "embedded/jwt-refresh",
  prompt: withSkill(
    "embedded-patterns",
    `How do I refresh the embedded JWT before it expires so the user is not
logged out?`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("embedded-patterns")],
    idleTimeoutMs: 90_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "recommends calling prismatic.authenticate() again",
      pattern: "prismatic\\.authenticate",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "notes iframes update automatically",
      // require iframe + automatic in proximity, not a generic "updates automatically"
      pattern: "iframe[\\s\\S]{0,150}automat|automat[\\s\\S]{0,150}iframe",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "re-authenticate pattern, no logout/re-embed, refresh before expiry",
      criteria:
        "Recommends calling prismatic.authenticate({ token }) again with a fresh JWT — NOT a logout/re-login flow and NOT destroying or recreating the iframe. Notes that existing iframes update automatically when authenticate is called with a fresh token. Suggests refreshing before the token expires (e.g., ~1 minute before exp), not after it has already expired.",
    },
  ],
  meta: { skill: "embedded-patterns", tags: ["embedded", "jwt", "refresh"] },
});
