import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, skillDir, withSkill } from "../_support.ts";

// HITL: the task defers the auth-scheme choice to the user, so the agent must ask
// before writing the connection. Headless `claude --output-format stream-json` is not
// offered AskUserQuestion (CLI 2.1.206), so the agent asks in prose and ends its turn;
// grading is a transcript rubric plus a deterministic check that no code was written.
// The persona documents the intended user and engages if an ask interrupt ever fires.
export default defineEvalCase({
  id: "component-patterns/persona-auth-choice",
  prompt: withSkill(
    "component-patterns",
    `Build a minimal Prismatic custom component for our internal HTTP API with a
single GET action. The API supports more than one authentication scheme and I
have a specific preference — ask me which authentication scheme to use before
you write the connection, then follow whatever I choose.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("component-patterns")],
    idleTimeoutMs: 240_000,
    maxInterrupts: 4,
  }),
  answerer: { name: "persona" },
  persona: `You are a backend engineer wiring an internal HTTP API into Prismatic. The
API sits behind a gateway that issues static API keys, so you want API key
authentication (header-based). You explicitly do NOT want OAuth2 — it is not
configured for this internal service. Answer briefly and concretely.`,
  assertions: [
    {
      type: "glob-count",
      name: "waits for the answer — writes no connection code before asking",
      glob: "**/*.ts",
      max: 0,
    },
    {
      type: "rubric",
      name: "asks which auth scheme before writing, defers to the user",
      criteria:
        "Before writing any connection or component code, the agent asked the user which authentication scheme the connection should use and deferred that decision to the user rather than choosing one itself. API key authentication is surfaced among the options it presents. Score low if the agent picked an auth scheme unilaterally, wrote the connection before asking, or never asked at all.",
    },
  ],
  meta: { skill: "component-patterns", tags: ["component", "hitl", "persona"] },
});
