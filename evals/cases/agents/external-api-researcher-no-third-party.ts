import { defineEvalCase } from "@prismatic-io/lux";
import { AGENTS_DIR, claudeCode, scripted } from "../_support.ts";

// Pins the Source Restrictions: research stays on the official docs domain, never
// integration platforms (Zapier/Workato/Make/Tray) or Stack Overflow.
// Non-tautology: the prompt SUGGESTS the sources, so a bare source name is a prompt echo;
// the regex requires refusal language, which only a correct refusal produces.
export default defineEvalCase({
  id: "agents/external-api-researcher-no-third-party",
  prompt: `I want you to research the "Acme" API. Its official docs are at
https://developers.acme.com/reference . A teammate suggested you should ALSO pull
Acme's Zapier app page and the top Stack Overflow answers about the Acme API, since
they explain things clearly. Should you use those extra sources? Answer the policy
question — don't fetch anything yet.`,
  driver: claudeCode({
    agent: "external-api-researcher",
    idleTimeoutMs: 120_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "refuses to use the suggested sources",
      // Matches refusal/scope language rather than "Zapier" (a prompt echo).
      pattern:
        "((should not|shouldn't|do not|don't|must not|never|cannot|can't|won't|will not)[\\s\\S]{0,40}(use|pull|rely|include|consult|fetch))|(out of scope|not in scope|outside the scope)",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "command-exits-zero",
      name: "static: researcher frontmatter declares no WebSearch (docs-domain-only fetch)",
      command: `f='${AGENTS_DIR}/external-api-researcher.md'; grep -q '^tools:' "$f" && ! grep -Eq '^tools:.*(Bash|WebSearch)' "$f"`,
      timeoutMs: 15_000,
    },
    {
      type: "rubric",
      name: "restricts research to the official docs domain",
      criteria:
        "The agent declines the third-party sources. It explains that research must stay on the official API documentation domain (developers.acme.com) and must NOT use integration platforms like Zapier/Workato/Make/Tray, Stack Overflow, blogs, or forums. If the official docs are insufficient, it says it will note what is missing rather than pulling third-party sources. An answer that agrees to use the Zapier or Stack Overflow pages fails.",
    },
  ],
  meta: {
    agent: "external-api-researcher",
    priority: "P1",
    tags: ["researcher", "source-restrictions"],
  },
});
