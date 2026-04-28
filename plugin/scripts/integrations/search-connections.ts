#!/usr/bin/env npx tsx
/**
 * search-connections.ts
 *
 * PURPOSE: Search and list available integration-agnostic connections
 *
 * USAGE:
 *   npx tsx search-connections.ts              # List all connections
 *   npx tsx search-connections.ts slack        # Filter by keyword
 *
 * EXIT CODES:
 *   0 - Success
 *   1 - Error (API call failed, auth issues)
 */

import { graphql, GraphQLError } from "../shared/graphql.js";

const LIST_CONNECTIONS_QUERY = `
query availableConnections($managedBy: String) {
    scopedConfigVariables(managedBy: $managedBy) {
        nodes {
            stableKey
            description
            managedBy
            variableScope
            customer {
                externalId
                name
            }
            connection {
                component {
                    key
                }
            }
        }
    }
}
`;

const LIST_COMPONENTS_QUERY = `
query allComponents($after: String) {
    components(after: $after) {
        nodes {
            key
            label
            description
            category
        }
        pageInfo {
            hasNextPage
            endCursor
        }
    }
}
`;

interface ConnectionNode {
  stableKey: string;
  description: string;
  managedBy: string;
  variableScope?: string;
  connection?: { component?: { key: string } };
}

interface EnrichedConnection {
  stableKey: string;
  label: string;
  componentLabel: string;
  component: string;
  managedBy: string;
  variableScope: string;
  connectionType: string;
  connectionDescription: string;
  componentDescription: string;
  category: string;
}

function listConnectionsApi(): ConnectionNode[] {
  const data = graphql(LIST_CONNECTIONS_QUERY, {}) as Record<string, unknown>;
  const nodes = ((data.scopedConfigVariables as Record<string, unknown>)?.nodes ??
    []) as ConnectionNode[];
  return nodes;
}

function listAllComponentsApi(): Record<
  string,
  { label: string; description: string; category: string }
> {
  const allComponents: Array<{
    key: string;
    label: string;
    description: string;
    category: string;
  }> = [];
  let cursor: string | undefined;

  while (true) {
    const variables: Record<string, unknown> = {};
    if (cursor) variables.after = cursor;

    const data = graphql(LIST_COMPONENTS_QUERY, variables) as Record<string, unknown>;
    const componentsData = (data.components ?? {}) as Record<string, unknown>;
    const nodes = (componentsData.nodes ?? []) as typeof allComponents;
    allComponents.push(...nodes);

    const pageInfo = (componentsData.pageInfo ?? {}) as Record<string, unknown>;
    if (!pageInfo.hasNextPage) break;
    cursor = pageInfo.endCursor as string;
  }

  const lookup: Record<string, { label: string; description: string; category: string }> = {};
  for (const comp of allComponents) {
    if (comp.key) {
      lookup[comp.key] = {
        label: comp.label ?? "",
        description: comp.description ?? "",
        category: comp.category ?? "",
      };
    }
  }
  return lookup;
}

function enrichConnections(
  connections: ConnectionNode[],
  componentLabels: Record<string, { label: string; description: string; category: string }>,
): EnrichedConnection[] {
  return connections.map((conn) => {
    const componentKey = conn.connection?.component?.key ?? "";
    const componentInfo = componentLabels[componentKey] ?? {};
    const managedBy = conn.managedBy ?? "UNKNOWN";
    const variableScope = conn.variableScope ?? "UNKNOWN";
    const connDescription = conn.description ?? "";
    const stableKey = conn.stableKey ?? "";
    const baseLabel =
      componentInfo.label || componentKey.charAt(0).toUpperCase() + componentKey.slice(1);

    let connectionType: string;
    if (managedBy === "SYSTEM") {
      connectionType = "Build-Only";
    } else if (managedBy === "CUSTOMER") {
      connectionType = "Customer-Activated";
    } else if (managedBy === "ORG" && variableScope === "ORG") {
      connectionType = "Org-Activated (global)";
    } else {
      connectionType = "Org-Activated (per-customer)";
    }

    const shortKey = stableKey.slice(0, 8) || "unknown";
    const displayLabel = connDescription
      ? `${baseLabel} - ${connDescription} (${connectionType}, ${shortKey})`
      : `${baseLabel} (${connectionType}, ${shortKey})`;

    return {
      stableKey,
      label: displayLabel,
      componentLabel: baseLabel,
      component: componentKey,
      managedBy,
      variableScope,
      connectionType,
      connectionDescription: connDescription,
      componentDescription: componentInfo.description ?? "",
      category: componentInfo.category ?? "",
    };
  });
}

function filterConnections(
  connections: EnrichedConnection[],
  keyword?: string,
): EnrichedConnection[] {
  if (!keyword) return connections;
  const kw = keyword.toLowerCase();
  return connections.filter(
    (c) =>
      c.label.toLowerCase().includes(kw) ||
      c.component.toLowerCase().includes(kw) ||
      c.connectionDescription.toLowerCase().includes(kw) ||
      c.category.toLowerCase().includes(kw),
  );
}

function main(): number {
  const keyword = process.argv[2] ?? undefined;

  try {
    const connections = listConnectionsApi();

    let componentLabels: Record<string, { label: string; description: string; category: string }>;
    try {
      componentLabels = listAllComponentsApi();
    } catch {
      componentLabels = {};
    }

    const enriched = enrichConnections(connections, componentLabels);
    const filtered = filterConnections(enriched, keyword);

    console.log(JSON.stringify(filtered, null, 2));

    console.error("");
    if (keyword) {
      console.error(`Found ${filtered.length} connection(s) matching '${keyword}'`);
    } else {
      console.error(`Found ${filtered.length} available connection(s)`);
    }

    return 0;
  } catch (e) {
    if (e instanceof GraphQLError) {
      console.error(`API error: ${e.message}`);
      return 1;
    }
    console.error(`Unexpected error: ${e}`);
    return 1;
  }
}

process.exit(main());
