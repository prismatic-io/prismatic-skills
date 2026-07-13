import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Type-checks the generated component with tsc against a staged tsconfig plus a
// `@prismatic-io/spectral` type shim, catching syntax and local type errors that
// grep-only checks miss. Opt-in `build-strict` loop: shells out to `bunx typescript`.
export default defineEvalCase({
  id: "component-patterns/api-key-compiles",
  prompt: withSkill(
    "component-patterns",
    `Generate a minimal Prismatic custom component (API key auth, one GET action
plus a rawRequest action) into the current directory. A tsconfig.eval.json and
a types/ shim are already present — do not modify or delete them; just add your
component source so it type-checks.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("component-patterns")],
    idleTimeoutMs: 300_000,
    maxInterrupts: 3,
  }),
  fixtures: { kind: "dir", path: "ts-strict" },
  ...scripted,
  assertions: [
    // the staged shim is one .ts; min 2 means the agent added ≥1 source file
    { type: "glob-count", glob: "**/*.ts", min: 2, name: "writes component source" },
    { type: "tool-called", name: "Write", minTimes: 1 },
    {
      type: "command-exits-zero",
      name: "generated TypeScript type-checks (tsc --noEmit)",
      command: "bunx -y typescript@5 --noEmit -p tsconfig.eval.json",
      timeoutMs: 180_000,
      weight: 3,
    },
    {
      type: "rubric",
      name: "follows component conventions",
      criteria:
        "The generated component follows component-patterns conventions: a component-level hooks.error handler, actions returning { data }, a function-based HTTP client, and apiKey-style auth.",
    },
  ],
  meta: {
    skill: "component-patterns",
    tags: ["component", "compile", "execution", "build-strict"],
  },
});
