import {
  allCoreAssertions,
  claudeCodeDriver,
  type LuxConfig,
  personaAnswerer,
  rubricAssertion,
  scriptedAnswerer,
} from "@prismatic-io/lux";

const config: LuxConfig = {
  casesRoot: "./cases",
  fixturesRoot: "./fixtures",
  runsRoot: "./.lux-runs",
  defaultAnswerer: "scripted",
  drivers: [claudeCodeDriver],
  // `scripted` is the deterministic default; `persona` simulates a real
  // user for HITL cases. Both run on the local `claude` CLI — no API key.
  answerers: [scriptedAnswerer, personaAnswerer],
  // lux's rubric judge also drives the local `claude` CLI (no API key,
  // runs on your Claude subscription) — no custom assertion needed.
  assertions: [...allCoreAssertions, rubricAssertion],
};

export default config;
