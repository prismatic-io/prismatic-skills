import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins the skill's data-safety rule: updateInstanceConfigVariables updates only the
// named vars, while updateInstance replaces ALL config vars on the instance.
export default defineEvalCase({
  id: "prismatic-api/update-config-vars",
  prompt: withSkill(
    "prismatic-api",
    `I need to change two config variable values on an existing Prismatic instance
via the API, leaving the instance's other config variables untouched. What is
the correct mutation to use, and what should I avoid?`,
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
      name: "recommends updateInstanceConfigVariables",
      pattern: "updateInstanceConfigVariables",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "partial-safe mutation, warns against full-replace updateInstance",
      criteria:
        "Recommends the updateInstanceConfigVariables mutation (a partial, safe update of only the named config variables) and explicitly warns AGAINST using updateInstance to change config variables, because updateInstance replaces ALL of the instance's config variables. It does not present plain updateInstance as the way to update individual config vars.",
    },
  ],
  meta: { skill: "prismatic-api", tags: ["api", "data-safety", "config-vars", "ci"] },
});
