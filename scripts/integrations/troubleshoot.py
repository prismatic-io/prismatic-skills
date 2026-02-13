#!/usr/bin/env python3
"""
troubleshoot.py

PURPOSE: Diagnose common issues with Prismatic integration development

USAGE: python troubleshoot.py [project-directory]

PARAMETERS:
  project-directory - (Optional) Path to integration project

EXIT CODES:
  Returns number of issues found (0 = all checks passed)

"""

import os
import subprocess
import sys

SHARED_DIR = os.path.join(os.path.dirname(__file__), '..', 'shared')
sys.path.insert(0, SHARED_DIR)

from graphql import ensure_authenticated, GraphQLError
from prism_retry import is_auth_error, is_network_error, run_prism_query


def check_prism_cli():
    """Check if Prism CLI is installed."""
    try:
        ensure_authenticated()
    except GraphQLError:
        pass  # check_network_and_auth() handles the diagnostic

    try:
        result = subprocess.run(
            ["prism", "--version"],
            capture_output=True,
            text=True,
            env=os.environ,
            timeout=5,
        )
        if result.returncode == 0:
            version = result.stdout.strip()
            return True, f"Prism CLI: Installed ({version})"
        else:
            return False, "Prism CLI: Installed but not working correctly"
    except FileNotFoundError:
        return (
            False,
            "Prism CLI: Not installed (run setup_prerequisites.py first)",
        )
    except Exception as e:
        return False, f"Prism CLI: Error checking ({str(e)})"


def check_network_and_auth():
    """Check network access and authentication to Prismatic (single call)."""
    try:
        result = run_prism_query(["prism", "me"], timeout=10)

        if result.returncode == 0:
            lines = result.stdout.strip().split("\n")
            if lines and lines[0]:
                return True, f"Network & Auth: Connected as {lines[0]}"
            return True, "Network & Auth: Connected and authenticated"

        error_text = (result.stderr or "") + " " + (result.stdout or "")

        if is_network_error(error_text):
            return False, "Network: Cannot reach *.prismatic.io (check firewall/proxy)"

        if is_auth_error(error_text):
            return False, "Auth: Not authenticated (run setup_prerequisites.py)"

        return False, "Network & Auth: Connection failed"

    except subprocess.TimeoutExpired:
        return False, "Network: Connection timeout to Prismatic"
    except FileNotFoundError:
        return None, "Network & Auth: Cannot test (prism CLI not installed)"
    except Exception as e:
        return False, f"Network & Auth: Error ({str(e)})"


def check_node():
    """Check Node.js version."""
    try:
        result = subprocess.run(
            ["node", "--version"], capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            version = result.stdout.strip()
            major_version = int(version.lstrip("v").split(".")[0])

            if major_version >= 18:
                return True, f"Node.js: {version} (compatible)"
            else:
                return False, f"Node.js: {version} (requires v18+ for Prismatic)"
        else:
            return False, "Node.js: Installed but not working"
    except FileNotFoundError:
        return False, "Node.js: Not installed (download from nodejs.org)"
    except Exception as e:
        return False, f"Node.js: Error ({str(e)})"


def check_project(project_dir):
    """Check project structure and compilation."""
    if not project_dir:
        return None, "Project: Not specified"

    if not os.path.isdir(project_dir):
        return False, f"Project: Directory not found ({project_dir})"

    package_json = os.path.join(project_dir, "package.json")
    if not os.path.isfile(package_json):
        return False, "Project: Missing package.json"

    src_dir = os.path.join(project_dir, "src")
    if not os.path.isdir(src_dir):
        return False, "Project: Missing src/ directory"

    node_modules = os.path.join(project_dir, "node_modules")
    if not os.path.isdir(node_modules):
        return False, "Project: Dependencies not installed (run: npm install)"

    dist_dir = os.path.join(project_dir, "dist")
    if not os.path.isdir(dist_dir):
        return None, "Project: Not built yet (run: npm run build)"

    return True, "Project: Structure valid and built"


def troubleshoot(project_dir=None):
    """Run all diagnostic checks."""
    print("🔍 Troubleshooting Prismatic Integration Development Environment")
    print("")

    checks = [
        ("Prism CLI", check_prism_cli),
        ("Node.js", check_node),
        ("Network & Auth", check_network_and_auth),
    ]

    if project_dir:
        checks.append(("Project", lambda: check_project(project_dir)))

    issues = 0
    warnings = 0

    for name, check_func in checks:
        try:
            passed, message = check_func()
            if passed:
                print(f"✅ {message}")
            elif passed is None:
                print(f"⚠️  {message}")
                warnings += 1
            else:
                print(f"❌ {message}")
                issues += 1
        except Exception as e:
            print(f"❌ {name}: Unexpected error - {e}")
            issues += 1

    print("")
    print("=" * 60)

    if issues == 0 and warnings == 0:
        print("✅ All checks passed! Your environment is ready.")
        print("")
        print("📋 Next steps:")
        if project_dir:
            print("  - Continue working on your integration")
            print("  - Run: python build_integration.py <project>")
            print("  - Deploy: python deploy_integration.py <project>")
        else:
            print("  - Run setup: python setup_prerequisites.py <name> <token>")
            print("  - Search components: python search_components.py <term>")
    elif issues == 0:
        print(f"⚠️  All critical checks passed, but {warnings} warning(s) found.")
        print("")
        print("Review the warnings above and address if needed.")
    else:
        print(f"❌ Found {issues} issue(s) and {warnings} warning(s)")
        print("")
        print("📋 Common fixes:")
        print("  - Run setup: python setup_prerequisites.py <name> <token> [url]")
        print("  - Check network access to *.prismatic.io")

    print("=" * 60)

    return issues


def main():
    project_dir = sys.argv[1] if len(sys.argv) > 1 else None
    return troubleshoot(project_dir)


if __name__ == "__main__":
    sys.exit(main())
