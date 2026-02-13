#!/usr/bin/env python3
"""
search_connections.py

PURPOSE: Search and list available integration-agnostic connections for use in CNI integrations

WHAT ARE INTEGRATION-AGNOSTIC CONNECTIONS:
  Centrally managed connections that can be referenced across multiple integrations.
  Three types exist:

  1. Customer-Activated: Customers provide their own credentials (OAuth/API keys)
     - Function: customerActivatedConnection({ stableKey: "..." })
     - Location: configPages.ts
     - Visible: YES - customers see in config wizard

  2. Org-Activated Customer: You provide unique credentials per customer
     - Function: organizationActivatedConnection({ stableKey: "..." })
     - Location: index.ts scopedConfigVars
     - Visible: NO - customers don't see it

  3. Org-Activated Global: One set of credentials shared by all customers
     - Function: organizationActivatedConnection({ stableKey: "..." })
     - Location: index.ts scopedConfigVars
     - Visible: NO - customers don't see it

WORKFLOW:
  1. Run: python scripts/search_connections.py [keyword]
  2. Review available connections with their types and labels
  3. Note the stableKey and connection type (CUSTOMER or ORG)
  4. Use in integration code as shown in output

OUTPUT FORMAT:
  JSON array suitable for agent processing:
  [
    {
      "stableKey": "...",
      "label": "Dropbox",
      "component": "dropbox",
      "managedBy": "CUSTOMER" | "ORG",
      "description": "...",
      "category": "..."
    }
  ]

USAGE:
  python search_connections.py              # List all connections
  python search_connections.py slack        # Filter by keyword

PARAMETERS:
  keyword (optional) - Filter connections by keyword (matches label, component, or description)

EXIT CODES:
  0 - Success
  1 - Error (API call failed, auth issues, etc.)
"""

import json
import sys

from graphql import graphql, GraphQLError

# GraphQL query for listing connections
LIST_CONNECTIONS_QUERY = """
query availableConnections($managedBy: String) {
    scopedConfigVariables(managedBy: $managedBy) {
        nodes {
            stableKey
            description
            managedBy
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
"""

# GraphQL query for listing all components (for label enrichment)
LIST_COMPONENTS_QUERY = """
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
"""


def list_connections_api():
    """Fetch all connections using the GraphQL API.

    Returns:
        List of connection dicts
    """
    data = graphql(LIST_CONNECTIONS_QUERY, {})
    nodes = data.get("scopedConfigVariables", {}).get("nodes", [])

    connections = []
    for node in nodes:
        conn = {
            "stableKey": node.get("stableKey"),
            "description": node.get("description"),
            "managedBy": node.get("managedBy"),
        }

        # Extract component key if available
        connection_obj = node.get("connection")
        if connection_obj and connection_obj.get("component"):
            conn["component"] = connection_obj["component"].get("key") or ""

        connections.append(conn)

    return connections


def list_all_components_api():
    """Fetch all components for label enrichment.

    Returns:
        Dict mapping component key to {label, description, category}
    """
    all_components = []
    cursor = None

    while True:
        variables = {}
        if cursor:
            variables["after"] = cursor

        data = graphql(LIST_COMPONENTS_QUERY, variables)
        components_data = data.get("components", {})
        nodes = components_data.get("nodes", [])
        all_components.extend(nodes)

        page_info = components_data.get("pageInfo", {})
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")

    # Build lookup dict
    return {
        (comp.get("key") or ""): {
            "label": (comp.get("label") or ""),
            "description": (comp.get("description") or ""),
            "category": (comp.get("category") or ""),
        }
        for comp in all_components
        if comp.get("key")
    }


def enrich_connections(connections, component_labels):
    """Enrich connection data with component labels and metadata."""
    enriched = []

    for conn in connections:
        component_key = conn.get("component") or ""
        component_info = component_labels.get(component_key, {})
        managed_by = conn.get("managedBy") or "UNKNOWN"
        conn_description = conn.get("description") or ""
        stable_key = conn.get("stableKey") or ""

        # Base label from component
        base_label = (component_info.get("label") or "") or component_key.title()

        # Build a disambiguated display label
        # Always include: full name, type, and stable key subset
        managed_label = (
            "Customer-Activated" if managed_by == "CUSTOMER" else "Org-Activated"
        )
        short_key = stable_key[:8] if stable_key else "unknown"

        if conn_description:
            display_label = (
                f"{base_label} - {conn_description} ({managed_label}, {short_key})"
            )
        else:
            display_label = f"{base_label} ({managed_label}, {short_key})"

        enriched.append(
            {
                "stableKey": stable_key,
                "label": display_label,
                "componentLabel": base_label,
                "component": component_key,
                "managedBy": managed_by,
                "connectionDescription": conn_description,
                "componentDescription": (component_info.get("description") or ""),
                "category": (component_info.get("category") or ""),
            }
        )
    return enriched


