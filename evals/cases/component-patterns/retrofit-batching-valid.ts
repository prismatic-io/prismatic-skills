import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, skillDir, withSkill } from "../_support.ts";

// Backward-compatible retrofit of a PUBLISHED trigger. Non-tautology: the prompt describes the
// constraint (already deployed, don't break existing flows) and names none of the asserted
// symbols. The retrofit-batching-triggers.md contract is the only source of "valid" (not
// "required"), the converting resolver, and the unchanged-export rule. The tempting wrong answer
// is the net-new shape (triggerResolverSupport: "required") or renaming the export.
export default defineEvalCase({
  id: "component-patterns/retrofit-batching-valid",
  prompt: withSkill(
    "component-patterns",
    `This Prismatic custom component polling trigger is ALREADY PUBLISHED and used by deployed
integrations. Add batching to it so builders who want it can dispatch each changed record as its
own execution — without changing anything for the flows already running on it today.

Current trigger (in src/triggers/pollContactChanges.ts):

    export const pollContactChanges = pollingTrigger({
      display: { label: "New and Updated Contacts", description: "Checks for new and updated contacts on a schedule." },
      inputs: pollContactChangesInputs,
      perform: async (context, payload, params) => {
        const client = createClient(params.connection);
        const state = context.polling.getState();
        const since = (state.lastPolledAt as string) || new Date().toISOString();
        const contacts = await client.listContactsChangedSince(since); // returns all matching records
        context.polling.setState({ lastPolledAt: new Date().toISOString() });
        const changesObject = {
          createdRecords: contacts.filter((c) => c.createdAt > since),
          updatedRecords: contacts.filter((c) => c.createdAt <= since),
        };
        return { payload: { ...payload, body: { data: changesObject } }, polledNoChanges: contacts.length === 0 };
      },
    });

Write the updated file(s) into the current working directory. Do NOT install packages, build,
deploy, or check auth. When done, reply with the files you changed and a 2-3 sentence note on how
you kept it backward compatible.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("component-patterns")],
    idleTimeoutMs: 300_000,
    maxInterrupts: 4,
  }),
  assertions: [
    { type: "glob-count", glob: "**/*.ts", min: 1, name: "wrote a trigger source file" },
    {
      type: "command-exits-zero",
      name: 'batching is opt-in: triggerResolverSupport is "valid"',
      command: `grep -rqE --exclude-dir=node_modules "triggerResolverSupport:[[:space:]]*[\\"']valid[\\"']" .`,
    },
    {
      type: "command-exits-zero",
      name: 'does NOT force batching with "required"',
      command: `! grep -rqE --exclude-dir=node_modules "triggerResolverSupport:[[:space:]]*[\\"']required[\\"']" .`,
    },
    {
      type: "command-exits-zero",
      name: "keeps the published export name pollContactChanges",
      command: 'grep -rqE --exclude-dir=node_modules "pollContactChanges" .',
    },
    {
      type: "command-exits-zero",
      name: "declares a triggerResolver with resolveItems and a bounded concurrentBatchLimit",
      command:
        'grep -rq --exclude-dir=node_modules "resolveItems" . && grep -rqE --exclude-dir=node_modules "concurrentBatchLimit:[[:space:]]*[0-9]+" .',
    },
    {
      type: "rubric",
      name: "opt-in valid retrofit, converting resolver, unchanged unbatched payload, no rename",
      criteria:
        'Judge the retrofit. It sets triggerResolverSupport: "valid" (batching opt-in), NOT "required". It adds a batchConfig with a bounded concurrentBatchLimit and a triggerResolver whose resolveItems CONVERTS the existing { createdRecords, updatedRecords } envelope into a flat array of tagged items (it is not a bare passthrough, since the payload is an envelope, not an array) and tolerates absent arrays. The unbatched perform still returns the same body.data envelope shape it did before — the resolver reads that payload, it does not reshape it. The published export name pollContactChanges is unchanged. Fail for: triggerResolverSupport "required", a renamed/removed export, a changed unbatched payload shape, or a resolver that assumes both arrays are always present.',
    },
  ],
  meta: {
    skill: "component-patterns",
    tags: ["component", "trigger", "batching", "retrofit"],
  },
});
