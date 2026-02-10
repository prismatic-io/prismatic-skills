#!/usr/bin/env python3
"""
get_credential_prompts.py

PURPOSE: Infer credential prompts from a component's connection inputs

USE CASE:
    After a user selects a connection type (e.g., Jira OAuth2), this script
    analyzes the connection inputs and determines which credentials should
    be prompted for to write to the .env file.

USAGE: python get_credential_prompts.py <component_key> '<connection_json>'

PARAMETERS:
    component_key   - The component key (e.g., "atlassian-jira", "slack")
    connection_json - JSON object containing the selected connection with 'inputs' array

OUTPUT: JSON array of credential prompts:
[
  {
    "env_var": "JIRA_CLIENT_ID",
    "label": "Jira Client ID",
    "input_key": "clientId",
    "required": true,
    "sensitive": false,
    "hint": "OAuth 2.0 Client ID from your Jira app settings"
  },
  ...
]

EXIT CODES:
  0 - Success: Credential prompts generated
  1 - Error: Missing arguments or invalid JSON
"""

import json
import re
import sys


# Common credential input keys that should always be prompted for
CREDENTIAL_PATTERNS = {
    "clientId": {"hint": "OAuth 2.0 Client ID from your app settings", "sensitive": False},
    "clientSecret": {"hint": "OAuth 2.0 Client Secret from your app settings", "sensitive": True},
    "apiKey": {"hint": "API key for authentication", "sensitive": True},
    "signingSecret": {"hint": "Signing secret for webhook verification", "sensitive": True},
    "token": {"hint": "Authentication token", "sensitive": True},
    "secret": {"hint": "Secret key for authentication", "sensitive": True},
    "accessToken": {"hint": "Access token for API calls", "sensitive": True},
    "refreshToken": {"hint": "Refresh token for OAuth", "sensitive": True},
    "privateKey": {"hint": "Private key for authentication", "sensitive": True},
    "appId": {"hint": "Application ID", "sensitive": False},
    "appSecret": {"hint": "Application secret", "sensitive": True},
    "consumerKey": {"hint": "Consumer key for OAuth 1.0", "sensitive": False},
    "consumerSecret": {"hint": "Consumer secret for OAuth 1.0", "sensitive": True},
}

# Keys that typically have sensible defaults and shouldn't be prompted
SKIP_PATTERNS = [
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
]


def extract_prefix_from_component_key(component_key):
    """
    Extract environment variable prefix from component key.

    Examples:
        "atlassian-jira" -> "JIRA"
        "slack" -> "SLACK"
        "microsoft-outlook" -> "OUTLOOK"
        "salesforce" -> "SALESFORCE"
        "google-sheets" -> "SHEETS"
    """
    # Take last segment of hyphenated key
    parts = component_key.split("-")
    prefix = parts[-1] if parts else component_key
    return prefix.upper()


def camel_to_screaming_snake(name):
    """
    Convert camelCase to SCREAMING_SNAKE_CASE.

    Examples:
        "clientId" -> "CLIENT_ID"
        "clientSecret" -> "CLIENT_SECRET"
        "signingSecret" -> "SIGNING_SECRET"
        "apiKey" -> "API_KEY"
    """
    # Insert underscore before uppercase letters and uppercase everything
    result = re.sub(r'([a-z])([A-Z])', r'\1_\2', name)
    return result.upper()


def should_prompt_for_input(inp):
    """
    Determine if an input should be prompted for credentials.

    Returns True if:
    - Input is required AND has no sensible default, OR
    - Input type is "password" (always sensitive), OR
    - Input key matches common credential patterns
    """
    key = inp.get("key", "")
    input_type = inp.get("type", "")
    required = inp.get("required", False)
    default = inp.get("default")

    # Skip inputs that are in the skip list
    if key in SKIP_PATTERNS:
        return False

    # Skip inputs with URL defaults (authorization URLs, etc.)
    if default and isinstance(default, str):
        if default.startswith(("http://", "https://")):
            return False

    # Password type inputs are always credentials
    if input_type == "password":
        return True

    # Check if key matches credential patterns
    if key in CREDENTIAL_PATTERNS:
        return True

    # Check if key contains credential-like terms
    credential_terms = ["id", "secret", "key", "token", "password", "credential"]
    key_lower = key.lower()
    if any(term in key_lower for term in credential_terms):
        # But not if it's a well-known URL or config field
        if not any(skip.lower() in key_lower for skip in SKIP_PATTERNS):
            return True

    return False


