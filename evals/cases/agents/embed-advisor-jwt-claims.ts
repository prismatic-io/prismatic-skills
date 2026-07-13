import { defineEvalCase } from "@prismatic-io/lux";
import { AGENTS_DIR, claudeCode, scripted, skillDir } from "../_support.ts";

// Pins the JWT endpoint contract: all required claims (sub, organization, customer, iat,
// exp), RS256, env-loaded key, 10-minute (exp = currentTime + 600) lifetime.
// Non-tautology: the prompt lists no claim names or lifetime.
export default defineEvalCase({
  id: "agents/embed-advisor-jwt-claims",
  prompt: `Generate the backend JWT signing endpoint for our Node.js/Express app that
mints tokens for the Prismatic embedded marketplace. Show me the endpoint code.`,
  driver: claudeCode({
    agent: "embedded-advisor",
    readDirs: [skillDir("embedded-patterns")],
    idleTimeoutMs: 240_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "includes the required 'organization' claim as a JWT field",
      // Requires the claim KEY (organization:), not the prose word — passing mentions fail.
      pattern: "organization[\"']?\\s*[:=]",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "includes the required 'customer' claim as a JWT field",
      // Matches `customer:` but not `customer_name:`.
      pattern: "customer[\"']?\\s*[:=]",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "signs with RS256",
      pattern: "RS256",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "uses the 10-minute (600s) token lifetime",
      // \b600\b so 3600 (a one-hour lifetime) cannot satisfy it.
      pattern: "\\b600\\b|10[\\s-]?minute",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "command-exits-zero",
      name: "static: embedded-advisor frontmatter declares the embedded-patterns skill",
      command: `f='${AGENTS_DIR}/embedded-advisor.md'; grep -Eq '^[[:space:]]*-[[:space:]]*embedded-patterns' "$f"`,
      timeoutMs: 15_000,
    },
    {
      type: "rubric",
      name: "backend endpoint, RS256, env-loaded key, all required claims, 10-min expiry",
      criteria:
        "The generated code is a BACKEND endpoint (not frontend) that signs with RS256, loads the private signing key AND the organization id from environment variables (never hardcoded), and builds a JWT that includes ALL required claims: sub, organization, customer, iat (currentTime - 5), and exp (currentTime + 600, i.e. 10 minutes). It should also include the recommended external_id and customer_name claims, and return the token (ideally with expiresAt). It must NOT sign on the frontend and must NOT hardcode secrets.",
    },
  ],
  meta: { agent: "embedded-advisor", priority: "P0", tags: ["embed-advisor", "jwt", "security"] },
});
