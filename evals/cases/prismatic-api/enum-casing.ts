import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

export default defineEvalCase({
  id: "prismatic-api/enum-casing",
  prompt: withSkill(
    "prismatic-api",
    `I need to create an org-managed, per-customer scoped config variable for an
OAuth connection in Prismatic. Show me the GraphQL mutation with concrete values
for the variableScope and managedBy fields filled in.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("prismatic-api")],
    idleTimeoutMs: 120_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "variableScope uses lowercase 'customer' literal",
      pattern: "variableScope[\"']?\\s*[:=]\\s*[\"']customer[\"']",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "managedBy uses lowercase 'org' literal",
      pattern: "managedBy[\"']?\\s*[:=]\\s*[\"']org[\"']",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "every enum literal is lowercase, never SCREAMING_CASE",
      criteria:
        'The answer assigns concrete enum string values for variableScope and managedBy and every such enum literal is lowercase exactly as the skill\'s Critical Patterns mandate: variableScope is "customer" (never "CUSTOMER") and managedBy is "org" (never "ORG"). Any other enum string literals shown are likewise lowercase. The response does NOT show uppercase/SCREAMING_CASE enum values anywhere, and it is a scoped config variable mutation (e.g. updateScopedConfigVariable) rather than a fabricated query.',
    },
  ],
  meta: { skill: "prismatic-api", tags: ["api", "enums", "connections", "casing"] },
});
