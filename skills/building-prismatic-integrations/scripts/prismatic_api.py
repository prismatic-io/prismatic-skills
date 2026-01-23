#!/usr/bin/env python3
"""
prismatic_api.py

PURPOSE: Direct API client for Prismatic GraphQL API (no Prism CLI dependency)

This module provides direct API access for operations needed during Phase 2
requirements gathering, before Prism CLI is necessarily installed.

USAGE:
    from prismatic_api import get_api, PrismaticAPIError

    api = get_api()
    result = api.graphql(query, variables)

AUTHENTICATION FLOW:
    1. Fetch auth config from {PRISMATIC_URL}/auth/meta
    2. Exchange refresh token for access token via Auth0
    3. Use access token for GraphQL API calls

RETRY BEHAVIOR:
    - Network errors: Retry with exponential backoff (5 attempts, 1-10s delays)
    - Auth errors: No retry (fail fast)
    - Rate limits (429): Retry with backoff

"""

import json
import os
import random
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_PRISMATIC_URL = "https://app.prismatic.io"

# Retry configuration
MAX_RETRIES = 5
BASE_DELAY = 1.0  # seconds
MAX_DELAY = 10.0  # seconds
JITTER = 0.5  # randomness factor

# Error patterns for classification
NETWORK_ERROR_PATTERNS = [
    "enotfound",
    "econnrefused",
    "econnreset",
    "timeout",
    "network error",
    "could not resolve",
    "getaddrinfo",
    "connection refused",
    "failed to fetch",
    "socket hang up",
    "temporary failure",
    "name or service not known",
]

AUTH_ERROR_PATTERNS = [
    "unauthorized",
    "invalid token",
    "authentication failed",
    "access_denied",
    "token expired",
    "forbidden",
    "invalid_grant",
]


def _is_retryable_error(error):
    """Check if an error is retryable (network issues, rate limits)."""
    error_str = str(error).lower()

    # Network errors are retryable
    if any(pattern in error_str for pattern in NETWORK_ERROR_PATTERNS):
        return True

    # HTTP errors
    if isinstance(error, urllib.error.HTTPError):
        # Rate limits and server errors are retryable
        if error.code in (429, 500, 502, 503, 504):
            return True
        # Auth errors are not retryable
        if error.code in (401, 403):
            return False

    # URLError (network issues) are retryable
    if isinstance(error, urllib.error.URLError):
        return True

    return False


def _is_auth_error(error):
    """Check if an error is an authentication error."""
    error_str = str(error).lower()
    if any(pattern in error_str for pattern in AUTH_ERROR_PATTERNS):
        return True
    if isinstance(error, urllib.error.HTTPError) and error.code in (401, 403):
        return True
    return False


class PrismaticAPIError(Exception):
    """Exception raised for Prismatic API errors."""

    pass


