#!/usr/bin/env python3
"""
prism_auth.py

Shared utility for Prismatic authentication across all scripts.

Extracts credentials on-demand from the Prism CLI. The user must be logged in
via `prism login` before using these functions.

This approach relies on Prism CLI's native authentication state rather than
maintaining a separate credential store.
"""

import subprocess
import sys


def get_refresh_token():
    """
    Get refresh token from Prism CLI.

    Returns:
        str: Refresh token if logged in, None otherwise
    """
    try:
        result = subprocess.run(
            ["prism", "me:token", "--type", "refresh"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode == 0:
            return result.stdout.strip()
        else:
            return None

    except FileNotFoundError:
        print("❌ Prism CLI not found")
        print("   Install with: npm install -g @prismatic-io/prism")
        return None
    except subprocess.TimeoutExpired:
        print("⚠️  Token retrieval timed out")
        return None
    except Exception as e:
        print(f"⚠️  Error getting token: {e}")
        return None


def get_prismatic_url():
    """
    Get Prismatic URL from Prism CLI.

    Returns:
        str: Endpoint URL if logged in, None otherwise
    """
    try:
        result = subprocess.run(
            ["prism", "me"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode == 0:
            # Parse output to extract endpoint URL
            for line in result.stdout.split("\n"):
                if ":" in line:
                    key, value = line.split(":", 1)
                    key = key.strip().lower()
                    if key in ("endpoint url", "endpoint"):
                        return value.strip()
            return None
        else:
            return None

    except FileNotFoundError:
        return None
    except subprocess.TimeoutExpired:
        return None
    except Exception:
        return None


def get_credentials():
    """
    Get both refresh token and Prismatic URL from Prism CLI.

    Returns:
        dict: {"token": str or None, "url": str or None}
    """
    return {
        "token": get_refresh_token(),
        "url": get_prismatic_url(),
    }


def ensure_logged_in():
    """
    Verify user is logged in to Prism CLI.

    Returns:
        bool: True if logged in, False otherwise
    """
    try:
        result = subprocess.run(
            ["prism", "me"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.returncode == 0
    except Exception:
        return False


def ensure_token():
    """
    Get refresh token or exit with error if not logged in.

    Returns:
        str: Token (guaranteed to exist if function returns)

    Raises:
        SystemExit: If not logged in (exits with code 2)
    """
    token = get_refresh_token()

    if not token:
        print("❌ Not logged in to Prism")
        print("")
        print("Please log in first:")
        print("  prism login")
        sys.exit(2)

    return token


def ensure_credentials():
    """
    Get both token and URL, or exit with error if not logged in.

    Returns:
        dict: {"token": str, "url": str}

    Raises:
        SystemExit: If not logged in (exits with code 2)
    """
    credentials = get_credentials()

    if not credentials["token"]:
        print("❌ Not logged in to Prism")
        print("")
        print("Please log in first:")
        print("  prism login")
        sys.exit(2)

    # Default URL if not found (shouldn't happen if logged in)
    if not credentials["url"]:
        credentials["url"] = "https://app.prismatic.io"

    return credentials
