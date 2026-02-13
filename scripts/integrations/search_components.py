#!/usr/bin/env python3
"""
search_components.py

PURPOSE: Search for Prismatic Components by keyword

⭐ ALWAYS SEARCH FOR COMPONENTS FIRST when integrating with external systems

USE CASE:
  For ANY external system integration (Salesforce, Slack, databases, AWS, etc.),
  search for existing components BEFORE writing custom code.

  Prismatic has 200+ production-tested components with proven authentication,
  error handling, and retry logic. Using component source is faster and more
  reliable than building from scratch.

WORKFLOW:
  1. Search: python scripts/search_components.py <keyword>
  2. Scaffold with manifests: python scripts/scaffold_project.py <name> --components <key1,key2>
  3. Register manifests in src/componentRegistry.ts
  4. Access actions via context.components.<componentKey>.<action>()

USAGE: python search_components.py <search-term>

PARAMETERS:
  search-term - Keyword to search for (e.g., "slack", "salesforce", "aws")

EXIT CODES:
  0 - Success: Components found and displayed
  1 - Error: No search term provided
  2 - Error: API call failed
"""

import json
import os
import sys

SHARED_DIR = os.path.join(os.path.dirname(__file__), '..', 'shared')
sys.path.insert(0, SHARED_DIR)

from graphql import graphql, GraphQLError

# GraphQL query for searching components (includes connection types)
SEARCH_COMPONENTS_QUERY = """
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
"""


def search_components_api(search_term):
    """Search for components using the GraphQL API.

    Args:
        search_term: Keyword to search for

    Returns:
        List of component dicts
    """
    # Build filter query for search
    filter_query = json.dumps(
        ["or", ["in", "key", search_term], ["in", "label", search_term]]
    )

    all_components = []
    cursor = None

    while True:
        variables = {"filterQuery": filter_query}
        if cursor:
            variables["after"] = cursor

        data = graphql(SEARCH_COMPONENTS_QUERY, variables)
        components_data = data.get("components", {})
        nodes = components_data.get("nodes", [])
        all_components.extend(nodes)

        page_info = components_data.get("pageInfo", {})
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")

    return all_components


def _infer_auth_type(key, label):
    """Infer authentication type from connection key/label for display."""
    key_lower = key.lower()
    label_lower = label.lower()

    if "oauth2" in key_lower or "oauth2" in label_lower:
        return "OAuth2"
    if "oauth" in key_lower or "oauth" in label_lower:
        return "OAuth"
    if "apikey" in key_lower or "api key" in label_lower or "api_key" in key_lower:
        return "API Key"
    if "apitoken" in key_lower or "api token" in label_lower or "api_token" in key_lower:
        return "API Token"
    if "basic" in key_lower or "basic" in label_lower:
        return "Basic Auth"
    if "bearer" in key_lower or "bearer" in label_lower:
        return "Bearer Token"
    if "webhook" in key_lower or "webhook" in label_lower:
        return "Webhook"
    if "jwt" in key_lower or "jwt" in label_lower:
        return "JWT"

    return "Custom"


def _format_connections(connections_data):
    """Format connection nodes into a list of connection info dicts."""
    connection_nodes = connections_data.get("nodes", [])
    connections = []

    for conn in connection_nodes:
        conn_key = conn.get("key", "")
        conn_label = conn.get("label", conn_key)
        auth_type = _infer_auth_type(conn_key, conn_label)

        # Get all inputs with full details for credential prompting
        inputs = conn.get("inputs", {}).get("nodes", [])
        required_inputs = [
            inp.get("key") for inp in inputs if inp.get("required", False)
        ]

        # Include full input details for credential inference
        inputs_detail = [
            {
                "key": inp.get("key", ""),
                "label": inp.get("label", inp.get("key", "")),
                "required": inp.get("required", False),
                "default": inp.get("default"),
                "type": inp.get("type"),
            }
            for inp in inputs
        ]

        connections.append(
            {
                "key": conn_key,
                "label": conn_label,
                "auth_type": auth_type,
                "required_inputs": required_inputs,
                "inputs": inputs_detail,
            }
        )

    return connections


def format_for_requirements(components):
    """
    Format components for requirements gathering script.
    Returns list with 'key', 'label', and 'connections' fields.
    """
    formatted = []
    for comp in components:
        key = comp.get("key", "")
        label = comp.get("label", comp.get("name", "Unknown"))
        description = comp.get("description", "")

        # Format connection types
        connections_data = comp.get("connections", {})
        connections = _format_connections(connections_data)

        formatted.append(
            {
                "key": key,
                "label": label,
                "description": description,
                "connections": connections,
            }
        )
    return formatted


def print_human_guidance(components, search_term):
    """Print human-readable guidance for components found."""
    print("", file=sys.stderr)
    print(
        f"🔍 Found {len(components)} component(s) matching '{search_term}'",
        file=sys.stderr,
    )
    print("", file=sys.stderr)

    for comp in components:
        print(f"  {comp['label']} ({comp['key']})", file=sys.stderr)
        if comp.get("description"):
            desc = (
                comp["description"][:80] + "..."
                if len(comp.get("description", "")) > 80
                else comp["description"]
            )
            print(f"    {desc}", file=sys.stderr)

        # Show available connection types
        connections = comp.get("connections", [])
        if connections:
            conn_labels = [c.get("label", c.get("key")) for c in connections]
            print(f"    🔐 Connections: {', '.join(conn_labels)}", file=sys.stderr)

    print("", file=sys.stderr)
    print("💡 To use a component:", file=sys.stderr)
    print(
        "   python scripts/scaffold_project.py <name> --components <key1,key2>",
        file=sys.stderr,
    )
    print(
        "   Or: cd <project> && npx cni-component-manifest <key>",
        file=sys.stderr,
    )
    print("", file=sys.stderr)


def search_components(search_term):
    """Search for Components matching search term."""
    print(f"⏳ Searching for '{search_term}'...", file=sys.stderr)

    try:
        components = search_components_api(search_term)

        if not components:
            print(f"No components found for '{search_term}'", file=sys.stderr)
            # Output empty JSON array for requirements gathering
            print("[]")
            return 0

        # Format for requirements gathering (JSON to stdout)
        formatted = format_for_requirements(components)
        print(json.dumps(formatted, indent=2))

        # Human guidance to stderr
        print_human_guidance(formatted, search_term)

        return 0

    except GraphQLError as e:
        print(f"❌ API error: {e}", file=sys.stderr)
        return 2

    except Exception as e:
        print(f"❌ Unexpected error: {e}", file=sys.stderr)
        return 2


def main():
    if len(sys.argv) < 2:
        print("❌ No search term provided")
        print("Usage: python search_components.py <search-term>")
        return 1

    return search_components(sys.argv[1])


if __name__ == "__main__":
    sys.exit(main())