class PrismaticAPI:
    """Direct API client for Prismatic GraphQL API."""

    def __init__(self, refresh_token=None, prismatic_url=None):
        """Initialize the API client.

        Args:
            refresh_token: Prismatic refresh token. If not provided, loads from environment.
            prismatic_url: Prismatic instance URL. Defaults to https://app.prismatic.io
        """
        self.refresh_token = refresh_token or os.environ.get("PRISM_REFRESH_TOKEN")
        self.prismatic_url = (
            prismatic_url or os.environ.get("PRISMATIC_URL") or DEFAULT_PRISMATIC_URL
        ).rstrip("/")

        if not self.refresh_token:
            raise PrismaticAPIError(
                "No refresh token provided. Set PRISM_REFRESH_TOKEN or pass refresh_token."
            )

        self._access_token = None
        self._token_expires_at = 0
        self._auth_config = None

    def _request_with_retry(self, make_request, operation_name="request"):
        """Execute a request with retry logic.

        Args:
            make_request: Callable that makes the request and returns result
            operation_name: Name for logging

        Returns:
            Result from make_request

        Raises:
            PrismaticAPIError: If all retries fail
        """
        last_error = None

        for attempt in range(MAX_RETRIES):
            try:
                return make_request()

            except (urllib.error.URLError, urllib.error.HTTPError, OSError) as e:
                last_error = e

                # Don't retry auth errors
                if _is_auth_error(e):
                    break

                # Check if retryable
                if not _is_retryable_error(e):
                    break

                # Don't retry on last attempt
                if attempt == MAX_RETRIES - 1:
                    break

                # Calculate delay with exponential backoff and jitter
                delay = min(BASE_DELAY * (2**attempt), MAX_DELAY)
                jitter_amount = delay * JITTER * (random.random() * 2 - 1)
                sleep_time = max(0.1, delay + jitter_amount)

                time.sleep(sleep_time)

        # All retries exhausted
        if last_error:
            raise last_error
        raise PrismaticAPIError(f"{operation_name} failed after {MAX_RETRIES} attempts")

    def _get_auth_config(self):
        """Fetch auth configuration from Prismatic server."""
        if self._auth_config:
            return self._auth_config

        url = f"{self.prismatic_url}/auth/meta"

        def make_request():
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=30) as response:
                data = json.loads(response.read().decode())
                return {
                    "domain": data["domain"],
                    "client_id": data["clientId"],
                    "audience": data.get("audience"),
                }

        try:
            self._auth_config = self._request_with_retry(
                make_request, "fetch auth config"
            )
            return self._auth_config
        except (urllib.error.URLError, urllib.error.HTTPError) as e:
            raise PrismaticAPIError(f"Failed to fetch auth config: {e}")
        except (json.JSONDecodeError, KeyError) as e:
            raise PrismaticAPIError(f"Invalid auth config response: {e}")

    def _refresh_access_token(self):
        """Exchange refresh token for access token."""
        auth_config = self._get_auth_config()

        url = f"https://{auth_config['domain']}/oauth/token"
        data = urllib.parse.urlencode(
            {
                "grant_type": "refresh_token",
                "client_id": auth_config["client_id"],
                "refresh_token": self.refresh_token,
            }
        ).encode()

        def make_request():
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.loads(response.read().decode())

        try:
            result = self._request_with_retry(make_request, "token refresh")

            if "error" in result:
                raise PrismaticAPIError(
                    f"Auth error: {result.get('error_description', result['error'])}"
                )

            self._access_token = result["access_token"]
            # Expire 5 minutes early to be safe
            self._token_expires_at = time.time() + result.get("expires_in", 3600) - 300
            return self._access_token

        except urllib.error.HTTPError as e:
            body = e.read().decode() if e.fp else ""
            raise PrismaticAPIError(f"Token refresh failed ({e.code}): {body}")
        except urllib.error.URLError as e:
            raise PrismaticAPIError(f"Token refresh failed: {e}")

    def _get_access_token(self):
        """Get valid access token, refreshing if necessary."""
        if self._access_token and time.time() < self._token_expires_at:
            return self._access_token
        return self._refresh_access_token()

    def graphql(self, query, variables=None):
        """Execute a GraphQL query against the Prismatic API.

        Args:
            query: GraphQL query string
            variables: Optional dict of query variables

        Returns:
            The 'data' field from the response

        Raises:
            PrismaticAPIError: If the request fails or returns errors
        """
        access_token = self._get_access_token()
        url = f"{self.prismatic_url}/api"

        payload = json.dumps(
            {
                "query": query,
                "variables": variables or {},
            }
        ).encode()

        def make_request():
            req = urllib.request.Request(
                url,
                data=payload,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                    "Prismatic-Client": "prism",
                },
            )
            with urllib.request.urlopen(req, timeout=60) as response:
                return json.loads(response.read().decode())

        try:
            result = self._request_with_retry(make_request, "GraphQL query")

            if "errors" in result:
                error_msgs = [e.get("message", str(e)) for e in result["errors"]]
                raise PrismaticAPIError(f"GraphQL errors: {'; '.join(error_msgs)}")

            if "data" not in result:
                raise PrismaticAPIError(f"Invalid GraphQL response: {result}")

            return result["data"]

        except urllib.error.HTTPError as e:
            body = e.read().decode() if e.fp else ""
            raise PrismaticAPIError(f"GraphQL request failed ({e.code}): {body}")
        except urllib.error.URLError as e:
            raise PrismaticAPIError(f"GraphQL request failed: {e}")

    def verify_auth(self):
        """Verify authentication works by fetching current user info.

        Returns:
            Dict with user info if successful

        Raises:
            PrismaticAPIError: If authentication fails
        """
        query = """
        query me {
            authenticatedUser {
                id
                email
                name
                org {
                    id
                    name
                }
            }
        }
        """
        data = self.graphql(query)
        return data.get("authenticatedUser")


def load_credentials():
    """Load credentials from Prism CLI or environment variables.

    Priority:
    1. Prism CLI (if logged in) - extracts from prism me:token and prism me
    2. Environment variables (PRISM_REFRESH_TOKEN, PRISMATIC_URL)

    Returns:
        Tuple of (refresh_token, prismatic_url)
    """
    refresh_token = None
    prismatic_url = None

    # Try Prism CLI first (preferred - uses native auth)
    try:
        # Get refresh token from prism CLI
        result = subprocess.run(
            ["prism", "me:token", "--type", "refresh"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            refresh_token = result.stdout.strip()

        # Get URL from prism me output
        result = subprocess.run(
            ["prism", "me"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            for line in result.stdout.split("\n"):
                if ":" in line:
                    key, value = line.split(":", 1)
                    key = key.strip().lower()
                    if key in ("endpoint url", "endpoint"):
                        prismatic_url = value.strip()
                        break
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass  # Prism CLI not available, fall back to env vars

    # Fall back to environment variables
    if not refresh_token:
        refresh_token = os.environ.get("PRISM_REFRESH_TOKEN")
    if not prismatic_url:
        prismatic_url = os.environ.get("PRISMATIC_URL")

    return refresh_token, prismatic_url or DEFAULT_PRISMATIC_URL


def get_api():
    """Get a configured PrismaticAPI instance using stored credentials.

    Returns:
        PrismaticAPI instance

    Raises:
        PrismaticAPIError: If no credentials found
    """
    refresh_token, prismatic_url = load_credentials()
    if not refresh_token:
        raise PrismaticAPIError(
            "No credentials found. Please log in with 'prism login' or set PRISM_REFRESH_TOKEN."
        )
    return PrismaticAPI(refresh_token, prismatic_url)


if __name__ == "__main__":
    # Simple test
    import sys

    try:
        api = get_api()
        user = api.verify_auth()
        print(f"Authenticated as: {user.get('email')} ({user.get('name')})")
        print(f"Organization: {user.get('org', {}).get('name')}")
    except PrismaticAPIError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
