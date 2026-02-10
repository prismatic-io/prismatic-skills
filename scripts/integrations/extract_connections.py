#!/usr/bin/env python3
"""
extract_connections.py

PURPOSE: Extract and format connection types from a stored component object

USE CASE:
  After a component is selected (with store_full_object: true), this script
  extracts the connections array and formats it for the connection type
  selection question.

  This works with the nested property access in gather_requirements.py:
  - {source_component.connections} -> JSON array of connections
  - This script parses and formats them for the UI

USAGE: python extract_connections.py '<json-connections-array>'

PARAMETERS:
  json-connections-array - JSON array of connection objects from search_components.py

EXIT CODES:
  0 - Success: Connections formatted and displayed
  1 - Error: No input provided or invalid JSON
"""

import json
import sys


def format_connections(connections):
    """
    Format connections for requirements gathering UI.
    Returns list with 'key', 'label', and 'inputs' fields.
    The 'inputs' field contains full input details for credential inference.
    """
    formatted = []
    for conn in connections:
        key = conn.get("key", "")
        label = conn.get("label", key)
        auth_type = conn.get("auth_type", "")

        # Create descriptive label for user selection
        display_label = label
        if auth_type and auth_type.lower() not in label.lower():
            display_label = f"{label} ({auth_type})"

        formatted.append(
            {
                "key": key,
                "label": display_label,
                "auth_type": auth_type,
                "required_inputs": conn.get("required_inputs", []),
                "inputs": conn.get("inputs", []),  # Pass through full input details
            }
        )
    return formatted


def main():
    if len(sys.argv) < 2:
        print("❌ No connections data provided", file=sys.stderr)
        print("Usage: python extract_connections.py '<json-connections-array>'")
        print("[]")
        return 0  # Return empty array, not error - component may have no connections

    connections_json = sys.argv[1]

    # Handle empty or "null" input
    if not connections_json or connections_json in ("", "null", "None", "[]"):
        print("ℹ️  No connections found for this component", file=sys.stderr)
        print("[]")
        return 0

    try:
        connections = json.loads(connections_json)
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON: {e}", file=sys.stderr)
        print("[]")
        return 0  # Return empty array - don't block the flow

    if not connections or not isinstance(connections, list):
        print("ℹ️  Component has no connection types defined", file=sys.stderr)
        print("[]")
        return 0

    # Format and output
    formatted = format_connections(connections)
    print(json.dumps(formatted, indent=2))

    # Human guidance to stderr
    print("", file=sys.stderr)
    print(f"🔐 Found {len(formatted)} connection type(s)", file=sys.stderr)
    for conn in formatted:
        print(f"  • {conn['label']}", file=sys.stderr)
    print("", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
