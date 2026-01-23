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
import sys

from prismatic_api import PrismaticAPIError, get_api

# GraphQL query for searching components
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
        }
        pageInfo {
            hasNextPage
            endCursor
        }
    }
}
"""


def search_components_api(api, search_term):
    """Search for components using the GraphQL API.

    Args:
        api: PrismaticAPI instance
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

        data = api.graphql(SEARCH_COMPONENTS_QUERY, variables)
        components_data = data.get("components", {})
        nodes = components_data.get("nodes", [])
        all_components.extend(nodes)

        page_info = components_data.get("pageInfo", {})
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")

    return all_components


def format_for_requirements(components):
    """
    Format components for requirements gathering script.
    Returns list with 'key' and 'label' fields as expected by requirements-questions.json.
    """
    formatted = []
    for comp in components:
        key = comp.get("key", "")
        label = comp.get("label", comp.get("name", "Unknown"))
        description = comp.get("description", "")

        formatted.append(
            {
                "key": key,
                "label": label,
                "description": description,
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
        print(f"  {comp['label']}", file=sys.stderr)
        if comp.get("description"):
            desc = (
                comp["description"][:80] + "..."
                if len(comp.get("description", "")) > 80
                else comp["description"]
            )
            print(f"    {desc}", file=sys.stderr)

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
        api = get_api()
        components = search_components_api(api, search_term)

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

    except PrismaticAPIError as e:
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
