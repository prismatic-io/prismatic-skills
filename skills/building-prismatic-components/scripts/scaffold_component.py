#!/usr/bin/env python3
"""
scaffold_component.py

PURPOSE: Phase 3 - Create component structure using prism components:init

USAGE: python scaffold_component.py <COMPONENT_NAME>

PARAMETERS:
  COMPONENT_NAME - Name for the component (e.g., "canny", "date-utils")

EXIT CODES:
  0 - Success: Component directory created
  1 - Error: Invalid usage or directory already exists
  3 - Error: Scaffolding failed

STRUCTURE CREATED (via prism CLI):
  components/{component-name}/
  ├── src/
  │   ├── client.ts           # HTTP client
  │   ├── connections.ts      # Connection definitions (API Key + OAuth2)
  │   ├── actions/            # Actions directory
  │   │   └── index.ts
  │   ├── triggers.ts         # Webhook triggers
  │   ├── dataSources.ts      # Picklist data sources
  │   └── index.ts            # Component registration
  ├── assets/
  │   └── icon.png            # Component icon (placeholder)
  ├── package.json
  ├── tsconfig.json
  └── webpack.config.js

ADDITIONAL FILES (added by this script):
  ├── src/types.ts            # TypeScript interfaces (skeleton)
  └── src/inputs.ts           # Input definitions (skeleton)

NOTE: For utility components, the agent should remove unused connector files
(client.ts, connections.ts, triggers.ts, dataSources.ts) during Phase 4.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

from project_directory import get_project_directory
from timing import print_timing_summary, timed_step


def to_pascal_case(name):
    """Convert kebab-case to PascalCase."""
    return "".join(word.capitalize() for word in name.split("-"))


def validate_component_name(name):
    """Validate component name follows conventions."""
    pattern = r"^[a-z][a-z0-9-]*[a-z0-9]$"
    if len(name) < 2:
        # Allow single-character names followed by nothing
        pattern = r"^[a-z][a-z0-9-]*$"
    return bool(re.match(pattern, name))


def is_initialized_component(component_path):
    """Check if directory is a fully initialized component project.

    A stub directory (just .prismatic/) is not initialized.
    A full project has src/ and package.json.
    """
    src_dir = os.path.join(component_path, "src")
    package_json = os.path.join(component_path, "package.json")
    return os.path.exists(src_dir) and os.path.exists(package_json)


@timed_step("Scaffold Component")
def scaffold_component(name):
    """Run prism components:init to scaffold the component.

    Strategy: Init in a temp directory, then move contents to target.
    This preserves any existing .prismatic/ session directory.
    """
    project_dir = get_project_directory()
    components_dir = os.path.join(project_dir, "components")
    component_path = os.path.join(components_dir, name)

    # Check if this is already a fully initialized component
    if os.path.exists(component_path) and is_initialized_component(component_path):
        print(f"Component already initialized: {component_path}")
        print("   Using existing component directory")
        return component_path

    print(f"Creating component: {name}")
    print(f"Location: {component_path}")
    print("")

    # Ensure components directory exists
    os.makedirs(components_dir, exist_ok=True)

    # Use a temp directory for initialization (same filesystem for efficient moves)
    with tempfile.TemporaryDirectory(dir=components_dir) as temp_dir:
        try:
            # Run prism init inside temp dir, creating temp_dir/name/
            result = subprocess.run(
                ["prism", "components:init", name],
                cwd=temp_dir,
                capture_output=True,
                text=True,
                timeout=120,
            )

            if result.returncode != 0:
                print("Component scaffolding failed")
                if result.stderr:
                    print("Error:", result.stderr[:500])
                if result.stdout:
                    print("Output:", result.stdout[:500])
                return None

            temp_component = os.path.join(temp_dir, name)
            prismatic_dir = os.path.join(component_path, ".prismatic")

            # Move .prismatic into temp_component so it ends up in the right place after rename
            if os.path.exists(prismatic_dir):
                shutil.move(prismatic_dir, os.path.join(temp_component, ".prismatic"))

            # Remove target and rename temp_component to target
            if os.path.exists(component_path):
                shutil.rmtree(component_path)
            shutil.move(temp_component, component_path)

            print("Component scaffolded via prism CLI")
            return component_path

        except subprocess.TimeoutExpired:
            print("Scaffolding timed out (2 minutes)")
            return None
        except Exception as e:
            print(f"Error: {e}")
            return None


@timed_step("Remove Test Files")
def remove_test_files(component_path):
    """Remove test-related files from the initialized component."""
    files_to_remove = [
        "jest.config.js",
    ]

    # Find and remove all *.test.ts files
    src_dir = os.path.join(component_path, "src")
    if os.path.exists(src_dir):
        for root, _dirs, files in os.walk(src_dir):
            for file in files:
                if file.endswith(".test.ts"):
                    files_to_remove.append(os.path.relpath(
                        os.path.join(root, file), component_path
                    ))

    removed = []
    for file_path in files_to_remove:
        full_path = os.path.join(component_path, file_path)
        if os.path.exists(full_path):
            os.remove(full_path)
            removed.append(file_path)

    # Remove test-related dependencies from package.json
    package_json_path = os.path.join(component_path, "package.json")
    if os.path.exists(package_json_path):
        with open(package_json_path, "r") as f:
            package_data = json.load(f)

        modified = False

        # Remove test script
        if "scripts" in package_data and "test" in package_data["scripts"]:
            del package_data["scripts"]["test"]
            modified = True

        # Remove test dependencies
        test_deps = ["@types/jest", "jest", "ts-jest"]
        if "devDependencies" in package_data:
            for dep in test_deps:
                if dep in package_data["devDependencies"]:
                    del package_data["devDependencies"][dep]
                    modified = True

        if modified:
            with open(package_json_path, "w") as f:
                json.dump(package_data, f, indent=2)
                f.write("\n")

    if removed:
        print(f"Removed test files: {', '.join(removed)}")
    print("Test dependencies removed from package.json")


@timed_step("Add Skeleton Files")
def add_skeleton_files(component_path, component_name):
    """Add types.ts and inputs.ts skeleton files (not created by CLI)."""
    pascal_name = to_pascal_case(component_name)
    src_dir = os.path.join(component_path, "src")

    # types.ts - empty interface skeleton
    types_content = f'''// Type definitions for {pascal_name} component

export interface {pascal_name}Resource {{
  id: string;
  // Add resource-specific fields here
}}
'''

    types_path = os.path.join(src_dir, "types.ts")
    if not os.path.exists(types_path):
        with open(types_path, "w") as f:
            f.write(types_content)
        print(f"Created: src/types.ts")

    # inputs.ts - connection input helper
    inputs_content = '''import { input, util } from "@prismatic-io/spectral";

export const connectionInput = input({
  label: "Connection",
  type: "connection",
  required: true,
});
'''

    inputs_path = os.path.join(src_dir, "inputs.ts")
    if not os.path.exists(inputs_path):
        with open(inputs_path, "w") as f:
            f.write(inputs_content)
        print(f"Created: src/inputs.ts")


@timed_step("Install Dependencies")
def install_npm_dependencies(component_path):
    """Install npm dependencies."""
    print("Installing npm dependencies...")
    try:
        result = subprocess.run(
            ["npm", "install", "--no-audit", "--no-fund"],
            cwd=component_path,
            capture_output=True,
            text=True,
            timeout=180,
        )
        if result.returncode == 0:
            print("Dependencies installed")
            return True
        else:
            print("npm install had issues")
            if result.stderr:
                # Show first few lines of error
                error_lines = result.stderr.strip().split("\n")[:5]
                for line in error_lines:
                    print(f"   {line}")
            return True  # Continue anyway, may still work
    except subprocess.TimeoutExpired:
        print("npm install timed out (3 minutes)")
        print("   Run manually: npm install")
        return False
    except Exception as e:
        print(f"Could not run npm install: {e}")
        print("   Run manually: npm install")
        return False


def print_final_status(success, component_path=None):
    """Print final status and next steps."""
    print("")
    print("=" * 60)
    if success:
        print("  SCAFFOLD COMPLETE")
    else:
        print("  SCAFFOLDING FAILED")
    print("=" * 60)

    print_timing_summary()

    print("")

    if success and component_path:
        print(f"Component scaffolded at: {component_path}")
        print("")
        print("Structure created by prism CLI:")
        print("  src/client.ts        - HTTP client")
        print("  src/connections.ts   - API Key + OAuth2 connections")
        print("  src/actions/         - Actions directory")
        print("  src/triggers.ts      - Webhook triggers")
        print("  src/dataSources.ts   - Data sources")
        print("  src/index.ts         - Component registration")
        print("")
        print("Added by scaffold script:")
        print("  src/types.ts         - TypeScript interfaces")
        print("  src/inputs.ts        - Input definitions")
        print("")
        print("Next: Phase 4 - Generate Code")
        print("  For UTILITY components: Remove unused files first")
        print("    - Delete: src/client.ts, src/connections.ts, src/triggers.ts, src/dataSources.ts")
        print("    - Update src/index.ts to only import/export actions")
        print("  For CONNECTOR components: Customize the generated files")
    else:
        print("Troubleshooting:")
        print("  - Verify Prism CLI is installed: prism --version")
        print("  - Verify you're logged in: prism me")
        print("  - Install Prism CLI: npm install -g @prismatic-io/prism")


def main():
    print("Prismatic Component Builder - Scaffold Component")
    print("")

    if len(sys.argv) < 2:
        print("Missing component name")
        print("")
        print("Usage: python scaffold_component.py <COMPONENT_NAME>")
        print("")
        print("Examples:")
        print("  python scaffold_component.py canny")
        print("  python scaffold_component.py date-utils")
        return 1

    component_name = sys.argv[1]

    # Validate component name
    if not validate_component_name(component_name):
        print("Invalid component name")
        print("   Name must be lowercase with hyphens (e.g., 'canny', 'date-utils')")
        return 1

    # Step 1: Scaffold component using prism CLI
    component_path = scaffold_component(component_name)
    if not component_path:
        print_final_status(False)
        return 3

    # Step 2: Remove test files
    remove_test_files(component_path)

    # Step 3: Add skeleton files (types.ts, inputs.ts)
    add_skeleton_files(component_path, component_name)

    # Step 4: Install npm dependencies
    install_npm_dependencies(component_path)

    # Success!
    print_final_status(True, component_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
