import { defineEvalCase, type Run, toolCalls } from "@prismatic-io/lux";
import { AGENTS_DIR, claudeCode, scripted } from "../_support.ts";

// Hermetic tool-discipline check: docs are staged locally, so the researcher must Read
// them (never Bash/WebFetch). The asserted identifiers exist only in the staged HTML,
// so file-contains proves the JSON is grounded in the document.
export default defineEvalCase({
  id: "agents/external-api-researcher-no-bash",
  prompt: `The API documentation for the "Widgetco" API has already been saved to
./api-docs.html in the current working directory. Read that local file (do NOT fetch
anything over the network) and extract its authentication, base URL, endpoints, and
webhook details into a structured JSON specification. Write the JSON to
./api-research.json in the current directory.`,
  driver: claudeCode({
    agent: "external-api-researcher",
    idleTimeoutMs: 240_000,
    maxInterrupts: 2,
  }),
  fixtures: { kind: "dir", path: "api-docs-sample" },
  ...scripted,
  assertions: [
    {
      type: "glob-count",
      glob: "**/api-docs.html",
      min: 1,
      name: "docs file was staged into the working dir",
    },
    { type: "tool-called", name: "Read", minTimes: 1 },
    { type: "tool-called", name: "Write", minTimes: 1 },
    {
      type: "tool-called",
      name: "Bash",
      // Bash isn't in the agent's tools; maxTimes:0 catches it being added to the frontmatter.
      maxTimes: 0,
    },
    {
      type: "predicate",
      name: "did not fetch over the network (read the staged file instead)",
      fn: (run: Run) => toolCalls(run).every((c) => c.name !== "WebFetch"),
    },
    { type: "file-exists", path: "api-research.json", name: "wrote the structured research JSON" },
    {
      type: "file-contains",
      path: "api-research.json",
      text: "widgetco.com",
      name: "captured the base URL host from the doc",
    },
    {
      type: "file-contains",
      path: "api-research.json",
      text: "widget.created",
      name: "captured a webhook event type from the doc",
    },
    {
      type: "command-exits-zero",
      name: "static: researcher frontmatter declares no Bash / WebSearch",
      command: `f='${AGENTS_DIR}/external-api-researcher.md'; grep -q '^tools:' "$f" && ! grep -Eq '^tools:.*(Bash|WebSearch)' "$f"`,
      timeoutMs: 15_000,
    },
    {
      type: "rubric",
      name: "structured JSON grounded in the doc, no invented data",
      criteria:
        "The written api-research.json is a structured API spec grounded in the staged doc: API key auth passed in the X-Widget-Key header (OAuth2 not supported), base URL https://api.widgetco.com/v2, the /widgets endpoints (list with cursor pagination, get, create), and webhooks registered at POST /hooks with events widget.created / widget.updated / widget.deleted and an X-Widget-Signature HMAC-SHA256 signature. It must not invent auth methods, endpoints, or events that are absent from the document.",
    },
  ],
  meta: {
    agent: "external-api-researcher",
    priority: "P0",
    tags: ["researcher", "tool-discipline", "no-bash"],
  },
});
