import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// The prompt supplies only Boomi tokens (disk-sdk, LIST/GET/CREATE); the SFTP component
// and the download/upload action names come only from the Connector Type Mapping table.
export default defineEvalCase({
  id: "boomi-migration/connector-disk-sdk-to-sftp",
  prompt: withSkill(
    "boomi-migration",
    `In a Boomi export I have a Connector Action shape that uses the Disk SDK connector
(its 'subType' is 'disk-sdk'). One operation's 'custom_operation_type' is 'LIST',
another is 'GET', and another is 'CREATE'. Which Prismatic component do these map to,
and which action of that component handles each of the three operations? Answer from the
mapping rules only — do not run any tools and do not check my platform auth.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("boomi-migration")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "maps the Disk SDK connector to the SFTP component",
      pattern: "SFTP",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "GET -> SFTP download",
      pattern: "download",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "CREATE -> SFTP upload",
      pattern: "upload",
      flags: "i",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "disk-sdk -> SFTP with all three operation mappings correct",
      criteria:
        "The response maps the Boomi Disk SDK (disk-sdk) connector to the Prismatic SFTP component and pairs LIST->SFTP list, GET->SFTP download, CREATE->SFTP upload; it does not invent a generic disk/file component and leaves no operation unspecified.",
    },
  ],
  meta: { skill: "boomi-migration", tags: ["migration", "boomi", "connector", "sftp"] },
});
