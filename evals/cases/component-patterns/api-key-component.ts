import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

export default defineEvalCase({
  id: "component-patterns/api-key-component",
  prompt: withSkill(
    "component-patterns",
    `Generate a minimal Prismatic custom component that wraps an HTTP API using
API key authentication. It should have one action that issues a GET and a
rawRequest action. Write the files into the current directory. Follow
Prismatic conventions exactly.`,
  ),
  driver: claudeCode({ readDirs: [skillDir("component-patterns")], idleTimeoutMs: 240_000 }),
  ...scripted,
  assertions: [
    { type: "glob-count", glob: "**/*.ts", min: 2 },
    { type: "tool-called", name: "Write", minTimes: 1 },
    {
      type: "command-exits-zero",
      name: "imports from @prismatic-io/spectral",
      command: 'grep -rqE --exclude-dir=node_modules "@prismatic-io/spectral([\\"\'/]|$)" .',
    },
    {
      type: "command-exits-zero",
      name: "no made-up spectral-sdk package",
      command: '! grep -rq --exclude-dir=node_modules "@prismatic-io/spectral-sdk" .',
    },
    {
      type: "command-exits-zero",
      name: "has a rawRequest action",
      command: "grep -rqi --exclude-dir=node_modules rawRequest .",
    },
    {
      type: "command-exits-zero",
      name: "defines component-level error hooks",
      command: 'grep -rqE --exclude-dir=node_modules "hooks\\s*:" .',
    },
    {
      type: "rubric",
      name: "component-level hooks.error handler",
      criteria:
        "The component definition includes a hooks.error handler at the component level — not just try/catch inside individual actions.",
    },
    {
      type: "rubric",
      name: "actions return { data }",
      criteria:
        "Actions return an object shaped as { data: <result> } — not the raw value, and not { result: ... } or { output: ... }.",
    },
    {
      type: "rubric",
      name: "function-based HTTP client",
      criteria:
        "The HTTP client is function-based (e.g. createClient(connection, debug)), not a class-based client.",
    },
  ],
  meta: { skill: "component-patterns", tags: ["component", "api-key", "ci"] },
});
