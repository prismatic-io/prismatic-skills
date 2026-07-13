import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Per-shape mapping with the LISTEN->webhook discriminator: the prompt names no shape or
// target, so "webhook" requires reading shape1's actionType=LISTEN in the staged XML (a
// start shape maps to a webhook only for connector LISTEN; a default/noaction start is
// scheduled/manual), and "return"/"termination" come only from the mapping doc.
export default defineEvalCase({
  id: "boomi-migration/fixture-shape-to-cni-mapping",
  prompt: withSkill(
    "boomi-migration",
    `The MAIN process XML from a Boomi export is in the current working directory. Read
it, and for each shape in that process give the exact Prismatic CNI equivalent it maps
to. Do not run external tools — just read the file and apply the mapping rules.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("boomi-migration")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 2,
  }),
  fixtures: { kind: "dir", path: "boomi-export-sample" },
  ...scripted,
  assertions: [
    { type: "tool-called", name: "Read", minTimes: 1 },
    {
      type: "regex",
      name: "start (connector LISTEN) -> webhook trigger",
      pattern: "webhook",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "stop -> flow termination / return",
      pattern: "return|terminat",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "all four shapes mapped correctly and grounded in the file",
      criteria:
        "For the MAIN Order Sync process the analysis maps each shape correctly and grounds each in the file: the start shape (a connector LISTEN) to a webhook trigger rather than a scheduled/manual trigger; the map shape to a data transformation implemented as a TypeScript function; the connector action (HTTP SEND) to a component action or HTTP call; and the stop shape to flow termination / a return statement.",
    },
  ],
  meta: { skill: "boomi-migration", tags: ["migration", "boomi", "fixtures", "shape-mapping"] },
});
