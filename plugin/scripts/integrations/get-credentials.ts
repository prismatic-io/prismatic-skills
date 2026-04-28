#!/usr/bin/env npx tsx
/**
 * get-credential-prompts.ts
 *
 * PURPOSE: Infer credential prompts from a component's connection inputs
 *
 * USAGE: npx tsx get-credential-prompts.ts <component_key> '<connection_json>'
 *
 * EXIT CODES:
 *   0 - Success: Credential prompts generated
 *   1 - Error: Missing arguments or invalid JSON
 */

interface ConnectionInput {
  key: string;
  label?: string;
  type?: string;
  required?: boolean;
  default?: unknown;
}

interface CredentialPrompt {
  env_var: string;
  label: string;
  input_key: string;
  required: boolean;
  sensitive: boolean;
  hint: string;
}

const CREDENTIAL_PATTERNS: Record<string, { hint: string; sensitive: boolean }> = {
  clientId: { hint: "OAuth 2.0 Client ID from your app settings", sensitive: false },
  clientSecret: { hint: "OAuth 2.0 Client Secret from your app settings", sensitive: true },
  apiKey: { hint: "API key for authentication", sensitive: true },
  signingSecret: { hint: "Signing secret for webhook verification", sensitive: true },
  token: { hint: "Authentication token", sensitive: true },
  secret: { hint: "Secret key for authentication", sensitive: true },
  accessToken: { hint: "Access token for API calls", sensitive: true },
  refreshToken: { hint: "Refresh token for OAuth", sensitive: true },
  privateKey: { hint: "Private key for authentication", sensitive: true },
  appId: { hint: "Application ID", sensitive: false },
  appSecret: { hint: "Application secret", sensitive: true },
  consumerKey: { hint: "Consumer key for OAuth 1.0", sensitive: false },
  consumerSecret: { hint: "Consumer secret for OAuth 1.0", sensitive: true },
};

const SKIP_PATTERNS = [
  "tokenUrl",
  "authorizeUrl",
  "authorizationUrl",
  "revokeUrl",
  "scopes",
  "scope",
  "baseUrl",
  "apiUrl",
  "apiVersion",
  "audience",
  "headers",
  "queryParams",
];

function extractPrefixFromComponentKey(componentKey: string): string {
  const parts = componentKey.split("-");
  return (parts[parts.length - 1] || componentKey).toUpperCase();
}

function camelToScreamingSnake(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
}

function shouldPromptForInput(inp: ConnectionInput): boolean {
  const key = inp.key ?? "";
  const inputType = inp.type ?? "";
  const defaultVal = inp.default;

  if (SKIP_PATTERNS.includes(key)) return false;

  if (defaultVal && typeof defaultVal === "string") {
    if (defaultVal.startsWith("http://") || defaultVal.startsWith("https://")) {
      return false;
    }
  }

  if (inputType === "password") return true;
  if (key in CREDENTIAL_PATTERNS) return true;

  const credentialTerms = ["id", "secret", "key", "token", "password", "credential"];
  const keyLower = key.toLowerCase();
  if (credentialTerms.some((term) => keyLower.includes(term))) {
    if (!SKIP_PATTERNS.some((skip) => keyLower.includes(skip.toLowerCase()))) {
      return true;
    }
  }

  return false;
}

function isSensitive(inp: ConnectionInput): boolean {
  const key = inp.key ?? "";
  const inputType = inp.type ?? "";

  if (inputType === "password") return true;
  if (key in CREDENTIAL_PATTERNS) return CREDENTIAL_PATTERNS[key].sensitive;

  const sensitiveTerms = ["secret", "password", "token", "key", "private"];
  const keyLower = key.toLowerCase();
  return sensitiveTerms.some((term) => keyLower.includes(term));
}

function getHint(inp: ConnectionInput, componentKey: string): string {
  const key = inp.key ?? "";
  const label = inp.label ?? "";

  if (key in CREDENTIAL_PATTERNS) {
    const baseHint = CREDENTIAL_PATTERNS[key].hint;
    const prefix = extractPrefixFromComponentKey(componentKey);
    const titlePrefix = prefix.charAt(0) + prefix.slice(1).toLowerCase();
    return baseHint.replace("your app", `your ${titlePrefix} app`);
  }

  if (label) return `Enter the ${label} value`;
  return "";
}

function formatLabel(inp: ConnectionInput, componentKey: string): string {
  const key = inp.key ?? "";
  const label = inp.label ?? "";

  let baseLabel: string;
  if (label) {
    baseLabel = label;
  } else {
    baseLabel = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const prefix = extractPrefixFromComponentKey(componentKey);
  const titlePrefix = prefix.charAt(0) + prefix.slice(1).toLowerCase();

  if (!baseLabel.toLowerCase().includes(prefix.toLowerCase())) {
    return `${titlePrefix} ${baseLabel}`;
  }

  return baseLabel;
}

function generateCredentialPrompts(
  componentKey: string,
  connection: { inputs?: ConnectionInput[] },
): CredentialPrompt[] {
  const inputs = connection.inputs ?? [];
  const prefix = extractPrefixFromComponentKey(componentKey);

  const prompts: CredentialPrompt[] = [];

  for (const inp of inputs) {
    if (!shouldPromptForInput(inp)) continue;

    const key = inp.key ?? "";
    const envVar = `${prefix}_${camelToScreamingSnake(key)}`;

    prompts.push({
      env_var: envVar,
      label: formatLabel(inp, componentKey),
      input_key: key,
      required: inp.required ?? false,
      sensitive: isSensitive(inp),
      hint: getHint(inp, componentKey),
    });
  }

  return prompts;
}

function main(): number {
  if (process.argv.length < 4) {
    console.error("Usage: npx tsx get-credential-prompts.ts <component_key> '<connection_json>'");
    console.log("[]");
    return 1;
  }

  const componentKey = process.argv[2];
  const connectionJson = process.argv[3];

  if (!connectionJson || ["", "null", "None", "{}"].includes(connectionJson)) {
    console.error("No connection data provided");
    console.log("[]");
    return 0;
  }

  let connection: { inputs?: ConnectionInput[] };
  try {
    connection = JSON.parse(connectionJson);
  } catch (e) {
    console.error(`Invalid JSON: ${e}`);
    console.log("[]");
    return 1;
  }

  const prompts = generateCredentialPrompts(componentKey, connection);

  console.log(JSON.stringify(prompts, null, 2));

  if (prompts.length > 0) {
    console.error("");
    console.error(`Found ${prompts.length} credential(s) to prompt for:`);
    for (const p of prompts) {
      const sensitiveMarker = p.sensitive ? " (sensitive)" : "";
      console.error(`  - ${p.env_var}: ${p.label}${sensitiveMarker}`);
    }
    console.error("");
  } else {
    console.error("No credentials needed for this connection type");
  }

  return 0;
}

process.exit(main());
