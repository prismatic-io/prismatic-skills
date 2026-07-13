import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins the exact prismatic.init config keys from theming-and-i18n.md. Non-tautology:
// the prompt is natural-language only and contains none of fontConfiguration,
// `initializing`, or integration-marketplace__filterBar.
export default defineEvalCase({
  id: "embedded/theming-and-i18n-config",
  prompt: withSkill(
    "embedded-patterns",
    `For our embedded Prismatic marketplace I want to force a dark theme, use the Inter
Google Font, set a custom background color on the loading screen, and translate the
marketplace filter-bar buttons into French. Show me the single prismatic.init
configuration that does all of this. Don't run anything against my account.`,
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
      name: "custom font passed as fontConfiguration",
      pattern: "fontConfiguration",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "loading screen under screenConfiguration.initializing",
      // The key-colon form avoids matching prose like "when initializing".
      pattern: "initializing\\s*:",
      against: "transcript-all",
    },
    {
      type: "regex",
      name: "French translations under the documented filter-bar phrase-key namespace",
      pattern: "integration-marketplace__filterBar",
      against: "transcript-all",
    },
    {
      type: "rubric",
      name: "all four features in one prismatic.init with correct key shapes",
      criteria:
        'A single prismatic.init call configures all four: theme forced to "DARK"; Inter via fontConfiguration.google.families containing "Inter"; loading-screen appearance under screenConfiguration.initializing with a background; and French filter-bar translations under translation.phrases keyed by real keys such as integration-marketplace__filterBar.allButton; it invents no config keys and executes nothing.',
    },
  ],
  meta: { skill: "embedded-patterns", tags: ["embedded", "theming", "i18n"] },
});
