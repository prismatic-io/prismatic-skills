#!/usr/bin/env python3
"""
create_organization_connection.py

PURPOSE: Create organization-managed connections via Prismatic GraphQL API using
         scoped config variables (per-customer connections managed by org).

USAGE: python create_organization_connection.py \\
    --component-key <key> \\
    --connection-key <key> \\
    --name <name> \\
    [--api-key <value>] \\
    [--base-url <value>] \\
    [--stable-key <key>] \\
    [--skip-test-connection]

PARAMETERS:
  --component-key        Component key (e.g., acme, tulyp)
  --connection-key       Connection key from component (e.g., acmeApiKey)
  --name                 Human-readable name for the connection
  --api-key              Optional API key value to set
  --base-url             Optional base URL value to set
  --stable-key           Optional stable key (defaults to {component-key}-api-key)
  --skip-test-connection Skip creating test customer config variable

HOW IT WORKS:
  Creates a two-tier connection structure:

  1. Scoped Config Variable (Template)
     - variableScope: "customer" (each customer gets their own instance)
     - managedBy: "org" (organization provides credentials, not customers)
     - Inputs have meta but NO values (values go in customer config var)

  2. Customer Config Variable (Test Instance)
     - Linked to the scoped config variable template
     - isTest: true (for development/testing)
     - Contains actual credential values (api_key, base_url, etc.)

  This pattern enables:
  - Per-customer connection instances
  - Org-managed credentials (customers don't see/configure them)
  - Test connections for development without a real customer

USAGE IN CNI:
  Reference with: organizationActivatedConnection({ stableKey: "acme-api-key" })

GRAPHQL MUTATIONS:
  1. createScopedConfigVariable (template)
  2. createCustomerConfigVariable (test instance with values)

RETURNS (JSON):
  {
    "stable_key": "acme-api-key",
    "name": "Acme Demo Connection",
    "scoped_config_variable_id": "U2NvcGVkQ29uZmlnVmFyaWFibGU6...",
    "customer_config_variable_id": "Q3VzdG9tZXJDb25maWdWYXJpYWJsZTo...",
    "is_test": true,
    "already_existed": false
  }

EXIT CODES:
  0 - Success
  1 - Authentication error
  3 - API error
"""

import argparse
import json
import os
import sys

SHARED_DIR = os.path.join(os.path.dirname(__file__), '..', 'shared')
sys.path.insert(0, SHARED_DIR)

from graphql import graphql, ensure_authenticated, GraphQLError


def find_connection(component_key, connection_key):
    """Find a connection definition from a component."""
    query = """
    query listComponents($key: String) {
      components(key: $key) {
        nodes {
          id
          key
          connections {
            nodes {
              id
              key
              label
              inputs {
                nodes {
                  key
                  label
                  type
                  default
                }
              }
            }
          }
        }
      }
    }
    """

    try:
        data = graphql(query, {"key": component_key})
    except GraphQLError as e:
        return None, str(e)

    try:
        components = data.get("components", {}).get("nodes", [])
        for component in components:
            if component["key"] == component_key:
                for connection in component["connections"]["nodes"]:
                    if connection["key"] == connection_key:
                        return connection, None
    except (KeyError, TypeError):
        pass

    return None, f"Connection '{connection_key}' not found in component '{component_key}'"


def check_existing_scoped_config_variable(stable_key):
    """Check if a scoped config variable already exists with the given stable key."""
    query = """
    query listScopedConfigVariables($stableKey: String) {
      scopedConfigVariables(stableKey: $stableKey) {
        nodes {
          id
          key
          stableKey
          description
          variableScope
          managedBy
          status
          customerConfigVariables {
            nodes {
              id
              isTest
              status
            }
          }
        }
      }
    }
    """

    try:
        data = graphql(query, {"stableKey": stable_key})
    except GraphQLError:
        return None

    try:
        configs = data.get("scopedConfigVariables", {}).get("nodes", [])
        for config in configs:
            if config["stableKey"] == stable_key:
                return config
    except (KeyError, TypeError):
        pass

    return None


