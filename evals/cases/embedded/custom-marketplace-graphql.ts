import { defineEvalCase, type Run, toolCallInputs } from "@prismatic-io/lux";
import { calledPlatform, claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins the custom-marketplace pattern: fetch data via the marketplaceIntegrations
// GraphQL query, delegate first-time setup to prismatic.configureInstance and inline
// reconfiguration of an existing instance to prismatic.editInstanceConfiguration (never a
// rebuilt wizard). Non-tautology: the prompt names no API; all symbols come only from
// custom-marketplace-ui.md.
export default defineEvalCase({
  id: "embedded/custom-marketplace-graphql",
  prompt: withSkill(
    "embedded-patterns",
    `Instead of the Prismatic marketplace iframe, we want to render our own marketplace
UI as native cards that match our design system. How do we get the list of integrations
to display, and when a user clicks a card to set one up, how should the actual
configuration happen? Also: for an integration a customer has ALREADY connected, we want a
card action that lets them tweak that instance's settings inline inside our own dialog —
not a popup, and without making them click through an extra "reconfigure" screen first.
Give me the approach and the code — do NOT run anything against my account and don't check
my auth.`,
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
      name: "delegates first-time setup to prismatic.configureInstance",
      pattern: "configureInstance",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "reconfigures an existing instance inline via editInstanceConfiguration",
      pattern: "editInstanceConfiguration",
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
        "The answer fetches integration data with prismatic.graphqlRequest using the marketplaceIntegrations query, renders the developer's own card UI, delegates first-time setup to Prismatic's wizard via prismatic.configureInstance (by integrationName), and for an already-connected integration reconfigures the existing instance inline in the developer's own dialog via prismatic.editInstanceConfiguration({ instanceId, selector }) rather than a popover or an intermediate reconfigure screen; it explicitly does NOT recreate the config wizard as custom UI and executes nothing.",
    },
  ],
  meta: { skill: "embedded-patterns", tags: ["embedded", "custom-marketplace", "graphql"] },
});
