#!/usr/bin/env python3
"""
prerequisites.py

PURPOSE: Unified Phase 1 setup - Verify environment for any Prismatic workflow.

Supports different check levels based on --type:
  - component: Prism CLI + auth only
  - integration: Prism CLI + auth only

USAGE:
  python prerequisites.py <name> --type component
  python prerequisites.py <name> --type integration

EXIT CODES:
  0 - Success: All prerequisites verified
  1 - Error: Invalid usage or prerequisites not met
  2 - Error: Prismatic not authenticated
"""

import argparse
import json
import os
import re
import subprocess
import sys

# Add shared directory to path
SHARED_DIR = os.path.join(os.path.dirname(__file__), "shared")
sys.path.insert(0, SHARED_DIR)

from project_directory import (
    ensure_session_directory,
    get_project_root,
)
from timing import print_timing_summary, timed_step


# Session type mapping
SESSION_TYPE_MAP = {
    "component": "components",
    "integration": "integrations",
}


def print_section(title):
    """Print a section header."""
    print("")
    print("=" * 60)
    print(f"  {title}")
    print("=" * 60)
    print("")


def validate_name(name):
    """Validate name follows conventions."""
    pattern = r"^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$"
    return bool(re.match(pattern, name))


@timed_step("Check Prism CLI")
def check_prism_installed():
    """Check if Prism CLI is installed."""
    try:
        result = subprocess.run(
            ["prism", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            version = result.stdout.strip()
            print(f"Prism CLI installed: {version}")
            return version
    except FileNotFoundError:
        pass
    except subprocess.TimeoutExpired:
        print("Prism CLI check timed out")
    return None


@timed_step("Install Prism CLI")
def install_prism():
    """Install Prism CLI via npm."""
    print("Installing Prism CLI...")
    try:
        result = subprocess.run(
            ["npm", "install", "-g", "--no-audit", "--no-fund",
             "--no-update-notifier", "@prismatic-io/prism"],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode == 0:
            verify = subprocess.run(
                ["prism", "--version"],
                capture_output=True, text=True, timeout=10,
            )
            if verify.returncode == 0:
                version = verify.stdout.strip()
                print(f"Prism CLI installed: {version}")
                return True
        print("Installation failed")
        if result.stderr:
            for line in result.stderr.strip().split("\n")[:5]:
                print(f"   {line}")
        return False
    except FileNotFoundError:
        print("npm not found - Node.js must be installed first")
        return False
    except subprocess.TimeoutExpired:
        print("Installation timed out (2 minutes)")
        return False


@timed_step("Verify Authentication")
def check_logged_in():
    """Check if user is logged in to Prism."""
    try:
        result = subprocess.run(
            ["prism", "me"],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            output = result.stdout.strip()
            user_info = {}
            for line in output.split("\n"):
                if ":" in line:
                    key, value = line.split(":", 1)
                    user_info[key.strip().lower()] = value.strip()

            name = user_info.get("name", "Unknown")
            email = user_info.get("email", "Unknown")
            endpoint = user_info.get("endpoint url", user_info.get("endpoint", "Unknown"))

            print(f"Logged in as: {email}")
            print(f"   Name: {name}")
            print(f"   Endpoint: {endpoint}")
            return {"name": name, "email": email, "endpoint": endpoint}
        return None
    except FileNotFoundError:
        print("Prism CLI not found - install with: npm install -g @prismatic-io/prism")
        return None
    except subprocess.TimeoutExpired:
        print("Authentication check timed out")
        return None
    except Exception as e:
        print(f"Error checking authentication: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(
        description="Unified prerequisites check for Prismatic workflows"
    )
    parser.add_argument("name", help="Name for the session (e.g., 'canny', 'hubspot-crm')")
    parser.add_argument(
        "--type", choices=["component", "integration"],
        default="component", help="Type of workflow (default: component)"
    )
    args = parser.parse_args()

    workflow_type = args.type
    name = args.name

    type_labels = {
        "component": "Prismatic Component Builder",
        "integration": "Prismatic CNI Builder",
    }

    print(f"{type_labels[workflow_type]} - Phase 1 Setup")
    print("")

    if not validate_name(name):
        print("Invalid name")
        print("   Name must be lowercase with hyphens (e.g., 'canny', 'hubspot-crm')")
        return 1

    all_passed = True
    user_info = None

    # Common checks: Prism CLI + auth
    print_section("Checking Prism CLI")
    version = check_prism_installed()

    if not version:
        response = input("Prism CLI not found. Install now? [Y/n]: ").strip().lower()
        if response in ("", "y", "yes"):
            if not install_prism():
                all_passed = False
        else:
            print("\nTo install: npm install -g @prismatic-io/prism")
            all_passed = False

    if all_passed or version:
        print_section("Verifying Authentication")
        user_info = check_logged_in()
        if not user_info:
            print("\nNot logged in to Prismatic. Please run: prism login")
            all_passed = False

    # Create session directory
    session_type = SESSION_TYPE_MAP[workflow_type]
    session_dir = None
    if all_passed:
        session_dir = ensure_session_directory(name, session_type)
        print(f"\nSession directory created: {session_dir}")

    # Final status
    print("")
    print("=" * 60)
    if all_passed:
        print("  PHASE 1 SETUP COMPLETE")
    else:
        print("  PHASE 1 SETUP INCOMPLETE")
    print("=" * 60)

    print_timing_summary()
    print("")

    if all_passed:
        requirements_file = os.path.join(session_dir, "requirements.json")

        output = {
            "status": "ready",
            "name": name,
            "type": workflow_type,
            "session_dir": session_dir,
            "requirements_file": requirements_file,
            "user": user_info,
        }

        print("Ready for Phase 2 - Requirements Gathering!")
        print("")
        print(f"Name: {name}")
        print(f"Type: {workflow_type}")
        print(f"Session directory: {session_dir}")
        if user_info:
            print(f"Prismatic: {user_info.get('endpoint', 'Unknown')}")
            print(f"User: {user_info.get('email', 'Unknown')}")
        print("")
        print("Next: Run requirements gathering")
        print(f"   python scripts/gather_requirements.py \\")
        print(f"     scripts/questions/{workflow_type}.json \\")
        print(f"     {requirements_file}")
        print("")
        print("--- Setup Data (JSON) ---")
        print(json.dumps(output, indent=2))

    if not all_passed:
        return 1 if not user_info else 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