def create_scoped_config_variable(
    connection_def, name, stable_key, description=None
):
    """Create a scoped config variable template (NO values in inputs).

    For variableScope: customer, inputs must NOT have values - only meta.
    The actual credential values are set in the customer config variable.
    """

    # Build inputs with meta and empty values
    # Note: API requires 'value' field even for customer-scoped variables
    inputs = []
    for input_node in connection_def.get("inputs", {}).get("nodes", []):
        input_entry = {
            "name": input_node["key"],
            "type": "value",
            "value": "",  # Empty placeholder - actual values set in customer config var
            "meta": json.dumps({"managedBy": "org", "inputScope": "customer"})
        }
        inputs.append(input_entry)

    mutation = """
    mutation createScopedConfigVariable(
      $key: String!
      $description: String!
      $stableKey: String!
      $variableScope: String!
      $managedBy: String!
      $connection: ID!
      $inputs: [InputExpression]
    ) {
      createScopedConfigVariable(
        input: {
          key: $key
          description: $description
          stableKey: $stableKey
          variableScope: $variableScope
          managedBy: $managedBy
          connection: $connection
          inputs: $inputs
        }
      ) {
        scopedConfigVariable {
          id
          key
          stableKey
          variableScope
          managedBy
          status
        }
        errors {
          field
          messages
        }
      }
    }
    """

    variables = {
        "key": name,
        "description": description or f"Organization connection for {name}",
        "stableKey": stable_key,
        "variableScope": "customer",  # Must be lowercase string
        "managedBy": "org",  # Must be lowercase string
        "connection": connection_def["id"],
        "inputs": inputs,
    }

    try:
        data = graphql(mutation, variables, timeout=60)
    except GraphQLError as e:
        return None, str(e)

    try:
        mutation_result = data.get("createScopedConfigVariable", {})

        if mutation_result.get("errors"):
            error_msgs = []
            for err in mutation_result["errors"]:
                error_msgs.append(f"{err['field']}: {', '.join(err['messages'])}")
            return None, "; ".join(error_msgs)

        return mutation_result["scopedConfigVariable"], None
    except (KeyError, TypeError) as e:
        return None, f"Unexpected response format: {e}"


def find_existing_test_customer_config_variable(scoped_config_var):
    """Find an existing test customer config variable for this scoped var.

    Args:
        scoped_config_var: The scoped config variable dict (from query)

    Returns:
        The customer config variable dict if found, None otherwise
    """
    try:
        customer_vars = scoped_config_var.get("customerConfigVariables", {}).get("nodes", [])
        for var in customer_vars:
            if var.get("isTest") is True:
                return var
    except (KeyError, TypeError):
        pass

    return None


def create_customer_config_variable(
    scoped_config_var_id, field_values=None
):
    """Create a test customer config variable WITH actual credential values.

    This is where the actual API keys and URLs are stored.

    Args:
        scoped_config_var_id: ID of the scoped config variable template
        field_values: Dict of input name -> value (e.g., {"api_key": "...", "app_base_url": "..."})
    """

    # Build inputs WITH actual values
    inputs = []
    if field_values:
        for name, value in field_values.items():
            if value is not None:
                inputs.append({
                    "name": name,
                    "type": "value",
                    "value": value
                })

    mutation = """
    mutation createCustomerConfigVariable(
      $scopedConfigVariable: ID!
      $customer: ID
      $isTest: Boolean
      $inputs: [InputExpression]
    ) {
      createCustomerConfigVariable(
        input: {
          scopedConfigVariable: $scopedConfigVariable
          customer: $customer
          isTest: $isTest
          inputs: $inputs
        }
      ) {
        customerConfigVariable {
          id
          isTest
          status
        }
        errors {
          field
          messages
        }
      }
    }
    """

    variables = {
        "scopedConfigVariable": scoped_config_var_id,
        "customer": None,  # null for test connections
        "isTest": True,
        "inputs": inputs,
    }

    try:
        data = graphql(mutation, variables, timeout=60)
    except GraphQLError as e:
        return None, str(e)

    try:
        mutation_result = data.get("createCustomerConfigVariable", {})

        if mutation_result.get("errors"):
            error_msgs = []
            for err in mutation_result["errors"]:
                error_msgs.append(f"{err['field']}: {', '.join(err['messages'])}")
            return None, "; ".join(error_msgs)

        return mutation_result["customerConfigVariable"], None
    except (KeyError, TypeError) as e:
        return None, f"Unexpected response format: {e}"


