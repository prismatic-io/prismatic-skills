import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Non-tautology: the prompt never names from_path/to_path/type or properties.email, and
// the fixture itself uses source_path/target_path — so `from_path` in the transcript can
// only come from applying the skill's documented standard-schema shape.
export default defineEvalCase({
  id: "cyclr-migration/fieldmapping-to-transform",
  prompt: withSkill(
    "cyclr-migration",
    `A Cyclr export has already been parsed into ./parsed-export.json in the current
working directory. Read that file. The 'Create HubSpot Contact' step carries field
mappings from the Salesforce lead. Express those mappings as a single
data-transformation entry in the standard integration schema. Do not run any parsers or
platform tools; use only the parsed export that is already present.`,
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
      name: "uses the standard-schema key from_path (fixture uses source_path)",
      pattern: "from_path",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "grounds in the fixture's HubSpot target path properties.email",
      pattern: "properties\\.email",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "all four mappings in one transform entry with documented shape",
      criteria:
        "Reads the staged export and expresses the four Salesforce-lead -> HubSpot-contact field mappings (Lead.Email->properties.email, Lead.FirstName->properties.firstname, Lead.LastName->properties.lastname, Lead.Company->properties.company) as one data-transformation entry containing source_step/target_step and a mappings array of {from_path, to_path, type} objects; all four are present and correct, none invented or dropped.",
    },
  ],
  meta: { skill: "cyclr-migration", tags: ["migration", "cyclr", "fixtures", "transform"] },
});
