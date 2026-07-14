import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Run, toolCalls } from "@prismatic-io/lux";

// cases/_support.ts -> evals/ -> repo root
const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, "..", "..");
export const PLUGIN_DIR = resolve(REPO_ROOT, "plugin");
export const SKILLS_DIR = resolve(PLUGIN_DIR, "skills");
export const AGENTS_DIR = resolve(PLUGIN_DIR, "agents");

/** Default response fixture for non-HITL cases. */
export const scripted = {
  answerer: {
    name: "scripted" as const,
    config: { fixturePath: resolve(here, "..", "fixtures", "default.yaml") },
  },
};

/**
 * Prompt preamble for a knowledge case: hands the agent the skill's files to
 * follow. Measures the skill's prose, not its activation/hooks — for those,
 * load the real plugin with `claudeCode({ plugin: true })`.
 */
export const withSkill = (skill: string, task: string): string =>
  [
    "A Prismatic Claude Code skill governs this task. Before responding, read it and follow it exactly:",
    "",
    `  - ${SKILLS_DIR}/${skill}/SKILL.md`,
    `  - any files it references under ${SKILLS_DIR}/${skill}/references/`,
    "",
    "Do your work in the current working directory. Then complete this task:",
    "",
    task,
  ].join("\n");

/**
 * Prompt preamble for an agent case without `--agent`: loads the agent
 * definition plus its declared skills, for grading decision logic hermetically.
 * Prefer `claudeCode({ agent })` for the real agent; use this when its real form
 * would call the platform.
 */
export const withAgent = (agent: string, task: string): string =>
  [
    "A Prismatic Claude Code subagent definition governs this task. Before responding,",
    "read it and follow it exactly, including any skills its frontmatter declares:",
    "",
    `  - ${AGENTS_DIR}/${agent}.md`,
    `  - the skills it lists under ${SKILLS_DIR}/`,
    "",
    "Do your work in the current working directory. Then complete this task:",
    "",
    task,
  ].join("\n");

type DriverOverrides = {
  model?: string;
  effort?: "low" | "medium" | "high" | "max";
  idleTimeoutMs?: number;
  maxInterrupts?: number;
  extraArgs?: string[];
  /** Load the real plugin (`--plugin-dir`): skill activation, subagents, commands, hooks. */
  plugin?: boolean;
  /** Route the session to a plugin subagent by name (`--agent`). */
  agent?: string;
  /**
   * Readable directories (`--add-dir`); defaults to none. Never grant REPO_ROOT:
   * `evals/cases/` lives under it, so the agent could read its own assertions.
   */
  readDirs?: string[];
};

/** Shared model and permission defaults. */
export const claudeCode = ({
  model = "claude-sonnet-5",
  effort = "medium",
  idleTimeoutMs = 300_000,
  maxInterrupts = 8,
  extraArgs = [],
  plugin = false,
  agent,
  readDirs = [],
}: DriverOverrides = {}) => ({
  name: "claude-code" as const,
  config: {
    permissionMode: "bypassPermissions" as const,
    askToolName: "AskUserQuestion",
    idleTimeoutMs,
    maxInterrupts,
    model,
    effort,
    ...(plugin || agent ? { pluginDirs: [PLUGIN_DIR] } : {}),
    ...(agent ? { agent } : {}),
    ...(readDirs.length > 0 ? { addDirs: readDirs } : {}),
    extraArgs,
  },
});

/** Read scope for a knowledge case: just the skill under test. */
export const skillDir = (skill: string): string => resolve(SKILLS_DIR, skill);

/** The version plugin.json pins. Read, not hardcoded, so it can't rot at the next bump. */
export const pluginVersion = (): string =>
  (
    JSON.parse(readFileSync(resolve(PLUGIN_DIR, ".claude-plugin", "plugin.json"), "utf-8")) as {
      version: string;
    }
  ).version;

/**
 * True if the run reached the Prismatic platform: a prism_* MCP tool call, or a
 * Bash/WebFetch request to app.prismatic.io. Cases add their own checks for
 * platform-touching CLI tokens in tool inputs.
 */
export const calledPlatform = (run: Run): boolean =>
  toolCalls(run).some(
    (c) =>
      /^(mcp__)?prism_/.test(c.name) ||
      ((c.name === "Bash" || c.name === "WebFetch") &&
        /app\.prismatic\.io/.test(JSON.stringify(c.input ?? {}))),
  );

/** Read scope for an agent case: the agent file's directory plus its skills. */
export const agentReadDirs = (...skills: string[]): string[] => [
  AGENTS_DIR,
  ...skills.map(skillDir),
];
