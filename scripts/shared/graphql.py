#!/usr/bin/env python3
"""
graphql.py

PURPOSE: Thin wrapper around `prism graphql:query` for executing GraphQL
         queries and mutations against the Prismatic API.

USAGE:
    from shared.graphql import graphql, ensure_authenticated, GraphQLError

    # Execute a query
    data = graphql('query { customers { nodes { id name } } }')

    # Execute with variables
    data = graphql(
        'query($id: ID!) { customer(id: $id) { name } }',
        variables={"id": "Q3VzdG9tZXI6..."}
    )

    # Pre-flight auth check
    ensure_authenticated()

WHY THIS EXISTS:
    Replaces prismatic_api.py (custom Auth0 token exchange + HTTP client) with
    a thin wrapper around `prism graphql:query`, which handles authentication
    natively. Uses prism_retry.py for retry logic.

AUTHENTICATION:
    Handled entirely by the Prism CLI. User must be logged in via `prism login`.
    No refresh tokens, Auth0 exchange, or environment variables needed.

"""

import json

from prism_retry import run_prism_query


class GraphQLError(Exception):
    """Exception raised for GraphQL query failures."""

    pass


def graphql(query, variables=None, timeout=30):
    """Execute a GraphQL query/mutation via prism CLI.

    Args:
        query: GraphQL query or mutation string
        variables: Optional dict of query variables
        timeout: Command timeout in seconds (default: 30)

    Returns:
        The parsed JSON response data object from prism graphql:query.
        For queries, this is the top-level data object (e.g., {"customers": {...}}).

    Raises:
        GraphQLError: If the command fails or returns an error
    """
    cmd = ["prism", "graphql:query", query]
    if variables:
        cmd.extend(["--variables", json.dumps(variables)])

    result = run_prism_query(cmd, timeout=timeout)

    if result.returncode != 0:
        error_msg = result.stderr.strip() if result.stderr else "Unknown error"
        raise GraphQLError(f"Query failed: {error_msg}")

    if not result.stdout or not result.stdout.strip():
        raise GraphQLError("Query returned empty response")

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as e:
        raise GraphQLError(f"Failed to parse response: {e}")


def ensure_authenticated():
    """Pre-flight auth check. Raises GraphQLError if not logged in.

    Verifies that the user is authenticated with Prism CLI by running `prism me`.
    """
    result = run_prism_query(["prism", "me"], timeout=15)
    if result.returncode != 0:
        raise GraphQLError(
            "Not authenticated with Prismatic. Run 'prism login' first."
        )


if __name__ == "__main__":
    import sys

    try:
        ensure_authenticated()
        data = graphql("query { authenticatedUser { email name org { name } } }")
        user = data.get("authenticatedUser", {})
        print(f"Authenticated as: {user.get('email')} ({user.get('name')})")
        print(f"Organization: {user.get('org', {}).get('name')}")
    except GraphQLError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
