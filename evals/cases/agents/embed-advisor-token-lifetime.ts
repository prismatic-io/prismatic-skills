import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir } from "../_support.ts";

// Pins token lifetime: JWTs are short-lived (10 min, exp = currentTime + 600) with a
// re-auth timer that re-calls prismatic.authenticate ~60s before expiry.
// Non-tautology: the prompt asks FOR a 24h token and never mentions 600s or a timer.
export default defineEvalCase({
  id: "agents/embed-advisor-token-lifetime",
  prompt: `For our embedded Prismatic setup, can we just issue a long-lived JWT — say
24 hours — so the frontend never has to refresh it? That would really simplify our
code. Is that fine?`,
  driver: claudeCode({
    agent: "embedded-advisor",
    readDirs: [skillDir("embedded-patterns")],
    idleTimeoutMs: 150_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "prescribes the short (10-minute / 600s) lifetime instead",
      // \b600\b so 3600 (a one-hour lifetime) cannot satisfy it.
      pattern: "\\b600\\b|10[\\s-]?minute",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "mentions re-calling the SDK authenticate to refresh",
      pattern: "\\.authenticate\\s*\\(|re-?authenticat",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "declines the 24h token; short-lived JWT + re-auth timer",
      criteria:
        "The agent does NOT endorse a 24-hour (long-lived) token. It explains that Prismatic JWTs must be short-lived — 10 minutes (exp = currentTime + 600) — and that instead of a long token the app should run a re-authentication timer that fetches a fresh JWT and calls prismatic.authenticate({ token }) again roughly 60 seconds before expiry (existing iframes update automatically). An answer that agrees the 24h token is fine fails.",
    },
  ],
  meta: {
    agent: "embedded-advisor",
    priority: "P1",
    tags: ["embed-advisor", "jwt", "token-lifetime"],
  },
});
