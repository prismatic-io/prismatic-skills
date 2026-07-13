import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins the dataSourceConfigVar wrapper and literal dataSourceType: "picklist" for a
// paginated dropdown. Non-tautology: the prompt says only "dropdown"/"cursor", so a
// naive configVar with hardcoded options fails both greps.
export default defineEvalCase({
  id: "integration-patterns/data-source-config-wizard",
  prompt: withSkill(
    "integration-patterns",
    `Add a config wizard page to a Code Native Integration that lets the user pick one
item from a dropdown whose options are fetched live from an authenticated API. The
API returns results one page at a time behind a cursor, and some accounts have
thousands of items, so fetch all pages before presenting the dropdown. Write the
config page and its backing data source into the current directory. Don't deploy or
check my auth.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("integration-patterns")],
    idleTimeoutMs: 300_000,
    maxInterrupts: 6,
  }),
  ...scripted,
  assertions: [
    {
      type: "command-exits-zero",
      name: "uses the dataSourceConfigVar wrapper",
      command: 'grep -rq --exclude-dir=node_modules "dataSourceConfigVar(" .',
    },
    {
      type: "command-exits-zero",
      name: 'the data source is a "picklist" dropdown',
      command: `grep -rqE --exclude-dir=node_modules "dataSourceType:[[:space:]]*[\\"']picklist[\\"']" .`,
    },
    {
      type: "rubric",
      name: "picklist data source paginates, returns { result }, connection before data source",
      criteria:
        'The data source is a dataSourceConfigVar of type "picklist" whose perform paginates through every page using a cursor loop bounded by a safety limit, maps each API item to an Element { key, label } (key = value stored, label = text shown), and returns { result: <elements> }; the config page is built with configPage/wrapper functions (never raw object literals) and places the connection/dependency BEFORE the data source; the agent does not deploy or check auth.',
    },
  ],
  meta: {
    skill: "integration-patterns",
    tags: ["cni", "data-source", "config-wizard", "picklist"],
  },
});
