#!/usr/bin/env npx tsx
/**
 * lint-plugin.ts — Static manifest-integrity linter for the Prismatic plugin.
 *
 * Run: npx tsx plugin/scripts/lint-plugin.ts
 *
 * Validates cross-references otherwise only caught at runtime (or not at all). Exits
 * non-zero, printing `file:line: message` per defect, when:
 *
 *   - a command's frontmatter names an agent/skill that does not exist on disk
 *   - an agent's frontmatter `skills:` names a skill dir that does not exist
 *   - a ${CLAUDE_PLUGIN_ROOT}-relative path in hooks.json / commands does not resolve
 *   - tool-manifest.json names a `script` that run.ts cannot dispatch to
 *   - two scripts across run.ts's SEARCH_DIRS share a basename (first-match-wins collision)
 *   - plugin.json `name` != the marketplace.json plugin entry `name`
 *   - a hook file referenced by hooks.json is missing
 *
 * No external deps — a tiny frontmatter reader stands in for a YAML lib.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)); // plugin/scripts
const PLUGIN_DIR = dirname(HERE); // plugin
const REPO_ROOT = dirname(PLUGIN_DIR); // repo root

const COMMANDS_DIR = join(PLUGIN_DIR, "commands");
const AGENTS_DIR = join(PLUGIN_DIR, "agents");
const SKILLS_DIR = join(PLUGIN_DIR, "skills");
const SCRIPTS_DIR = join(PLUGIN_DIR, "scripts");
const HOOKS_JSON = join(PLUGIN_DIR, "hooks", "hooks.json");
const TOOL_MANIFEST = join(PLUGIN_DIR, "hooks", "tool-manifest.json");
const PLUGIN_JSON = join(PLUGIN_DIR, ".claude-plugin", "plugin.json");
const MARKETPLACE_JSON = join(REPO_ROOT, ".claude-plugin", "marketplace.json");

// Kept in lockstep with run.ts's SEARCH_DIRS (order matters — first match wins).
const SEARCH_DIRS = [
  SCRIPTS_DIR,
  join(SCRIPTS_DIR, "integrations"),
  join(SCRIPTS_DIR, "shared"),
  join(SCRIPTS_DIR, "components"),
  join(SCRIPTS_DIR, "migration"),
];

// biome-ignore lint/suspicious/noTemplateCurlyInString: the literal Claude Code plugin-root token is exactly what we search command/hook text for.
const PLUGIN_ROOT_TOKEN = "${CLAUDE_PLUGIN_ROOT}";

type Finding = { file: string; line: number; message: string };
const findings: Finding[] = [];
const err = (file: string, line: number, message: string): void => {
  findings.push({ file, line, message });
};

/** 1-based line number of the first line matching `needle` (string or RegExp), else 1. */
function lineOf(content: string, needle: string | RegExp): number {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (typeof needle === "string" ? lines[i].includes(needle) : needle.test(lines[i])) {
      return i + 1;
    }
  }
  return 1;
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

type FmLine = { n: number; text: string };

/**
 * Return the frontmatter body as {lineNo, text} pairs (line numbers absolute to
 * the file). Frontmatter is the block between the first two `---` fences.
 */
function frontmatterLines(content: string): FmLine[] {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return [];
  const out: FmLine[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") break;
    out.push({ n: i + 1, text: lines[i] });
  }
  return out;
}

/** First top-level (indent-0) scalar `key: value` in the frontmatter. */
function scalarField(fm: FmLine[], key: string): { value: string; line: number } | null {
  const re = new RegExp(`^${key}:[ \\t]*(.*)$`);
  for (const { n, text } of fm) {
    const m = text.match(re);
    if (m) return { value: stripQuotes(m[1]), line: n };
  }
  return null;
}

/**
 * Items of a top-level block/flow sequence `key:` in the frontmatter.
 * Handles both `- item` block lists and inline `[a, b]` flow lists.
 */
