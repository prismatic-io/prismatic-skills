#!/usr/bin/env python3
"""
setup_prerequisites.py

PURPOSE: Phase 1 setup - Verify Prism CLI is installed and user is logged in

USAGE: python setup_prerequisites.py <INTEGRATION_NAME>

PARAMETERS:
  INTEGRATION_NAME - Name for the integration (e.g., "salesforce-slack-sync")

EXIT CODES:
  0 - Success: Prism installed and authenticated
  1 - Error: Invalid usage or Prism not installed (with install option declined)
  2 - Error: Not logged in to Prism

BEHAVIOR:
  This script verifies the development environment is ready:
  1. Check if Prism CLI is installed
  2. If not installed, offer to install via npm
  3. Verify user is logged in to Prism
  4. If not logged in, fail with instructions to run 'prism login'

  No credential storage is needed - Prism CLI maintains its own auth state.
"""

import re
import subprocess
import sys

from project_directory import ensure_session_directory, get_project_directory
from timing import print_timing_summary, timed_step


def print_section(title):
    """Print a section header."""
    print("")
    print("=" * 60)
    print(f"  {title}")
    print("=" * 60)
    print("")


def validate_integration_name(name):
    """Validate integration name follows conventions."""
    pattern = r"^[a-z][a-z0-9-]*[a-z0-9]$"
    return bool(re.match(pattern, name))


