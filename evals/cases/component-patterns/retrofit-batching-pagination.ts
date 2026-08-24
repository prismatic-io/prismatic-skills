import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, skillDir, withSkill } from "../_support.ts";

// Retrofit that converts an internal fetch-all loop to batchable pagination. Non-tautology: the
// prompt describes the symptom (drains every page in one perform, runs out of memory on big
// accounts) and the goal (page it, keep deployed flows working); it names neither
// getNextPaginationState nor the watermark-on-final-page rule. retrofit-batching-triggers.md is the
// only source of the cursor/watermark separation and the sibling-vs-in-place decision.
export default defineEvalCase({
  id: "component-patterns/retrofit-batching-pagination",
  prompt: withSkill(
    "component-patterns",
    `This PUBLISHED Prismatic polling trigger drains every page inside one perform and runs out of
memory on large accounts. Retrofit it so it pages the source instead and can batch each page,
without breaking the integrations already deployed on it.

Current trigger (src/triggers/pollOrders.ts):

    export const pollOrders = pollingTrigger({
      display: { label: "New and Updated Orders", description: "Checks for new and updated orders on a schedule." },
      inputs: pollOrdersInputs,
      perform: async (context, payload, params) => {
        const client = createClient(params.connection);
        const state = context.polling.getState();
        const since = (state.lastPolledAt as string) || new Date().toISOString();
        const orders = [];
        let after: string | undefined;
        do {
          const page = await client.listOrders({ since, after }); // { results, nextCursor }
          orders.push(...page.results);
          after = page.nextCursor;
        } while (after); // internal fetch-all: materializes every page
        context.polling.setState({ lastPolledAt: new Date().toISOString() });
        return { payload: { ...payload, body: { data: { orders } } }, polledNoChanges: orders.length === 0 };
      },
    });

Write the updated/new file(s) into the current working directory. Do NOT install packages, build,
deploy, or check auth. When done, reply with the files you changed and a 3-4 sentence note on how
you handled the cursor, the watermark, and backward compatibility.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("component-patterns")],
    idleTimeoutMs: 300_000,
    maxInterrupts: 5,
  }),
  assertions: [
    { type: "glob-count", glob: "**/*.ts", min: 1, name: "wrote a trigger source file" },
    {
      type: "command-exits-zero",
      name: "pages via getNextPaginationState instead of an internal loop",
      command: 'grep -rq --exclude-dir=node_modules "getNextPaginationState" .',
    },
    {
      type: "command-exits-zero",
      name: "reads the page cursor from payload.paginationState",
      command: 'grep -rq --exclude-dir=node_modules "paginationState" .',
    },
    {
      type: "command-exits-zero",
      name: "still persists a watermark via context.polling.setState",
      command: 'grep -rq --exclude-dir=node_modules "polling.setState" .',
    },
    {
      type: "rubric",
      name: "cursor + watermark separated, watermark on final page, backward-compatible placement",
      criteria:
        'Judge the retrofit. The internal do/while fetch-all loop is replaced by one page per perform: perform reads the incoming cursor from payload.paginationState, fetches ONE page, and getNextPaginationState returns the next cursor or null. The two pieces of state are handled distinctly: the PAGE CURSOR rides in payload.paginationState, and the cross-run WATERMARK (lastPolledAt / since) is committed via context.polling.setState ONLY when the drain finishes (next cursor null), never advanced mid-drain. Because this changes perform control flow it is NOT purely additive, so it is placed backward-compatibly — either a new "(Batched)" sibling trigger with a new export key (leaving pollOrders untouched) OR a dual-mode that preserves unbatched completeness by resuming the cursor from polling state across runs. triggerResolverSupport is "valid". Fail for: keeping the internal fetch-all loop, advancing the watermark on every page, a breaking in-place change to the published trigger with no sibling and no unbatched-completeness handling, or triggerResolverSupport "required".',
    },
  ],
  meta: {
    skill: "component-patterns",
    tags: ["component", "trigger", "batching", "retrofit", "pagination"],
  },
});
