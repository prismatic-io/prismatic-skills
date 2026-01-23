#!/usr/bin/env python3
"""
validate_component.py

PURPOSE: Phase 5 - Validate component structure and build output

USAGE: python validate_component.py <COMPONENT_DIR>

PARAMETERS:
  COMPONENT_DIR - Path to the component directory

EXIT CODES:
  0 - Success: Component validated and ready for platform testing
  1 - Error: Validation failed

BEHAVIOR:
  1. Verifies required files exist
  2. Verifies the component is built (dist/index.js exists)
  3. Prints guidance to test functionality in Prismatic platform
"""

import argparse
import os
import sys

from timing import print_timing_summary, timed_step


@timed_step("Validate component")
def validate_component(component_dir):
    """Validate the component structure and build output."""
    print("Validating component...")

    # Check for required files
    required_files = [
        "package.json",
        "src/index.ts",
    ]

    # Check for actions - could be in actions/ directory or actions.ts
    has_actions = (
        os.path.exists(os.path.join(component_dir, "src/actions.ts")) or
        os.path.exists(os.path.join(component_dir, "src/actions/index.ts"))
    )

    missing = []
    for f in required_files:
        if not os.path.exists(os.path.join(component_dir, f)):
            missing.append(f)

    if not has_actions:
        missing.append("src/actions.ts or src/actions/index.ts")

    if missing:
        print(f"Error: Missing required files: {', '.join(missing)}")
        return False

    # Check if built
    if not os.path.exists(os.path.join(component_dir, "dist", "index.js")):
        print("Error: Component not built (dist/index.js missing)")
        print("Build the component first with build_component.py")
        return False

    print("Component structure validated")
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Validate a Prismatic component structure"
    )
    parser.add_argument(
        "component_dir",
        help="Path to the component directory"
    )

    args = parser.parse_args()

    component_dir = os.path.abspath(args.component_dir)

    # Verify directory exists
    if not os.path.exists(component_dir):
        print(f"Error: Component directory not found: {component_dir}")
        return 1

    component_name = os.path.basename(component_dir)
    print(f"Validating component: {component_name}")
    print(f"Directory: {component_dir}")
    print("")

    # Validate structure
    success = validate_component(component_dir)

    print_timing_summary()

    print("")
    print("=" * 60)
    if success:
        print("  VALIDATION COMPLETE")
    else:
        print("  VALIDATION FAILED")
    print("=" * 60)

    if success:
        print("")
        print("Component structure is valid and build output exists.")
        print("")
        print("Next steps:")
        print("  1. Publish: python scripts/publish_component.py " + component_dir)
        print("  2. Test functionality in the Prismatic platform")
        print("     - Create or edit an integration")
        print("     - Add your component's actions")
        print("     - Test with real credentials and data")
        print("")
        return 0
    else:
        print("")
        print("Fix the issues above and re-run validation.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
