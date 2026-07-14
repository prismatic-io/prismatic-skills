#!/usr/bin/env npx tsx
import { type CliConfig, parseCliArgs } from "../shared/cli-help.js";

const CLI = {
  command: "prismatic-tools extract-connections",
  description: "List available authentication methods for a component.",
  positionals: [{ name: "connections-json", required: true }],
  options: [],
} as const satisfies CliConfig;

interface Connection {
  key: string;
  label: string;
  auth_type?: string;
  required_inputs?: string[];
  inputs?: unknown[];
}

function formatConnections(connections: Connection[]): unknown[] {
  return connections.map((conn) => {
    const key = conn.key ?? "";
    const label = conn.label ?? key;
    const authType = conn.auth_type ?? "";

    let displayLabel = label;
    if (authType && !label.toLowerCase().includes(authType.toLowerCase())) {
      displayLabel = `${label} (${authType})`;
    }

    return {
      key,
      label: displayLabel,
      auth_type: authType,
      required_inputs: conn.required_inputs ?? [],
      inputs: conn.inputs ?? [],
    };
  });
}

function main(): number {
  const { positionals } = parseCliArgs(process.argv.slice(2), CLI);
  const connectionsJson = positionals[0];

  if (!connectionsJson || ["", "null", "None", "[]"].includes(connectionsJson)) {
    console.error("No connections found for this component");
    console.log("[]");
    return 0;
  }

  let connections: Connection[];
  try {
    connections = JSON.parse(connectionsJson);
  } catch (e) {
    console.error(`Invalid JSON: ${e}`);
    console.log("[]");
    return 0;
  }

  if (!Array.isArray(connections) || connections.length === 0) {
    console.error("Component has no connection types defined");
    console.log("[]");
    return 0;
  }

  const formatted = formatConnections(connections);
  console.log(JSON.stringify(formatted, null, 2));

  console.error("");
  console.error(`Found ${formatted.length} connection type(s)`);
  return 0;
}

process.exit(main());