function listField(fm: FmLine[], key: string): { name: string; line: number }[] {
  const out: { name: string; line: number }[] = [];
  const headRe = new RegExp(`^([ \\t]*)${key}:[ \\t]*(.*)$`);
  let inList = false;
  let headIndent = 0;
  for (const { n, text } of fm) {
    if (!inList) {
      const m = text.match(headRe);
      if (!m) continue;
      const rest = m[2].trim();
      if (rest.startsWith("[")) {
        for (const it of rest.replace(/^\[/, "").replace(/\]$/, "").split(",")) {
          const name = stripQuotes(it);
          if (name) out.push({ name, line: n });
        }
        return out;
      }
      inList = true;
      headIndent = m[1].length;
      continue;
    }
    if (text.trim() === "") continue;
    const im = text.match(/^([ \t]*)-[ \t]*(.+)$/);
    if (im && im[1].length > headIndent) {
      out.push({ name: stripQuotes(im[2]), line: n });
    } else {
      break; // dedent / next key ends the list
    }
  }
  return out;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 1. run.ts dispatch index — basename -> path (first match wins), + collisions
// ---------------------------------------------------------------------------

const scriptIndex = new Map<string, string>();
for (const dir of SEARCH_DIRS) {
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    continue;
  }
  for (const f of files.sort()) {
    if (!f.endsWith(".ts")) continue;
    const full = join(dir, f);
    try {
      if (!statSync(full).isFile()) continue;
    } catch {
      continue;
    }
    if (full === join(SCRIPTS_DIR, "run.ts")) continue;
    const name = basename(f, ".ts");
    const existing = scriptIndex.get(name);
    if (existing) {
      // First match wins in run.ts; this later file is unreachable via dispatch.
      err(
        full,
        1,
        `script basename "${name}" collides with ${existing.replace(`${REPO_ROOT}/`, "")} — ` +
          "run.ts SEARCH_DIRS resolve first-match-wins, so this file is unreachable by dispatch",
      );
    } else {
      scriptIndex.set(name, full);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Commands: frontmatter agent/skill references + ${CLAUDE_PLUGIN_ROOT} paths
// ---------------------------------------------------------------------------

let commandCount = 0;
let commandAgentRefs = 0;
try {
  for (const f of readdirSync(COMMANDS_DIR).sort()) {
    if (!f.endsWith(".md")) continue;
    commandCount++;
    const path = join(COMMANDS_DIR, f);
    const content = readFileSync(path, "utf8");
    const fm = frontmatterLines(content);

    const agent = scalarField(fm, "agent");
    if (agent?.value) {
      commandAgentRefs++;
      if (!existsSync(join(AGENTS_DIR, `${agent.value}.md`))) {
        err(
          path,
          agent.line,
          `command references agent "${agent.value}" but agents/${agent.value}.md does not exist`,
        );
      }
    }
    const skill = scalarField(fm, "skill");
    if (skill?.value) {
      if (!isDir(join(SKILLS_DIR, skill.value))) {
        err(
          path,
          skill.line,
          `command references skill "${skill.value}" but skills/${skill.value}/ does not exist`,
        );
      }
    }
  }
} catch (e) {
  err(COMMANDS_DIR, 1, `unable to read commands directory: ${(e as Error).message}`);
}

// ---------------------------------------------------------------------------
// 3. Agents: frontmatter `skills:` references
// ---------------------------------------------------------------------------

let agentCount = 0;
let agentSkillRefs = 0;
try {
  for (const f of readdirSync(AGENTS_DIR).sort()) {
    if (!f.endsWith(".md")) continue;
    agentCount++;
    const path = join(AGENTS_DIR, f);
    const content = readFileSync(path, "utf8");
    const fm = frontmatterLines(content);
    for (const s of listField(fm, "skills")) {
      agentSkillRefs++;
      if (!isDir(join(SKILLS_DIR, s.name))) {
        err(path, s.line, `agent lists skill "${s.name}" but skills/${s.name}/ does not exist`);
      }
    }
  }
} catch (e) {
  err(AGENTS_DIR, 1, `unable to read agents directory: ${(e as Error).message}`);
}

// ---------------------------------------------------------------------------
// 4. ${CLAUDE_PLUGIN_ROOT}-relative paths in hooks.json and commands must resolve.
//    (Also satisfies "a hook file referenced by hooks.json is missing".)
// ---------------------------------------------------------------------------

let pluginRootPathCount = 0;
const PATH_RE = /\$\{CLAUDE_PLUGIN_ROOT\}[^\s`"'\\)]*/g;

function checkPluginRootPaths(path: string): void {
  const content = readFileSync(path, "utf8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const matches = lines[i].match(PATH_RE);
    if (!matches) continue;
    for (const token of matches) {
      pluginRootPathCount++;
      const rel = token.slice(PLUGIN_ROOT_TOKEN.length).replace(/^\//, "");
      const resolved = resolve(PLUGIN_DIR, rel);
      if (!existsSync(resolved)) {
        err(path, i + 1, `${PLUGIN_ROOT_TOKEN} path does not resolve: ${token} -> ${resolved}`);
      }
    }
  }
}

if (existsSync(HOOKS_JSON)) {
  checkPluginRootPaths(HOOKS_JSON);
} else {
  err(HOOKS_JSON, 1, "hooks.json is missing");
}
try {
  for (const f of readdirSync(COMMANDS_DIR).sort()) {
    if (f.endsWith(".md")) checkPluginRootPaths(join(COMMANDS_DIR, f));
  }
} catch {
  /* reported above */
}

// ---------------------------------------------------------------------------
// 5. tool-manifest.json: every synthetic `script` must be dispatchable by run.ts;
//    every explicit key is likewise a script name commands invoke through run.ts.
// ---------------------------------------------------------------------------

let manifestScriptCount = 0;
if (existsSync(TOOL_MANIFEST)) {
  const rawManifest = readFileSync(TOOL_MANIFEST, "utf8");
  const manifest = JSON.parse(rawManifest) as {
    synthetic?: Record<string, { script?: string }>;
    explicit?: Record<string, string>;
  };
  for (const [toolName, entry] of Object.entries(manifest.synthetic ?? {})) {
    const script = entry?.script;
    if (!script) {
      err(
        TOOL_MANIFEST,
        lineOf(rawManifest, `"${toolName}"`),
        `synthetic tool "${toolName}" has no "script" field`,
      );
      continue;
    }
    manifestScriptCount++;
    if (!scriptIndex.has(script)) {
      err(
        TOOL_MANIFEST,
        lineOf(rawManifest, new RegExp(`"script"\\s*:\\s*"${script}"`)),
        `synthetic tool "${toolName}" names script "${script}" that run.ts cannot dispatch to (no ${script}.ts in any SEARCH_DIR)`,
      );
    }
  }
  for (const toolName of Object.keys(manifest.explicit ?? {})) {
    manifestScriptCount++;
    if (!scriptIndex.has(toolName)) {
      err(
        TOOL_MANIFEST,
        lineOf(rawManifest, new RegExp(`"${toolName}"\\s*:`)),
        `explicit tool "${toolName}" names script that run.ts cannot dispatch to (no ${toolName}.ts in any SEARCH_DIR)`,
      );
    }
  }
} else {
  err(TOOL_MANIFEST, 1, "tool-manifest.json is missing");
}

// ---------------------------------------------------------------------------
// 6. plugin.json name == marketplace.json plugin entry name
// ---------------------------------------------------------------------------

let pluginName = "";
if (existsSync(PLUGIN_JSON)) {
  pluginName = (readJson(PLUGIN_JSON) as { name?: string }).name ?? "";
  if (!pluginName) err(PLUGIN_JSON, 1, "plugin.json has no `name`");
} else {
  err(PLUGIN_JSON, 1, "plugin.json is missing");
}

if (existsSync(MARKETPLACE_JSON)) {
  const rawMarket = readFileSync(MARKETPLACE_JSON, "utf8");
  const market = JSON.parse(rawMarket) as {
    plugins?: { name?: string; source?: { path?: string } }[];
  };
  const plugins = market.plugins ?? [];
  // Prefer the entry pointing at the `plugin` subdir; else the sole entry.
  const entry =
    plugins.find((p) => p.source?.path === "plugin") ??
    (plugins.length === 1 ? plugins[0] : undefined);
  if (!entry) {
    err(
      MARKETPLACE_JSON,
      1,
      `no marketplace plugin entry matches plugin.json name "${pluginName}"`,
    );
  } else if (entry.name !== pluginName) {
    err(
      MARKETPLACE_JSON,
      lineOf(rawMarket, `"${entry.name}"`),
      `marketplace plugin entry name "${entry.name}" != plugin.json name "${pluginName}"`,
    );
  }
} else {
  err(MARKETPLACE_JSON, 1, "marketplace.json is missing");
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (findings.length > 0) {
  findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
  for (const f of findings) {
    console.error(`${f.file}:${f.line}: ${f.message}`);
  }
  console.error(`\nlint-plugin: ${findings.length} problem(s) found.`);
  process.exit(1);
}

console.log(
  `lint-plugin: OK — ${commandCount} commands (${commandAgentRefs} agent refs), ` +
    `${agentCount} agents (${agentSkillRefs} skill refs), ${scriptIndex.size} dispatchable scripts, ` +
    `${manifestScriptCount} manifest entries, ${pluginRootPathCount} \${CLAUDE_PLUGIN_ROOT} paths, ` +
    `plugin name "${pluginName}" matches marketplace.`,
);
process.exit(0);
