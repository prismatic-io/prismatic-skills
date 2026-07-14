import type { LuxConfig } from "@prismatic-io/lux";

const config: LuxConfig = {
  casesRoot: "./cases",
  fixturesRoot: "./fixtures",
  runsRoot: "./.lux-runs",
  defaultAnswerer: "scripted",
  harness: {
    provider: "claude-code",
    model: "claude-sonnet-5",
    reasoningEffort: "medium",
  },
};

export default config;
