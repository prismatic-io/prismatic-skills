import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

export default defineEvalCase({
  id: "component-patterns/data-source",
  prompt: withSkill(
    "component-patterns",
    `Generate a Prismatic custom component data source that returns a list of
projects the authenticated user can pick from in the Prismatic UI. Write the
file(s) into the current directory.`,
  ),
  driver: claudeCode({ readDirs: [skillDir("component-patterns")], idleTimeoutMs: 180_000 }),
  ...scripted,
  assertions: [
    { type: "glob-count", glob: "**/*.ts", min: 1 },
    {
      type: "command-exits-zero",
      name: "returns a { result } shape",
      // Anchored so a `results` identifier can't satisfy it; only a property does.
      command: 'grep -rqE --exclude-dir=node_modules "(^|[^A-Za-z0-9_])result[[:space:]]*:" .',
    },
    {
      type: "command-exits-zero",
      name: "element uses a key property",
      // TS object literals write `key:` unquoted, so match that form.
      command: 'grep -rqE --exclude-dir=node_modules "(^|[^A-Za-z0-9_])key[[:space:]]*:" .',
    },
    {
      type: "command-exits-zero",
      name: "element does not pair label with value",
      // `{ label, value }` renders blank in the UI; reject the adjacency, not a bare `value:`.
      command:
        '! grep -rqE --exclude-dir=node_modules "label[[:space:]]*:[^,}]*,[[:space:]]*value[[:space:]]*:" .',
    },
    {
      type: "command-exits-zero",
      name: "Element typed from @prismatic-io/spectral",
      command: 'grep -rq --exclude-dir=node_modules "@prismatic-io/spectral" .',
    },
    {
      type: "rubric",
      name: "data source return shape",
      criteria:
        "The data source returns an object with a `result` property containing an array of elements, each shaped { label, key } (not { label, value }, which renders blank in the Prismatic UI). Element is imported/typed from @prismatic-io/spectral, not defined locally or typed as `any`.",
    },
  ],
  meta: { skill: "component-patterns", tags: ["component", "data-source"] },
});
