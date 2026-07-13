import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Non-tautology: the prompt never names configVar(/stableKey or the field names, and
// hubspot_owner_id exists only in the staged parsed-export.json — matching it proves the
// answer is grounded in the fixture.
export default defineEvalCase({
  id: "cyclr-migration/sharefields-to-configvar",
  prompt: withSkill(
    "cyclr-migration",
    `A Cyclr export has already been parsed into ./parsed-export.json in the current
working directory. Read that file. The cycle exposes share fields for end users. Show me
how each of those share fields becomes a customer-configurable setting in the Prismatic
Code Native Integration — give me the exact TypeScript I would write for each. Do not run
any parsers or platform tools; ground everything in the parsed export that is already
present.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("cyclr-migration")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 2,
  }),
  fixtures: { kind: "dir", path: "cyclr-parsed-export" },
  ...scripted,
  assertions: [
    {
      type: "glob-count",
      glob: "**/parsed-export.json",
      min: 1,
      name: "the parsed export was staged into the working dir",
    },
    {
      type: "regex",
      name: "uses the configVar( wrapper (not connectionConfigVar/dataSourceConfigVar)",
      pattern: "configVar\\s*\\(",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "grounds in the fixture's share field hubspot_owner_id",
      pattern: "hubspot_owner_id",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "both share fields -> configVar with stableKey/dataType",
      criteria:
        "Reads the staged parsed-export.json and maps BOTH share fields (hubspot_owner_id and sync_batch_size) to config variables written with the configVar wrapper carrying stableKey and dataType, treating ShareFields as launch-visible/customer-configurable. The export defines no default values, so a defaultValue may be included or reasonably omitted — do not penalize either choice. It fabricates no connection credentials or config variables absent from the export.",
    },
  ],
  meta: { skill: "cyclr-migration", tags: ["migration", "cyclr", "fixtures", "config-var"] },
});
