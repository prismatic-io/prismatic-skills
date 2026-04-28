#!/usr/bin/env npx tsx
/**
 * code-plan.ts
 *
 * Generates a code-gen manifest mapping answered spec items to their
 * cookbook sections, reference files, and implications. The agent runs
 * this as step 1 of code generation so the manifest is fresh in context.
 *
 * USAGE:
 *   prismatic-tools code-plan --session <name> --type component|integration
 *
 * OUTPUT: XML manifest on stdout with <code-plan>, <verify-coverage> blocks.
 *
 * EXIT CODES:
 *   0 - Success
 *   2 - Error (bad files, parse issues)
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadSpec } from "./load-spec.js";
import { getSessionDirectory, getPluginRoot } from "./project-directory.js";

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "skipped" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function parseCookbook(
  content: string,
  answeredSections: Set<string>,
): { preamble: string; sections: Map<string, string> } {
  const lines = content.split("\n");
  const sections = new Map<string, string>();
  const preambleLines: string[] = [];
  let currentHeading = "";
  let currentLines: string[] = [];
  let foundFirstAnswerSection = false;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      const heading = line.replace(/^## /, "").trim();

      if (currentHeading) {
        if (foundFirstAnswerSection) {
          sections.set(currentHeading, currentLines.join("\n"));
        } else {
          preambleLines.push(...currentLines);
        }
      }

      // Check if this heading matches any answered cookbook_section
      const isAnswerSection = answeredSections.has(heading);
      if (isAnswerSection && !foundFirstAnswerSection) {
        // Everything before this was preamble
        preambleLines.push(...currentLines);
        foundFirstAnswerSection = true;
      }

      currentHeading = heading;
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  // Don't forget the last section
  if (currentHeading) {
    if (foundFirstAnswerSection) {
      sections.set(currentHeading, currentLines.join("\n"));
    } else {
      preambleLines.push(...currentLines);
    }
  }

  return { preamble: preambleLines.join("\n"), sections };
}

function main(): number {
  const args = process.argv.slice(2);
  let sessionName = "";
  let sessionType: "integration" | "component" = "integration";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--session" && i + 1 < args.length) {
      sessionName = args[i + 1];
      i++;
    } else if (args[i] === "--type" && i + 1 < args.length) {
      sessionType = args[i + 1] as "integration" | "component";
      i++;
    }
  }

  if (!sessionName) {
    console.error(
      "Usage: prismatic-tools code-plan --session <name> --type <component|integration>",
    );
    return 2;
  }

  // Load spec
  const specName = sessionType === "component" ? "component.yaml" : "integration.yaml";
  const specFile = join(getPluginRoot(), "scripts", "questions", specName);
  let spec: ReturnType<typeof loadSpec>;
  try {
    spec = loadSpec(specFile);
  } catch (e) {
    console.error(`Failed to load spec: ${e}`);
    return 2;
  }

  // Load answers
  const sessionDir = getSessionDirectory(
    sessionName,
    sessionType === "component" ? "components" : "integrations",
  );
  const answersFile = join(sessionDir, "requirements.json");
  let answers: Record<string, unknown> = {};
  try {
    if (existsSync(answersFile)) {
      const raw = JSON.parse(readFileSync(answersFile, "utf-8")) as Record<string, unknown>;
      answers = (
        raw.answers && typeof raw.answers === "object"
          ? (raw.answers as Record<string, unknown>)
          : raw
      ) as Record<string, unknown>;
    }
  } catch (e) {
    console.error(`Failed to load answers: ${e}`);
    return 2;
  }

  // Load and parse cookbook
  const skillName = sessionType === "component" ? "component-patterns" : "integration-patterns";
  const cookbookPath = join(
    getPluginRoot(),
    "skills",
    skillName,
    "references",
    "answer-to-code-cookbook.md",
  );
  let cookbookPreamble = "";
  let cookbookSections = new Map<string, string>();
  if (existsSync(cookbookPath)) {
    const cookbookContent = readFileSync(cookbookPath, "utf-8");
    const answeredSections = new Set<string>();
    // Collect all cookbook_section values from answered items
    for (const [id, item] of Object.entries(spec.items)) {
      if (!isEmpty(answers[id])) {
        const specItem = item as Record<string, unknown>;
        if (specItem.cookbook_section) answeredSections.add(specItem.cookbook_section as string);
      }
    }
    const parsed = parseCookbook(cookbookContent, answeredSections);
    cookbookPreamble = parsed.preamble;
    cookbookSections = parsed.sections;
  }

  // Size budget check: fall back to headings-only if inline content is too large
  let totalInlineLines = cookbookPreamble.split("\n").length;
  for (const [id, item] of Object.entries(spec.items)) {
    if (!isEmpty(answers[id])) {
      const specItem = item as Record<string, unknown>;
      const cs = specItem.cookbook_section as string | undefined;
      if (cs && cookbookSections.has(cs)) {
        totalInlineLines += cookbookSections.get(cs)?.split("\n").length ?? 0;
      }
    }
  }
  const useInline = totalInlineLines <= 3000;

  // Build manifest
  const covered: string[] = [];
  const uncovered: Array<{ key: string; value: string }> = [];

  console.log("<code-plan>");

  // Always include cookbook preamble (import rules, default omission, critical types)
  if (useInline && cookbookPreamble.trim()) {
    const preambleLines = cookbookPreamble.split("\n").length;
    console.log(`  <cookbook-preamble lines="${preambleLines}">`);
    console.log(cookbookPreamble);
    console.log(`  </cookbook-preamble>`);
  }

  for (const [id, item] of Object.entries(spec.items)) {
    const value = answers[id];
    if (isEmpty(value)) continue;

    const specItem = item as Record<string, unknown>;
    const cookbookSection = specItem.cookbook_section as string | undefined;
    const references = specItem.references as
      | Array<{
          file?: string;
          path?: string;
          phase?: string;
          condition?: string;
        }>
      | undefined;
    const implications = specItem.implications as Record<string, string> | undefined;
    const valueStr = typeof value === "string" ? value : JSON.stringify(value);

    const hasCookbook = !!cookbookSection;
    const codeGenRefs = (references ?? []).filter((r) => r.phase?.includes("code-gen"));
    const hasRefs = codeGenRefs.length > 0;

    if (hasCookbook || hasRefs) {
      covered.push(id);
      console.log(`  <answer key="${id}" value="${escapeXml(valueStr)}">`);
      if (hasCookbook && cookbookSection) {
        if (useInline) {
          const sectionContent = cookbookSections.get(cookbookSection);
          if (sectionContent) {
            console.log(`    <cookbook-inline heading="${escapeXml(cookbookSection)}">`);
            console.log(sectionContent);
            console.log(`    </cookbook-inline>`);
          } else {
            // Fallback: emit heading only if section not found
            console.log(`    <cookbook>${escapeXml(cookbookSection)}</cookbook>`);
          }
        } else {
          console.log(`    <cookbook>${escapeXml(cookbookSection)}</cookbook>`);
        }
      }
      if (implications && typeof value === "string" && implications[value]) {
        const imp = implications[value].trim().split("\n")[0];
        console.log(`    <implication>${escapeXml(imp)}</implication>`);
      }
      for (const ref of codeGenRefs) {
        const file = ref.file || ref.path || "";
        console.log(`    <reference file="${escapeXml(file)}" />`);
      }
      console.log(`  </answer>`);
    } else {
      uncovered.push({ key: id, value: valueStr });
    }
  }

  // Emit per-connector summary for 3+ connector integrations
  if (sessionType === "integration") {
    const additionalSystems = answers.additional_systems;
    if (additionalSystems) {
      let systems: string[] = [];
      if (Array.isArray(additionalSystems)) {
        systems = additionalSystems.map(String);
      } else if (typeof additionalSystems === "string") {
        try {
          systems = JSON.parse(additionalSystems);
        } catch {
          /* ignore */
        }
      }
      if (systems.length > 0) {
        console.log(`  <additional-connectors count="${systems.length}">`);
        console.log(
          `    Source (connectors[0]) and destination (connectors[1]) use standard patterns.`,
        );
        console.log(
          `    The following additional connectors need config page entries, imports, and flow integration:`,
        );
        for (let i = 0; i < systems.length; i++) {
          const idx = i + 2;
          const prefix = `connector_${idx}`;
          const comp = answers[`${prefix}_component`];
          const connType = answers[`${prefix}_connection`];
          const compKey =
            comp && typeof comp === "object"
              ? (comp as Record<string, unknown>).key
              : String(comp ?? "none");
          console.log(
            `    <connector index="${idx}" system="${escapeXml(systems[i])}" component="${escapeXml(String(compKey))}" connection="${escapeXml(String(connType ?? "unknown"))}" />`,
          );
        }
        console.log(
          `    Each additional connector needs: componentRegistry import, configPage connection entry, flow action imports.`,
        );
        console.log(`  </additional-connectors>`);
      }
    }
  }

  // Emit per-connector connection code pattern guidance
  // The code pattern depends on: connection strategy + whether an SCV exists
  if (sessionType === "integration") {
    const connectorPrefixes = ["source", "destination"];
    // Add additional connectors
    for (const key of Object.keys(answers)) {
      const match = key.match(/^(connector_\d+)_system$/);
      if (match) connectorPrefixes.push(match[1]);
    }

    const connectionPatterns: Array<{
      prefix: string;
      system: string;
      strategy: string;
      pattern: string;
      stableKey: string;
      componentKey: string;
      connectionKey: string;
    }> = [];

    for (const prefix of connectorPrefixes) {
      const strategy = answers[`${prefix}_connection`];
      if (!strategy || strategy === "no_connection") continue;

      const system = String(answers[`${prefix}_system`] ?? prefix);
      const connExisting = answers[`${prefix}_connection_existing`];
      const component = answers[`${prefix}_component`];
      const connType = answers[`${prefix}_connection_type`];

      const componentKey =
        component && typeof component === "object"
          ? String((component as Record<string, unknown>).key ?? "")
          : "";
      const connectionKey =
        connType && typeof connType === "object"
          ? String((connType as Record<string, unknown>).key ?? "")
          : "";

      // Determine if an SCV exists (connection_existing is a real object, not "none"/"solo_build_only")
      const hasSCV =
        connExisting !== undefined &&
        connExisting !== null &&
        connExisting !== "none" &&
        connExisting !== "solo_build_only" &&
        typeof connExisting === "object";

      let stableKey = "";
      if (hasSCV && typeof connExisting === "object") {
        stableKey = String((connExisting as Record<string, unknown>).stableKey ?? "");
      }

      let pattern: string;
      if (strategy === "org_activated") {
        if (hasSCV && stableKey) {
          pattern = "organizationActivatedConnection";
        } else {
          // org_activated without SCV — should have been created, but fallback
          pattern = "organizationActivatedConnection_NEEDS_SCV";
        }
      } else if (strategy === "customer_activated") {
        if (hasSCV && stableKey) {
          pattern = "customerActivatedConnection";
        } else if (componentKey && connectionKey) {
          pattern = "manifest_helper";
        } else {
          pattern = "connectionConfigVar_inline";
        }
      } else {
        pattern = "unknown";
      }

      connectionPatterns.push({
        prefix,
        system,
        strategy: String(strategy),
        pattern,
        stableKey,
        componentKey,
        connectionKey,
      });
    }

    if (connectionPatterns.length > 0) {
      console.log(`  <connection-patterns>`);
      for (const cp of connectionPatterns) {
        console.log(
          `    <connector prefix="${cp.prefix}" system="${escapeXml(cp.system)}" strategy="${cp.strategy}" pattern="${cp.pattern}">`,
        );
        if (cp.pattern === "customerActivatedConnection") {
          console.log(
            `      Use: customerActivatedConnection({ stableKey: "${escapeXml(cp.stableKey)}" }) in configPages`,
          );
          console.log(`      The SCV exists — reference it by stableKey.`);
        } else if (cp.pattern === "organizationActivatedConnection") {
          console.log(
            `      Use: organizationActivatedConnection({ stableKey: "${escapeXml(cp.stableKey)}" }) in scopedConfigVars on integration()`,
          );
          console.log(
            `      Access in onExecution: context.configVars["${escapeXml(cp.system)} Connection"] as unknown as { fields: Record<string, string>; token?: { access_token: string } }`,
          );
        } else if (cp.pattern === "manifest_helper") {
          console.log(
            `      Use: manifest helper from ./manifests/${escapeXml(cp.componentKey)}/connections/${escapeXml(cp.connectionKey)} in configPages`,
          );
          console.log(`      Import the helper and call it with a stableKey and input overrides.`);
          console.log(
            `      For customer-visible OAuth: org provides clientId/clientSecret (permissionAndVisibilityType: "organization"), customer completes OAuth flow.`,
          );
          console.log(
            `      Example: ${cp.connectionKey}("${cp.prefix}-${cp.componentKey}-${cp.connectionKey}", { clientId: { value: "", permissionAndVisibilityType: "organization" }, ... })`,
          );
        } else if (cp.pattern === "connectionConfigVar_inline") {
          console.log(
            `      Use: connectionConfigVar({ stableKey: "...", dataType: "connection", ... }) in configPages`,
          );
          console.log(`      No component manifest — define the connection inputs inline.`);
        } else if (cp.pattern === "organizationActivatedConnection_NEEDS_SCV") {
          console.log(
            `      WARNING: org_activated chosen but no SCV was created. The agent should have created one.`,
          );
          console.log(
            `      Create an SCV first with: prismatic-tools create-organization-connection`,
          );
          console.log(
            `      Then use: organizationActivatedConnection({ stableKey: "<created-stable-key>" }) in scopedConfigVars`,
          );
        }
        console.log(`    </connector>`);
      }
      console.log(`  </connection-patterns>`);
    }
  }

  // Check for api-research.json
  const researchCandidates = [
    join(sessionDir, "api-research.json"),
    join(sessionDir, "source-api-research.json"),
    join(sessionDir, "destination-api-research.json"),
  ];
  for (const researchFile of researchCandidates) {
    if (existsSync(researchFile)) {
      console.log(`  <api-research file="${researchFile}" />`);
    }
  }

  // Check for migration schema (migration-specific context)
  const migrationSchemaPath = join(sessionDir, "migration-schema.json");
  if (existsSync(migrationSchemaPath)) {
    try {
      const schema = JSON.parse(readFileSync(migrationSchemaPath, "utf-8")) as Record<
        string,
        unknown
      >;

      console.log(`  <migration-context>`);
      console.log(
        `    This integration was migrated from another platform. Use the data below for exact field names and translations.`,
      );

      // API profiles — exact field names and nesting structure
      const apiProfiles = schema.api_profiles as Record<string, unknown> | undefined;
      if (apiProfiles && Object.keys(apiProfiles).length > 0) {
        const profileJson = JSON.stringify(apiProfiles);
        const MAX_PROFILE_SIZE = 5000;
        console.log(`    <api-profiles count="${Object.keys(apiProfiles).length}">`);
        console.log(
          `      Use exact field names from these profiles — do NOT invent or rename fields.`,
        );
        if (profileJson.length <= MAX_PROFILE_SIZE) {
          console.log(`      ${profileJson}`);
        } else {
          console.log(`      ${profileJson.slice(0, MAX_PROFILE_SIZE)}`);
          console.log(
            `      <truncated original-size="${profileJson.length}" shown="${MAX_PROFILE_SIZE}">Read migration-schema.json for full profiles</truncated>`,
          );
        }
        console.log(`    </api-profiles>`);
      }

      // Scripts for translation
      const scripts = schema.scripts as Array<Record<string, unknown>> | undefined;
      if (scripts && scripts.length > 0) {
        console.log(`    <script-translations count="${scripts.length}">`);
        console.log(`      Translate these scripts completely — no TODO placeholders.`);
        for (const script of scripts.slice(0, 5)) {
          const name = script.name ?? "unnamed";
          const lang = script.script_language ?? "groovy";
          const content = script.script_content as string | undefined;
          const lines = content ? content.split("\n").length : 0;
          console.log(
            `      <script name="${escapeXml(String(name))}" language="${lang}" lines="${lines}">`,
          );
          if (content && lines <= 100) {
            console.log(content);
          } else if (content) {
            console.log(
              `        [${lines} lines — read migration-schema.json scripts section for full source]`,
            );
          }
          console.log(`      </script>`);
        }
        console.log(`    </script-translations>`);
      }

      // Field mappings from data_transformations
      const transforms = schema.data_transformations as Array<Record<string, unknown>> | undefined;
      if (transforms && transforms.length > 0) {
        const totalMappings = transforms.reduce((sum, t) => {
          const m = t.mappings as unknown[] | undefined;
          return sum + (m?.length ?? 0);
        }, 0);
        console.log(
          `    <field-mappings transforms="${transforms.length}" mappings="${totalMappings}">`,
        );
        console.log(`      ${JSON.stringify(transforms).slice(0, 3000)}`);
        console.log(`    </field-mappings>`);
      }

      // Known endpoints
      const endpoints = schema.endpoints as Array<Record<string, unknown>> | undefined;
      if (endpoints && endpoints.length > 0) {
        console.log(`    <endpoints count="${endpoints.length}">`);
        for (const ep of endpoints) {
          const path = ep.path ?? ep.url ?? "unknown";
          const method = ep.method ?? "GET";
          const conf = ep.confidence ?? "unknown";
          console.log(
            `      <endpoint method="${method}" path="${escapeXml(String(path))}" confidence="${conf}" />`,
          );
        }
        console.log(`    </endpoints>`);
      }

      console.log(`  </migration-context>`);
    } catch (e) {
      console.error(`FATAL: migration-schema.json exists but could not be parsed: ${e}`);
      console.error(
        `Without migration data, this is not a migration — use /build-integration instead.`,
      );
      console.error(`Fix the schema at: ${migrationSchemaPath}`);
      return 2;
    }
  }

  // Instructions
  console.log(`  <instructions>`);
  if (useInline) {
    console.log(
      `    Cookbook sections are included inline above — do NOT read the cookbook file separately.`,
    );
  } else {
    console.log(
      `    Cookbook content exceeded size budget. Grep for each <cookbook> heading in answer-to-code-cookbook.md.`,
    );
  }
  console.log(
    `    For each <reference> file: Read it from the ${skillName} skill references/ directory.`,
  );
  console.log(`    For each <api-research> file: Read it for API-specific endpoint details.`);
  console.log(
    `    Use <implication> text to understand the architectural decision for each answer.`,
  );
  console.log(
    `    For uncovered items that affect code structure: escalate to Orby before writing code.`,
  );
  console.log(`  </instructions>`);
  console.log("</code-plan>");

  // Verify coverage
  console.log("");
  console.log("<verify-coverage>");
  console.log(`  <covered count="${covered.length}">${covered.join(", ")}</covered>`);
  if (uncovered.length > 0) {
    console.log(`  <uncovered count="${uncovered.length}">`);
    for (const item of uncovered) {
      console.log(`    <item key="${item.key}" value="${escapeXml(truncate(item.value, 60))}" />`);
    }
    console.log(`  </uncovered>`);
  } else {
    console.log(`  <uncovered count="0" />`);
  }
  console.log(`  <note>Uncovered items may be metadata (names, descriptions) or free-text.</note>`);
  console.log(
    `  <note>If any uncovered item is a choice that affects code structure, escalate to Orby:</note>`,
  );
  console.log(
    `  <note>  &lt;orby-request&gt;The code-plan shows [item]=[value] has no cookbook section. What is the correct Prismatic pattern?&lt;/orby-request&gt;</note>`,
  );
  console.log("</verify-coverage>");

  return 0;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s;
}

process.exit(main());
