#!/usr/bin/env npx tsx
/**
 * find-components.ts
 *
 * PURPOSE: Search for components by keyword
 *
 * USAGE: npx tsx find-components.ts <search-term>
 *
 * EXIT CODES:
 *   0 - Success: Components found and displayed
 *   1 - Error: No search term provided
 *   2 - Error: API call failed
 */

import { graphql, GraphQLError } from "../shared/graphql.js";

const SEARCH_COMPONENTS_QUERY = `
query searchComponents($filterQuery: JSONString, $after: String) {
    components(filterQuery: $filterQuery, after: $after) {
        nodes {
            id
            key
            label
            description
            public
            category
            versionNumber
            connections {
                nodes {
                    key
                    label
                    inputs {
                        nodes {
                            key
                            label
                            required
                            default
                            type
                        }
                    }
                }
            }
        }
        pageInfo {
            hasNextPage
            endCursor
        }
    }
}
`;

interface ComponentNode {
  id: string;
  key: string;
  label: string;
  description: string;
  public: boolean;
  connections: {
    nodes: Array<{
      key: string;
      label: string;
      inputs: {
        nodes: Array<{
          key: string;
          label: string;
          required: boolean;
          default: unknown;
          type: string;
        }>;
      };
    }>;
  };
}

function searchComponentsApi(searchTerm: string): ComponentNode[] {
  const filterQuery = JSON.stringify([
    "or",
    ["in", "key", searchTerm],
    ["in", "label", searchTerm],
  ]);

  const allComponents: ComponentNode[] = [];
  let cursor: string | undefined;

  while (true) {
    const variables: Record<string, unknown> = { filterQuery };
    if (cursor) variables.after = cursor;

    const data = graphql(SEARCH_COMPONENTS_QUERY, variables) as Record<string, unknown>;
    const componentsData = (data.components ?? {}) as Record<string, unknown>;
    const nodes = (componentsData.nodes ?? []) as ComponentNode[];
    allComponents.push(...nodes);

    const pageInfo = (componentsData.pageInfo ?? {}) as Record<string, unknown>;
    if (!pageInfo.hasNextPage) break;
    cursor = pageInfo.endCursor as string;
  }

  return allComponents;
}

function inferAuthType(key: string, label: string): string {
  const kl = key.toLowerCase();
  const ll = label.toLowerCase();

  if (kl.includes("oauth2") || ll.includes("oauth2")) return "OAuth2";
  if (kl.includes("oauth") || ll.includes("oauth")) return "OAuth";
  if (kl.includes("apikey") || ll.includes("api key") || kl.includes("api_key")) return "API Key";
  if (kl.includes("apitoken") || ll.includes("api token") || kl.includes("api_token"))
    return "API Token";
  if (kl.includes("basic") || ll.includes("basic")) return "Basic Auth";
  if (kl.includes("bearer") || ll.includes("bearer")) return "Bearer Token";
  if (kl.includes("webhook") || ll.includes("webhook")) return "Webhook";
  if (kl.includes("jwt") || ll.includes("jwt")) return "JWT";
  return "Custom";
}

function formatForRequirements(components: ComponentNode[]): unknown[] {
  return components.map((comp) => {
    const connections = (comp.connections?.nodes ?? []).map((conn) => {
      const inputs = (conn.inputs?.nodes ?? []).map((inp) => ({
        key: inp.key ?? "",
        label: inp.label ?? inp.key ?? "",
        required: inp.required ?? false,
        default: inp.default,
        type: inp.type,
      }));

      return {
        key: conn.key,
        label: conn.label,
        auth_type: inferAuthType(conn.key, conn.label),
        required_inputs: inputs.filter((i) => i.required).map((i) => i.key),
        inputs,
      };
    });

    return {
      key: comp.key,
      label: comp.label,
      description: comp.description ?? "",
      public: comp.public ?? true,
      connections,
    };
  });
}

function main(): number {
  if (process.argv.length < 3) {
    console.error("No search term provided");
    console.error("Usage: npx tsx find-components.ts <search-term>");
    return 1;
  }

  const searchTerm = process.argv[2];
  console.error(`Searching for '${searchTerm}'...`);

  try {
    const components = searchComponentsApi(searchTerm);

    if (components.length === 0) {
      console.error(`No components found for '${searchTerm}'`);
      console.log("[]");
      return 0;
    }

    const formatted = formatForRequirements(components);
    console.log(JSON.stringify(formatted, null, 2));

    console.error("");
    console.error(`Found ${formatted.length} component(s) matching '${searchTerm}'`);
    return 0;
  } catch (e) {
    if (e instanceof GraphQLError) {
      console.error(`API error: ${e.message}`);
      return 2;
    }
    console.error(`Unexpected error: ${e}`);
    return 2;
  }
}

process.exit(main());
