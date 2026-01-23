#!/usr/bin/env python3
"""
install_dependencies.py

PURPOSE: Install npm dependencies for CNI project

USAGE: python install_dependencies.py <project-directory>

PARAMETERS:
  project-directory - Path to integration project directory

EXIT CODES:
  0 - Success: Dependencies installed
  1 - Error: Project directory not found
  2 - Error: npm install failed

"""

import os
import subprocess
import sys
import time


def install_dependencies(project_dir):
    """Install npm dependencies with progress reporting."""
    if not os.path.isdir(project_dir):
        print(f"❌ Project directory not found: {project_dir}")
        return 1

    package_json = os.path.join(project_dir, "package.json")
    if not os.path.isfile(package_json):
        print(f"❌ package.json not found in {project_dir}")
        print("")
        print("This doesn't appear to be a valid Node.js project.")
        return 1

    print(f"📦 Installing dependencies for: {project_dir}")
    print("")
    print("Running: npm install")
    print("This may take a few minutes...")
    print("")

    start_time = time.time()

    try:
        result = subprocess.run(
            ["npm", "install"],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=300,
        )

        elapsed = time.time() - start_time

        if result.returncode == 0:
            print(f"✅ Dependencies installed successfully ({elapsed:.1f}s)")
            print("")
            if result.stdout:
                lines = result.stdout.strip().split("\n")
                if lines:
                    last_line = lines[-1]
                    print(last_line)
            print("")
            print("📋 Next steps:")
            print(f"  python build_integration.py {project_dir}")
            return 0
        else:
            print(f"❌ npm install failed ({elapsed:.1f}s)")
            print("")
            if result.stderr:
                print("Error output:")
                print(result.stderr)
            if result.stdout:
                print("Standard output:")
                print(result.stdout)
            print("")
            print("💡 Troubleshooting:")
            print("  - Try running: npm cache clean --force")
            print("  - Ensure package.json is valid")
            return 2

    except subprocess.TimeoutExpired:
        print("❌ npm install timed out (5 minutes)")
        print("")
        print("The installation took longer than expected.")
        print("This could be due to:")
        print("  - Slow network connection")
        print("  - Large number of dependencies")
        print("  - npm registry issues")
        print("")
        print("Try again or check npm registry status.")
        return 2

    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        print("")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        return 2


def main():
    if len(sys.argv) < 2:
        print("❌ No project directory provided")
        print("Usage: python install_dependencies.py <project-directory>")
        return 1

    return install_dependencies(sys.argv[1])


if __name__ == "__main__":
    sys.exit(main())