def is_sensitive(inp):
    """Determine if an input contains sensitive data."""
    key = inp.get("key", "")
    input_type = inp.get("type", "")

    # Password type is always sensitive
    if input_type == "password":
        return True

    # Check credential patterns
    if key in CREDENTIAL_PATTERNS:
        return CREDENTIAL_PATTERNS[key].get("sensitive", False)

    # Heuristics for other keys
    sensitive_terms = ["secret", "password", "token", "key", "private"]
    key_lower = key.lower()
    return any(term in key_lower for term in sensitive_terms)


def get_hint(inp, component_key):
    """Get a helpful hint for the credential input."""
    key = inp.get("key", "")
    label = inp.get("label", "")

    # Check credential patterns for predefined hints
    if key in CREDENTIAL_PATTERNS:
        base_hint = CREDENTIAL_PATTERNS[key].get("hint", "")
        # Customize with component name
        prefix = extract_prefix_from_component_key(component_key)
        return base_hint.replace("your app", f"your {prefix.title()} app")

    # Generate hint from label
    if label:
        return f"Enter the {label} value"

    return ""


def format_label(inp, component_key):
    """Format a human-readable label for the credential prompt."""
    key = inp.get("key", "")
    label = inp.get("label", "")

    # Use the label if available, otherwise humanize the key
    if label:
        base_label = label
    else:
        # Convert camelCase to Title Case
        base_label = re.sub(r'([a-z])([A-Z])', r'\1 \2', key).title()

    # Add component prefix for clarity
    prefix = extract_prefix_from_component_key(component_key)

    # Avoid redundancy if prefix already in label
    if prefix.lower() not in base_label.lower():
        return f"{prefix.title()} {base_label}"

    return base_label


def generate_credential_prompts(component_key, connection):
    """
    Generate credential prompt definitions from a connection object.

    Args:
        component_key: Component key (e.g., "atlassian-jira")
        connection: Connection object with 'inputs' array

    Returns:
        List of credential prompt dicts
    """
    inputs = connection.get("inputs", [])
    prefix = extract_prefix_from_component_key(component_key)

    prompts = []

    for inp in inputs:
        if not should_prompt_for_input(inp):
            continue

        key = inp.get("key", "")
        env_var = f"{prefix}_{camel_to_screaming_snake(key)}"

        prompts.append({
            "env_var": env_var,
            "label": format_label(inp, component_key),
            "input_key": key,
            "required": inp.get("required", False),
            "sensitive": is_sensitive(inp),
            "hint": get_hint(inp, component_key),
        })

    return prompts


def main():
    if len(sys.argv) < 3:
        print("Usage: python get_credential_prompts.py <component_key> '<connection_json>'", file=sys.stderr)
        print("[]")
        return 1

    component_key = sys.argv[1]
    connection_json = sys.argv[2]

    # Handle empty or null input
    if not connection_json or connection_json in ("", "null", "None", "{}"):
        print("No connection data provided", file=sys.stderr)
        print("[]")
        return 0

    try:
        connection = json.loads(connection_json)
    except json.JSONDecodeError as e:
        print(f"Invalid JSON: {e}", file=sys.stderr)
        print("[]")
        return 1

    # Generate credential prompts
    prompts = generate_credential_prompts(component_key, connection)

    # Output JSON to stdout
    print(json.dumps(prompts, indent=2))

    # Human guidance to stderr
    if prompts:
        print("", file=sys.stderr)
        print(f"Found {len(prompts)} credential(s) to prompt for:", file=sys.stderr)
        for p in prompts:
            sensitive_marker = " (sensitive)" if p["sensitive"] else ""
            print(f"  - {p['env_var']}: {p['label']}{sensitive_marker}", file=sys.stderr)
        print("", file=sys.stderr)
    else:
        print("No credentials needed for this connection type", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
