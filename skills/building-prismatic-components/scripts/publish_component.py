#!/usr/bin/env python3
"""
publish_component.py

PURPOSE: Phase 5 - Publish the component to Prismatic

USAGE: python publish_component.py <COMPONENT_DIR>

PARAMETERS:
  COMPONENT_DIR - Path to the component directory

EXIT CODES:
  0 - Success: Component published successfully
  1 - Error: Publish failed

BEHAVIOR:
  1. Verifies the component is built (dist/index.js exists)
  2. Runs prism components:publish
  3. Reports publish status and component URL
"""

import os
import re
import subprocess
import sys

from timing import print_timing_summary, timed_step


@timed_step("Publish component")
def publish_component(component_dir):
    """Publish the component to Prismatic."""
    print("Publishing component...")

    result = subprocess.run(
        ["prism", "components:publish", "--no-confirm", "--skip-on-signature-match"],
        cwd=component_dir,
        capture_output=True,
        text=True,
        timeout=120,
    )

    if result.returncode != 0:
        print("Publish failed")
        if result.stderr:
            print("Errors:")
            print(result.stderr[:1000])
        if result.stdout:
            print("Output:")
            print(result.stdout[:1000])
        return None

    # Try to extract component ID from output
    output = result.stdout + result.stderr
    component_id = None

    # Look for component ID in various formats
    id_patterns = [
        r"Component ID:\s*([A-Za-z0-9_-]+)",
        r"component/([A-Za-z0-9_-]+)",
        r'"id":\s*"([A-Za-z0-9_-]+)"',
    ]

    for pattern in id_patterns:
        match = re.search(pattern, output)
        if match:
            component_id = match.group(1)
            break

    print("Publish successful")
    if component_id:
        print(f"   Component ID: {component_id}")

    return component_id


def main():
    if len(sys.argv) < 2:
        print("Usage: python publish_component.py <COMPONENT_DIR>")
        return 1

    component_dir = os.path.abspath(sys.argv[1])

    # Verify directory exists
    if not os.path.exists(component_dir):
        print(f"Error: Component directory not found: {component_dir}")
        return 1

    # Verify component is built
    dist_file = os.path.join(component_dir, "dist", "index.js")
    if not os.path.exists(dist_file):
        print("Error: Component not built (dist/index.js not found)")
        print("   Run build first: python scripts/build_component.py <dir>")
        return 1

    component_name = os.path.basename(component_dir)
    print(f"Publishing component: {component_name}")
    print(f"Directory: {component_dir}")
    print("")

    # Publish
    component_id = publish_component(component_dir)
    if component_id is None:
        return 1

    print_timing_summary()

    print("")
    print("=" * 60)
    print("  PUBLISH COMPLETE")
    print("=" * 60)
    print("")
    print(f"Component '{component_name}' is now available in Prismatic.")
    print("")
    print("Next steps:")
    print(f"   1. Validate: python scripts/validate_component.py {component_dir}")
    print("   2. Test functionality in the Prismatic platform")

    return 0


if __name__ == "__main__":
    sys.exit(main())
