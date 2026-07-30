import { fileURLToPath } from "node:url";
import type { LuxConfig } from "@prismatic-io/lux";

const config: LuxConfig = {
  casesRoot: "./cases",
  fixturesRoot: "./fixtures",
  runsRoot: "./.lux-runs",
  defaultAnswerer: {
    name: "scripted",
    config: { fixturePath: fileURLToPath(new URL("./fixtures/default.yaml", import.meta.url)) },
  },
  harness: {
    provider: "claude-code",
    model: "claude-sonnet-5",
    reasoningEffort: "medium",
  },
};

export default config;
