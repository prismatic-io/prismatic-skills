import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Non-tautology: the asserted TS idioms (randomUUID, JSON.stringify) appear nowhere in
// the prompt, so producing them requires applying the guide's Common-translations table;
// "TODO" is also absent from the prompt, so the no-placeholder check catches a stub.
export default defineEvalCase({
  id: "migration-framework/groovy-to-typescript-translation",
  prompt: withSkill(
    "migration-framework",
    `A Boomi process has this Groovy scripting step that I need to migrate into a Code
Native Integration. Translate it to TypeScript following the migration framework's
Groovy-to-TypeScript translation patterns, preserving the input/output contract. Write
the result to \`translated.ts\` in the current working directory. Do NOT run anything
against my Prismatic account and do NOT check my auth — just produce the TypeScript file.

\`\`\`groovy
def recordId = java.util.UUID.randomUUID().toString()
def parsed = new JsonSlurper().parseText(payloadJson)
def jobMode = ExecutionUtil.getDynamicProcessProperty("DPP_JOB_MODE")
def result = new JsonBuilder([id: recordId, mode: jobMode, count: parsed.size()]).toString()
\`\`\``,
  ),
  driver: claudeCode({
    readDirs: [skillDir("migration-framework")],
    idleTimeoutMs: 240_000,
    maxInterrupts: 3,
  }),
  ...scripted,
  assertions: [
    {
      type: "file-matches",
      path: "translated.ts",
      // Matches both crypto.randomUUID() and randomUUID imported from node:crypto.
      pattern: "randomUUID\\s*\\(",
      name: "UUID.randomUUID() -> randomUUID() from node:crypto",
    },
    {
      type: "file-matches",
      path: "translated.ts",
      pattern: "JSON\\.stringify",
      name: "JsonBuilder().toString() -> JSON.stringify()",
    },
    {
      type: "command-exits-zero",
      name: "no TODO/placeholder stubs (and the file exists)",
      command: "test -f translated.ts && ! grep -qi 'TODO' translated.ts",
    },
    {
      type: "predicate",
      name: "did not run against the platform",
      fn: (run: Run) =>
        !calledPlatform(run) && !toolCallInputs(run).some((i) => i.includes("graphql:query")),
    },
    {
      type: "rubric",
      name: "full translation, contract preserved, no leftover Groovy APIs",
      criteria:
        'The generated TypeScript fully translates every line with no TODO/placeholder stubs and preserves the input/output contract, applying JSON.parse for JsonSlurper().parseText, JSON.stringify for JsonBuilder().toString(), crypto.randomUUID() (or randomUUID imported from node:crypto) for UUID.randomUUID(), and resolving getDynamicProcessProperty("DPP_JOB_MODE") to a function parameter or crossFlowState/context lookup rather than leaving the Groovy API call in place.',
    },
  ],
  meta: { skill: "migration-framework", tags: ["migration", "groovy", "codegen", "translation"] },
});
