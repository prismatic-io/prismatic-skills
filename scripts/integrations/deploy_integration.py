#!/usr/bin/env python3
"""
deploy_integration.py

PURPOSE: Deploy built integration to Prismatic platform

USAGE: python deploy_integration.py <project-directory>

PARAMETERS:
  project-directory - Path to integration project directory

EXIT CODES:
  0 - Success: Integration deployed
  1 - Error: Project directory not found or not built
  2 - Error: Authentication failed
  3 - Error: Import failed

"""

import os
import subprocess
import sys
import time

SHARED_DIR = os.path.join(os.path.dirname(__file__), '..', 'shared')
sys.path.insert(0, SHARED_DIR)

from graphql import ensure_authenticated, GraphQLError
from prism_retry import run_prism_mutation


def deploy_integration(project_dir):
    """Deploy integration to Prismatic."""
    if not os.path.isdir(project_dir):
        print(f"❌ Project directory not found: {project_dir}")
        return 1

    dist_dir = os.path.join(project_dir, "dist")
    if not os.path.isdir(dist_dir):
        print("❌ Build artifacts not found")
        print("")
        print("You need to build the integration first.")
        print(f"Run: python build_integration.py {project_dir}")
        return 1

    print(f"🚀 Deploying integration: {project_dir}")
    print("")

    # Load authentication credentials (token and URL)
    try:
        ensure_authenticated()
    except GraphQLError as e:
        print(f"❌ {e}")
        return 2

    cmd = ["prism", "integrations:import"]
    print(f"Running: {' '.join(cmd)}")
    print("")

    try:
        result = run_prism_mutation(
            cmd,
            cwd=project_dir,
            timeout=60,
        )

        if result.returncode == 0:
            print("✅ Integration deployed successfully!")
            print("")

            if result.stdout:
                print(result.stdout)

            # Wait for integration to be fully available
            print("")
            print("⏳ Waiting 5 seconds for integration to be fully available...")
            time.sleep(5)
            print("")

            print("📋 Next steps:")
            print("  - View and configure integration in Prismatic web app")
            print(
                f"  - Test: python scripts/test_integration.py <integration-id> --integration-dir {project_dir}"
            )
            print(
                f"  - Package for download: python scripts/package_for_download.py {project_dir}"
            )
            print("")
            print("⚠️  TESTING: Always use scripts/test_integration.py")
            print("   Do NOT use prism commands directly for testing")

            return 0
        else:
            print("❌ Deployment failed")
            print("")

            if result.stderr:
                print("Error output:")
                print(result.stderr)

            if result.stdout:
                print("")
                print("Standard output:")
                print(result.stdout)

            print("")
            print("💡 Troubleshooting:")
            print("  - Ensure you're authenticated: python check_prism_access.py")
            print("  - Verify build succeeded: check dist/ directory")
            print("  - Check for validation errors in your integration definition")
            return 3

    except FileNotFoundError:
        print("❌ Prism CLI not found")
        print("Run setup_prerequisites.py first")
        return 3

    except subprocess.TimeoutExpired:
        print("❌ Deployment timed out (60 seconds)")
        print("")
        print("The deployment took longer than expected.")
        print("This could indicate network issues or a large integration.")
        return 3

    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        print("")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        return 3


def main():
    if len(sys.argv) < 2:
        print("❌ No project directory provided")
        print("Usage: python deploy_integration.py <project-directory>")
        return 1

    project_dir = sys.argv[1]
    return deploy_integration(project_dir)


if __name__ == "__main__":
    sys.exit(main())
