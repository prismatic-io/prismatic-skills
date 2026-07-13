import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins the custom-marketplace pattern: fetch data via the marketplaceIntegrations
// GraphQL query, delegate configuration to prismatic.configureInstance (not a rebuilt
// wizard). Non-tautology: the prompt names no API; both symbols come only from
// custom-marketplace-ui.md.
export default defineEvalCase({
  id: "embedded/custom-marketplace-graphql",
  prompt: withSkill(
    "embedded-patterns",
    `Instead of the Prismatic marketplace iframe, we want to render our own marketplace
UI as native cards that match our design system. How do we get the list of integrations
to display, and when a user clicks a card to set one up, how should the actual
configuration happen? Give me the approach and the code — do NOT run anything against my
account and don't check my auth.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("embedded-patterns")],
    idleTimeoutMs: 180_000,
    maxInterrupts: 3,
  }),
  ...scripted,
  assertions: [
    {
      type: "regex",
      name: "fetches the list via the marketplaceIntegrations query",
      pattern: "marketplaceIntegrations",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "delegates config to prismatic.configureInstance",
      pattern: "configureInstance",
      against: "transcript-all",
    },
    {
      type: "predicate",
      name: "did not run anything against the account",
      fn: (run: Run) =>
        !calledPlatform(run) && !toolCallInputs(run).some((i) => i.includes("graphql:query")),
    },
    {
      type: "rubric",
      name: "graphqlRequest for data, own UI, config delegated (not rebuilt)",
      criteria:
        "The answer fetches integration data with prismatic.graphqlRequest using the marketplaceIntegrations query, renders the developer's own card UI, and on card click delegates the actual configuration to Prismatic's wizard via prismatic.configureInstance (by integrationName, or by instanceId/firstDeployedInstance for an existing instance); it explicitly does NOT recreate the config wizard as custom UI and executes nothing.",
    },
  ],
  meta: { skill: "embedded-patterns", tags: ["embedded", "custom-marketplace", "graphql"] },
});
