#!/usr/bin/env python3
"""
check_prism_access.py

PURPOSE: Test network connectivity and authentication to Prismatic API

USAGE: python check_prism_access.py

EXIT CODES:
  0 - Success: Prism CLI is accessible and authenticated
  1 - Network error: Cannot reach Prismatic API (blocked domain)
  2 - Authentication error: Not logged in or token expired
  3 - Other error

BEHAVIOR:
  1. Run: prism me
  2. Capture exit code, stdout, stderr
  3. Parse output/errors to determine failure type
  4. Provide specific guidance based on error type:
     - Network: Show how to enable *.prismatic.io in Claude settings
     - Auth: Show how to get authentication token
     - Other: Display actual error message

ERROR PATTERNS TO DETECT:
  Network: "ENOTFOUND", "ECONNREFUSED", "timeout", "network"
  Auth: "not authenticated", "unauthorized", "invalid token"
"""

import subprocess
import sys

from prism_retry import is_auth_error, is_network_error, run_prism_query


def check_prism_access():
    """Test if Prism CLI can access Prismatic API."""
    print("🔍 Testing Prism CLI connectivity...")
    print("")

    try:
        result = run_prism_query(["prism", "me"], timeout=30)

        if result.returncode == 0:
            print("✅ Prism CLI is accessible and authenticated")
            print("")
            print("User Information:")
            print(result.stdout)
            return 0

        combined_output = (result.stderr or "") + " " + (result.stdout or "")

        if is_network_error(combined_output):
            print("❌ Network access to Prismatic is blocked")
            print("")
            print("Error details:")
            print(result.stderr if result.stderr else result.stdout)
            print("")
            print_network_guidance()
            return 1

        if is_auth_error(combined_output):
            print("❌ Prism CLI is not authenticated")
            print("")
            print("Error details:")
            print(result.stderr if result.stderr else result.stdout)
            print("")
            print_auth_guidance()
            return 2

        print("❌ Unexpected error from Prism CLI")
        print("")
        if result.stderr:
            print("Error output:")
            print(result.stderr)
        if result.stdout:
            print("Standard output:")
            print(result.stdout)
        return 3

    except FileNotFoundError:
        print("❌ Prism CLI not found")
        print("Run setup_prerequisites.py first")
        return 3

    except subprocess.TimeoutExpired:
        print("❌ Connection to Prismatic timed out")
        print("")
        print_network_guidance()
        return 1

    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return 3


def print_network_guidance():
    """Print guidance for network configuration."""
    print("📋 To fix network access issues:")
    print("")
    print("OPTION 1: Enable network access in Claude (Team/Enterprise plans)")
    print("  1. Open Claude Settings")
    print("  2. Navigate to: Admin settings > Capabilities")
    print("  3. Under 'Network access', select:")
    print("     'Allow network egress to package managers and specific domains'")
    print("  4. Add the domain: *.prismatic.io")
    print("  5. Save and try again")
    print("")
    print("OPTION 2: Use a token for authentication (if network is available)")
    print("  If you have network access but see this error:")
    print("  1. On your local machine, run: prism me:token")
    print("  2. Copy the token")
    print("  3. Provide it to this skill for authentication")
    print("")
    print("For more details:")
    print("  https://support.claude.com/en/articles/12111783")
    print("  https://prismatic.io/docs/cli/")


def print_auth_guidance():
    """Print guidance for authentication setup."""
    print("📋 To fix authentication issues:")
    print("")
    print("OPTION 1: Run prism login (requires browser access)")
    print("  1. Run: prism login")
    print("  2. Your browser will open to authenticate")
    print("  3. Log in with your Prismatic credentials")
    print("  4. Return here and try again")
    print("")
    print("OPTION 2: Use authentication token (for headless environments)")
    print("  1. On a machine with browser access, run: prism login")
    print("  2. Then run: prism me:token")
    print("  3. Copy the token")
    print("  4. Set the environment variable:")
    print("     export PRISM_REFRESH_TOKEN=<your-token>")
    print("  5. Try again")
    print("")
    print("NOTE: Tokens expire periodically and will need to be refreshed.")
    print("")
    print("For more details: https://prismatic.io/docs/cli/")


if __name__ == "__main__":
    sys.exit(check_prism_access())
