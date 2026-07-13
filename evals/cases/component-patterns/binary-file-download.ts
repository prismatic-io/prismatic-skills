import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins the binary-download recipe: responseType "arraybuffer" (Buffer body) and a
// { data, contentType } return, via the Spectral client rather than a raw HTTP lib.
// Non-tautology: the prompt describes the task in plain English and names no SDK specifics.
export default defineEvalCase({
  id: "component-patterns/binary-file-download",
  prompt: withSkill(
    "component-patterns",
    `Generate a Prismatic custom component action that retrieves a file (for example a
generated PDF report) from an API endpoint and returns its raw bytes, along with
enough metadata that a downstream step can save it with the correct type. Write the
file(s) into the current working directory. Follow Prismatic conventions exactly.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("component-patterns")],
    idleTimeoutMs: 300_000,
    maxInterrupts: 4,
  }),
  ...scripted,
  assertions: [
    { type: "glob-count", glob: "**/*.ts", min: 1, name: "wrote a source file" },
    {
      type: "command-exits-zero",
      name: "requests the body as an arraybuffer",
      command: 'grep -rqi --exclude-dir=node_modules "arraybuffer" .',
    },
    {
      type: "command-exits-zero",
      name: "returns a contentType from the response headers",
      command: 'grep -rqi --exclude-dir=node_modules "contentType" .',
    },
    {
      type: "command-exits-zero",
      name: "uses the Spectral client, not a raw HTTP lib",
      command:
        '! grep -rqE --exclude-dir=node_modules "(from |require\\()[\'\\"](axios|node-fetch|got|undici)[\'\\"]" .',
    },
    {
      type: "rubric",
      name: "arraybuffer download returning { data: Buffer, contentType }",
      criteria:
        'The action fetches the file through the Spectral HTTP client with responseType: "arraybuffer" so response data is a Buffer, and returns { data: <Buffer>, contentType } whose contentType comes from the response content-type header rather than JSON-parsing the body or dropping the type.',
    },
  ],
  meta: { skill: "component-patterns", tags: ["component", "binary", "download"] },
});
