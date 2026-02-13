#!/usr/bin/env python3
"""
build_component.py

PURPOSE: Phase 4 - Build the component using webpack

USAGE: python build_component.py <COMPONENT_DIR>

PARAMETERS:
  COMPONENT_DIR - Path to the component directory

EXIT CODES:
  0 - Success: Component built successfully
  1 - Error: Build failed

BEHAVIOR:
  1. Verifies the component directory exists
  2. Runs npm install if node_modules doesn't exist
  3. Runs npm run build (webpack)
  4. Reports build status
"""

import os
import subprocess
import sys

SHARED_DIR = os.path.join(os.path.dirname(__file__), '..', 'shared')
sys.path.insert(0, SHARED_DIR)

from timing import print_timing_summary, timed_step


@timed_step("Install dependencies")
def install_dependencies(component_dir):
    """Install npm dependencies if needed."""
    node_modules = os.path.join(component_dir, "node_modules")

    if os.path.exists(node_modules):
        print("Dependencies already installed")
        return True

    print("Installing dependencies...")

    result = subprocess.run(
        ["npm", "install", "--no-audit", "--no-fund"],
        cwd=component_dir,
        capture_output=True,
        text=True,
        timeout=300,
    )

    if result.returncode != 0:
        print("Failed to install dependencies")
        if result.stderr:
            print(result.stderr[:500])
        return False

    print("Dependencies installed successfully")
    return True


@timed_step("Build component")
def build_component(component_dir):
    """Run webpack build."""
    print("Building component...")

    result = subprocess.run(
        ["npm", "run", "build"],
        cwd=component_dir,
        capture_output=True,
        text=True,
        timeout=120,
    )

    if result.returncode != 0:
        print("Build failed")
        if result.stderr:
            print("Errors:")
            print(result.stderr[:1000])
        if result.stdout:
            print("Output:")
            print(result.stdout[:1000])
        return False

    # Check if dist/index.js was created
    dist_file = os.path.join(component_dir, "dist", "index.js")
    if not os.path.exists(dist_file):
        print("Build completed but dist/index.js not found")
        return False

    print("Build successful")
    print(f"   Output: {dist_file}")
    return True


def main():
    if len(sys.argv) < 2:
        print("Usage: python build_component.py <COMPONENT_DIR>")
        return 1

    component_dir = os.path.abspath(sys.argv[1])

    # Verify directory exists
    if not os.path.exists(component_dir):
        print(f"Error: Component directory not found: {component_dir}")
        return 1

    # Verify it's a component directory (has package.json)
    package_json = os.path.join(component_dir, "package.json")
    if not os.path.exists(package_json):
        print(f"Error: Not a valid component directory (no package.json)")
        return 1

    print(f"Building component: {os.path.basename(component_dir)}")
    print(f"Directory: {component_dir}")
    print("")

    # Install dependencies if needed
    if not install_dependencies(component_dir):
        return 1

    # Build
    if not build_component(component_dir):
        return 1

    print_timing_summary()

    print("")
    print("=" * 60)
    print("  BUILD COMPLETE")
    print("=" * 60)
    print("")
    print("Next: Publish the component")
    print(f"   python scripts/publish_component.py {component_dir}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