def filter_connections(connections, keyword):
    """Filter connections by keyword (case-insensitive)."""
    if not keyword:
        return connections

    keyword_lower = keyword.lower()
    return [
        conn
        for conn in connections
        if keyword_lower in (conn.get("label") or "").lower()
        or keyword_lower in (conn.get("component") or "").lower()
        or keyword_lower in (conn.get("connectionDescription") or "").lower()
        or keyword_lower in (conn.get("category") or "").lower()
    ]


def print_guidance(connections, keyword):
    """Print human-readable guidance for using connections."""
    print()
    if keyword:
        print(f"🔍 Found {len(connections)} connection(s) matching '{keyword}'")
    else:
        print(
            f"📋 Found {len(connections)} available integration-agnostic connection(s)"
        )
    print()

    if not connections:
        print("💡 No connections available. You may need to:")
        print("   1. Create connections in the Prismatic UI")
        print("   2. Ensure you have the correct permissions")
        print()
        return

    # Group by managedBy type
    customer_activated = [c for c in connections if c["managedBy"] == "CUSTOMER"]
    org_activated = [c for c in connections if c["managedBy"] == "ORG"]

    if customer_activated:
        print("━" * 70)
        print("CUSTOMER-ACTIVATED CONNECTIONS")
        print("━" * 70)
        print("Customers provide their own credentials (visible in config wizard)")
        print()
        for conn in sorted(customer_activated, key=lambda x: x["label"]):
            print(f"  {conn['label']}")
            print(f"    StableKey: {conn['stableKey']}")
            if conn.get("connectionDescription"):
                print(f"    Description: {conn['connectionDescription']}")
            if conn.get("category"):
                print(f"    Category: {conn['category']}")
            print()

    if org_activated:
        print("━" * 70)
        print("ORGANIZATION-ACTIVATED CONNECTIONS")
        print("━" * 70)
        print("You provide credentials (NOT visible to customers)")
        print()
        for conn in sorted(org_activated, key=lambda x: x["label"]):
            print(f"  {conn['label']}")
            print(f"    StableKey: {conn['stableKey']}")
            if conn.get("connectionDescription"):
                print(f"    Description: {conn['connectionDescription']}")
            if conn.get("category"):
                print(f"    Category: {conn['category']}")
            print()

    print("━" * 70)
    print("USAGE IN INTEGRATION CODE")
    print("━" * 70)
    print()

    if customer_activated:
        example = customer_activated[0]
        print("Customer-Activated (in configPages.ts):")
        print()
        print("  import { customerActivatedConnection } from '@prismatic-io/spectral';")
        print()
        print("  export const configPages = {")
        print("    Connections: configPage({")
        print("      elements: {")
        print(f"        '{example['componentLabel']}': customerActivatedConnection({{")
        print(f"          stableKey: '{example['stableKey']}',")
        print("        }),")
        print("      },")
        print("    }),")
        print("  };")
        print()

    if org_activated:
        example = org_activated[0]
        print("Organization-Activated (in index.ts):")
        print()
        print(
            "  import { organizationActivatedConnection } from '@prismatic-io/spectral';"
        )
        print()
        print("  export const scopedConfigVars = {")
        print(f"    '{example['componentLabel']}': organizationActivatedConnection({{")
        print(f"      stableKey: '{example['stableKey']}',")
        print("    }),")
        print("  };")
        print()

    print("━" * 70)
    print()
    print("📚 Full guide: references/cni-examples/integration-agnostic-connections.md")
    print()


def main():
    keyword = sys.argv[1] if len(sys.argv) > 1 else None

    try:
        # Fetch connections
        connections = list_connections_api()

        # Enrich with component labels
        try:
            component_labels = list_all_components_api()
        except Exception:
            component_labels = {}  # Non-fatal

        enriched = enrich_connections(connections, component_labels)

        # Filter by keyword if provided
        filtered = filter_connections(enriched, keyword)

        # Output JSON to stdout (for agent processing)
        print(json.dumps(filtered, indent=2))

        # Print human guidance to stderr
        original_stdout = sys.stdout
        sys.stdout = sys.stderr
        print_guidance(filtered, keyword)
        sys.stdout = original_stdout

        return 0

    except GraphQLError as e:
        print(f"❌ API error: {e}", file=sys.stderr)
        return 1

    except Exception as e:
        print(f"❌ Unexpected error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
