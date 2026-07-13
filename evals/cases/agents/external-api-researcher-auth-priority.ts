import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted } from "../_support.ts";

// The staged doc offers OAuth2 and an API key with equal prominence; selecting OAuth2 as
// `recommended` is forced only by the agent's auth priority order (OAuth2 > API Key >
// Bearer > Basic). The token-URL host (auth.nimbus.io) appears nowhere in the prompt.
export default defineEvalCase({
  id: "agents/external-api-researcher-auth-priority",
  prompt: `The API documentation for the "Nimbus" API has already been saved to
./api-docs.html in the current working directory. Read that local file — do NOT fetch
anything over the network — and extract its authentication, base URL, and endpoints into
a structured JSON specification. Write the JSON to ./api-research.json in the current
directory.`,
  driver: claudeCode({
    agent: "external-api-researcher",
    idleTimeoutMs: 240_000,
    maxInterrupts: 2,
  }),
  fixtures: { kind: "dir", path: "api-docs-oauth-priority" },
  ...scripted,
  assertions: [
    {
      type: "file-matches",
      path: "api-research.json",
      pattern: '"recommended"\\s*:\\s*"[^"]*oauth',
      flags: "i",
      name: "recommends OAuth2 over the API key (auth-priority rule)",
    },
    {
      type: "file-contains",
      path: "api-research.json",
      text: "auth.nimbus.io",
      name: "extracted the OAuth2 URLs from the staged doc (fixture-only host)",
    },
    {
      type: "tool-called",
      name: "Bash",
      // Frontmatter grants only WebFetch/Read/Write; Bash must never be called.
      maxTimes: 0,
    },
    {
      type: "rubric",
      name: "both methods captured, OAuth2 chosen per priority, nothing fabricated",
      criteria:
        "The api-research.json is grounded in the staged doc and recommends OAuth2 over the API key; it captures BOTH methods (OAuth2 authorization/token URLs at auth.nimbus.io, scopes; and the API key in the X-Nimbus-Key header) with base URL https://api.nimbus.io/v1, and because the API supports both, `recommended` is oauth2 per the OAuth2 > API Key priority order; it invents no auth methods, URLs, scopes, or endpoints absent from the document.",
    },
  ],
  meta: {
    agent: "external-api-researcher",
    priority: "P1",
    tags: ["researcher", "auth-priority", "fixtures"],
  },
});