@timed_step("Check Prism CLI")
def check_prism_installed():
    """Check if Prism CLI is installed.

    Returns:
        str: Version string if installed, None if not installed
    """
    try:
        result = subprocess.run(
            ["prism", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            version = result.stdout.strip()
            print(f"✅ Prism CLI installed: {version}")
            return version
    except FileNotFoundError:
        pass
    except subprocess.TimeoutExpired:
        print("⚠️  Prism CLI check timed out")

    return None


@timed_step("Install Prism CLI")
def install_prism():
    """Install Prism CLI via npm.

    Returns:
        bool: True if installation succeeded, False otherwise
    """
    print("📦 Installing Prism CLI...")
    print("")

    try:
        result = subprocess.run(
            [
                "npm",
                "install",
                "-g",
                "--no-audit",
                "--no-fund",
                "--no-update-notifier",
                "@prismatic-io/prism",
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode == 0:
            # Verify installation
            verify = subprocess.run(
                ["prism", "--version"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if verify.returncode == 0:
                version = verify.stdout.strip()
                print(f"✅ Prism CLI installed: {version}")
                return True
            else:
                print("❌ Installation succeeded but verification failed")
                return False
        else:
            print("❌ Installation failed")
            if result.stderr:
                # Show first few lines of error
                error_lines = result.stderr.strip().split("\n")[:5]
                for line in error_lines:
                    print(f"   {line}")
            return False

    except FileNotFoundError:
        print("❌ npm not found - Node.js must be installed first")
        print("   Download from: https://nodejs.org/")
        return False
    except subprocess.TimeoutExpired:
        print("❌ Installation timed out (2 minutes)")
        return False


@timed_step("Verify Authentication")
def check_logged_in():
    """Check if user is logged in to Prism.

    Returns:
        dict: User info if logged in, None if not logged in
    """
    try:
        result = subprocess.run(
            ["prism", "me"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode == 0:
            # Parse output to extract user info
            output = result.stdout.strip()
            user_info = {}

            for line in output.split("\n"):
                if ":" in line:
                    key, value = line.split(":", 1)
                    user_info[key.strip().lower()] = value.strip()

            name = user_info.get("name", "Unknown")
            email = user_info.get("email", "Unknown")
            endpoint = user_info.get(
                "endpoint url", user_info.get("endpoint", "Unknown")
            )

            print(f"✅ Logged in as: {email}")
            print(f"   Name: {name}")
            print(f"   Endpoint: {endpoint}")

            return {
                "name": name,
                "email": email,
                "endpoint": endpoint,
            }
        else:
            return None

    except subprocess.TimeoutExpired:
        print("⚠️  Authentication check timed out")
        return None
    except Exception as e:
        print(f"⚠️  Error checking authentication: {e}")
        return None


def prompt_install_prism():
    """Prompt user to install Prism CLI.

    Returns:
        bool: True if user wants to install, False otherwise
    """
    print("❌ Prism CLI is not installed")
    print("")
    print("Prism CLI is required to build and deploy integrations.")
    print("")

    # In Claude Code, we can prompt the user
    response = input("Would you like to install it now? [Y/n]: ").strip().lower()

    if response in ("", "y", "yes"):
        return True
    else:
        print("")
        print("To install manually, run:")
        print("  npm install -g @prismatic-io/prism")
        return False


def print_login_instructions():
    """Print instructions for logging in to Prism."""
    print("❌ Not logged in to Prism")
    print("")
    print("Please log in to your Prismatic account:")
    print("")
    print("  prism login")
    print("")
    print("This will open a browser for authentication.")
    print("After logging in, run this script again.")


def print_final_status(
    success, integration_name, user_info=None, project_dir=None, session_dir=None
):
    """Print final status and next steps."""
    print("")
    print("=" * 60)
    if success:
        print("  ✅ PHASE 1 SETUP COMPLETE")
    else:
        print("  ❌ PHASE 1 SETUP FAILED")
    print("=" * 60)

    print_timing_summary()

    print("")

    if success and user_info and project_dir:
        integration_dir = f"{project_dir}/{integration_name}"
        requirements_file = f"{session_dir}/requirements.json"
        print("🎉 Ready for Phase 2 - Requirements Gathering!")
        print("")
        print(f"Integration: {integration_name}")
        print(f"Integration directory: {integration_dir}")
        print(f"Session directory: {session_dir}")
        print(f"Prismatic: {user_info.get('endpoint', 'Unknown')}")
        print(f"User: {user_info.get('email', 'Unknown')}")
        print("")
        print("📋 Next: Run requirements gathering")
        print("   python scripts/gather_requirements.py \\")
        print("     references/requirements-questions.json \\")
        print(f"     {requirements_file}")


def main():
    print("🚀 Prismatic Integration Builder - Phase 1 Setup")
    print("")
    print("This will verify:")
    print("  1. Prism CLI is installed")
    print("  2. You are logged in to Prismatic")
    print("")

    # Check for integration name argument
    if len(sys.argv) < 2:
        print("")
        print("=" * 60)
        print("❌ Missing required parameter")
        print("=" * 60)
        print("")
        print("Usage: python setup_prerequisites.py <INTEGRATION_NAME>")
        print("")
        print("Parameters:")
        print(
            "  INTEGRATION_NAME - Name for the integration (e.g., 'salesforce-slack-sync')"
        )
        print("")
        print("Examples:")
        print("  python setup_prerequisites.py my-integration")
        print("  python setup_prerequisites.py salesforce-slack-sync")
        return 1

    integration_name = sys.argv[1]

    # Validate integration name
    if not validate_integration_name(integration_name):
        print("")
        print("❌ Invalid integration name")
        print("   Name must be lowercase with hyphens (e.g., 'salesforce-slack-sync')")
        print("   Must start with a letter and end with a letter or number")
        return 1

    # Step 1: Check if Prism CLI is installed
    print_section("Checking Prism CLI")
    version = check_prism_installed()

    if not version:
        # Offer to install
        if prompt_install_prism():
            print("")
            if not install_prism():
                print_final_status(False, integration_name)
                return 1
        else:
            print_final_status(False, integration_name)
            return 1

    # Step 2: Check if logged in
    print_section("Verifying Authentication")
    user_info = check_logged_in()

    if not user_info:
        print_login_instructions()
        print_final_status(False, integration_name)
        return 2

    # Step 3: Determine project directory and create session
    project_dir = get_project_directory()
    session_dir = ensure_session_directory(project_dir, integration_name)

    # Success!
    print_final_status(True, integration_name, user_info, project_dir, session_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