def main():
    parser = argparse.ArgumentParser(
        description="Create organization-managed connection via Prismatic GraphQL API"
    )
    parser.add_argument(
        "--component-key",
        required=True,
        help="Component key (e.g., acme, tulyp)",
    )
    parser.add_argument(
        "--connection-key",
        required=True,
        help="Connection key from component (e.g., acmeApiKey)",
    )
    parser.add_argument(
        "--name",
        required=True,
        help="Human-readable name for the connection",
    )
    parser.add_argument(
        "--api-key",
        default=None,
        help="API key value to set",
    )
    parser.add_argument(
        "--base-url",
        default=None,
        help="Base URL value to set",
    )
    parser.add_argument(
        "--stable-key",
        default=None,
        help="Stable key (defaults to {component-key}-api-key)",
    )
    parser.add_argument(
        "--skip-test-connection",
        action="store_true",
        help="Skip creating test customer config variable",
    )

    args = parser.parse_args()

    # Generate stable key if not provided
    stable_key = args.stable_key or f"{args.component_key}-api-key"

    print("=" * 60)
    print("  Create Organization Connection (Scoped)")
    print("=" * 60)
    print("")
    print(f"Component: {args.component_key}")
    print(f"Connection: {args.connection_key}")
    print(f"Name: {args.name}")
    print(f"Stable Key: {stable_key}")
    print("")

    # Verify authentication
    try:
        ensure_authenticated()
    except GraphQLError:
        print("Error: Not authenticated with Prismatic")
        print("Run 'prism login' first")
        return 1

    print("Authenticated with Prismatic")

    # Track what we created vs found
    scoped_var_existed = False
    customer_var_existed = False
    scoped_config_var = None
    customer_config_var = None

    # Check if scoped config variable already exists
    print("Checking for existing scoped config variable...")
    existing_scoped = check_existing_scoped_config_variable(stable_key)

    if existing_scoped:
        print(f"Scoped config variable already exists: {existing_scoped['key']} (ID: {existing_scoped['id']})")
        scoped_config_var = existing_scoped
        scoped_var_existed = True

        # Check for existing test customer config var
        existing_test = find_existing_test_customer_config_variable(existing_scoped)
        if existing_test:
            print(f"Test customer config variable already exists: {existing_test['id']}")
            customer_config_var = existing_test
            customer_var_existed = True
    else:
        # Find the connection definition from the component
        print(f"Finding connection '{args.connection_key}' in component '{args.component_key}'...")
        connection_def, error = find_connection(args.component_key, args.connection_key)

        if error:
            print(f"Error: {error}")
            return 3

        print(f"Found connection: {connection_def['label']}")

        # Create the scoped config variable
        print("Creating scoped config variable...")
        scoped_config_var, error = create_scoped_config_variable(
            connection_def, args.name, stable_key
        )

        if error:
            print(f"Error creating scoped config variable: {error}")
            return 3

        print(f"Created scoped config variable: {scoped_config_var['id']}")

    # Create test customer config variable if not skipped and doesn't exist
    if not args.skip_test_connection and not customer_var_existed:
        # Build field values
        field_values = {}
        if args.api_key:
            field_values["api_key"] = args.api_key
        if args.base_url:
            field_values["app_base_url"] = args.base_url

        print("Creating test customer config variable...")
        customer_config_var, error = create_customer_config_variable(
            scoped_config_var["id"], field_values
        )

        if error:
            print(f"Error creating customer config variable: {error}")
            return 3

        print(f"Created test customer config variable: {customer_config_var['id']}")

    print("")
    print("=" * 60)
    print("  CONNECTION CREATED")
    print("=" * 60)
    print("")

    # Output JSON result
    result = {
        "stable_key": stable_key,
        "name": args.name,
        "scoped_config_variable_id": scoped_config_var["id"],
        "scoped_var_already_existed": scoped_var_existed,
    }

    if customer_config_var:
        result["customer_config_variable_id"] = customer_config_var["id"]
        result["is_test"] = True
        result["customer_var_already_existed"] = customer_var_existed

    print(json.dumps(result, indent=2))

    print("")
    print("Use this stable_key in your CNI integration:")
    print(f'  organizationActivatedConnection({{ stableKey: "{stable_key}" }})')

    return 0


if __name__ == "__main__":
    sys.exit(main())
