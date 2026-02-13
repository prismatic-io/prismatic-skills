#!/usr/bin/env python3
"""
scaffold_project.py

PURPOSE: Initialize integration project using Prism CLI and install component manifests

USAGE: python scaffold_project.py <INTEGRATION_NAME> [--components <component1,component2,...>] [--credentials '<json>']

PARAMETERS:
  INTEGRATION_NAME - Name for the integration (e.g., "salesforce-slack-sync")
  --components     - Comma-separated list of components to install manifests for (e.g., "slack,salesforce")
  --credentials    - JSON object with credentials to write to .env (e.g., '{"JIRA_CLIENT_ID":"abc"}')

EXIT CODES:
  0 - Success: Project scaffolded and dependencies installed
  1 - Error: Invalid usage
  3 - Error: Scaffolding failed
  4 - Error: Manifest installation failed

BEHAVIOR:
  1. Determine output directory (user's project root)
  2. Run `prism integrations:init` in a temp directory
  3. Move contents to target directory (preserving any existing .prismatic/)
  4. Install component manifests (if specified)
  5. Write OAuth/API credentials to .env (if specified)
  6. Install npm dependencies

  This script should be run AFTER Phase 2 requirements gathering.
  Assumes setup_prerequisites.py has already verified Prism CLI.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

SHARED_DIR = os.path.join(os.path.dirname(__file__), '..', 'shared')
sys.path.insert(0, SHARED_DIR)

from project_directory import get_project_root
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


def remove_test_files(project_path):
    """Remove test-related files from the initialized project."""
    files_to_remove = [
        ".env.testing",
        "src/flows.test.ts",
        "src/componentRegistry.ts",
        "jest.config.js",
        ".npmrc",
    ]

    for file_path in files_to_remove:
        full_path = os.path.join(project_path, file_path)
        if os.path.exists(full_path):
            os.remove(full_path)

    # Remove componentRegistry references from index.ts and add documentation import
    index_path = os.path.join(project_path, "src", "index.ts")
    if os.path.exists(index_path):
        with open(index_path, "r") as f:
            index_content = f.read()

        # Remove componentRegistry import, export, and usage
        index_content = index_content.replace(
            'import { componentRegistry } from "./componentRegistry";\n', ""
        )
        index_content = index_content.replace(
            'export { componentRegistry } from "./componentRegistry";\n', ""
        )
        index_content = re.sub(r"\n\s*componentRegistry,?", "", index_content)

        with open(index_path, "w") as f:
            f.write(index_content)

    # Remove test-related dependencies from package.json
    package_json_path = os.path.join(project_path, "package.json")
    if os.path.exists(package_json_path):
        with open(package_json_path, "r") as f:
            package_data = json.load(f)

        if "scripts" in package_data and "test" in package_data["scripts"]:
            del package_data["scripts"]["test"]

        test_deps = ["@types/jest", "jest", "ts-jest", "dotenv"]
        if "devDependencies" in package_data:
            for dep in test_deps:
                if dep in package_data["devDependencies"]:
                    del package_data["devDependencies"][dep]

        with open(package_json_path, "w") as f:
            json.dump(package_data, f, indent=2)
            f.write("\n")


def is_initialized_project(project_path):
    """Check if directory is a fully initialized integration project.

    A stub directory (just .prismatic/) is not initialized.
    A full project has src/ and package.json.
    """
    src_dir = os.path.join(project_path, "src")
    package_json = os.path.join(project_path, "package.json")
    return os.path.exists(src_dir) and os.path.exists(package_json)


@timed_step("Scaffold Project")
def scaffold_project(name):
    """Run prism integrations:init to scaffold the project.

    Strategy: Init in a temp directory, then move contents to target.
    This preserves any existing .prismatic/ session directory.
    """
    project_dir = get_project_root()
    project_path = os.path.join(project_dir, name)

    # Check if this is already a fully initialized project
    if os.path.exists(project_path) and is_initialized_project(project_path):
        print(f"⚠️  Project already initialized: {project_path}")
        print("   Using existing project directory")
        return project_path

    print(f"Creating project: {name}")
    print(f"Location: {project_path}")
    print("")

    # Use a temp directory for initialization (same filesystem for efficient moves)
    with tempfile.TemporaryDirectory(dir=project_dir) as temp_dir:
        try:
            # Run prism init inside temp dir, creating temp_dir/name/
            result = subprocess.run(
                ["prism", "integrations:init", name, "--clean"],
                cwd=temp_dir,
                capture_output=True,
                text=True,
                timeout=120,
            )

            if result.returncode != 0:
                print("❌ Project scaffolding failed")
                if result.stderr:
                    print("Error:", result.stderr[:500])
                if result.stdout:
                    print("Output:", result.stdout[:500])
                return None

            temp_project = os.path.join(temp_dir, name)
            prismatic_dir = os.path.join(project_path, ".prismatic")

            # Move .prismatic into temp_project so it ends up in the right place after rename
            if os.path.exists(prismatic_dir):
                shutil.move(prismatic_dir, os.path.join(temp_project, ".prismatic"))

            # Remove target and rename temp_project to target
            if os.path.exists(project_path):
                shutil.rmtree(project_path)
            shutil.move(temp_project, project_path)

            # Clean up test files and configure project
            remove_test_files(project_path)

            # Create .env file (will be populated with credentials later if provided)
            env_file_path = os.path.join(project_path, ".env")
            if not os.path.exists(env_file_path):
                with open(env_file_path, "w") as f:
                    f.write("# Environment variables for local development\n")
                    f.write("# This file is required by webpack but can remain empty for non-OAuth builds\n")

            print("✅ Project scaffolded")
            return project_path

        except subprocess.TimeoutExpired:
            print("❌ Scaffolding timed out (2 minutes)")
            return None
        except Exception as e:
            print(f"❌ Error: {e}")
            return None


@timed_step("Install Component Manifest")
def install_manifest(component, project_path):
    """Install a component manifest using npx cni-component-manifest.

    Args:
        component: Component key (e.g., "slack", "salesforce")
        project_path: Path to the integration project

    Returns:
        bool: True if successful
    """
    print(f"📦 Installing manifest for: {component}")

    try:
        result = subprocess.run(
            ["npx", "cni-component-manifest", component],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=project_path,
        )

        if result.returncode != 0:
            print(f"❌ Failed to install manifest for {component}")
            if result.stderr:
                print(f"   {result.stderr[:200]}")
            return False

        manifest_dir = os.path.join(project_path, "src", "manifests", component)
        if os.path.isdir(manifest_dir):
            print(f"✅ Manifest installed at: src/manifests/{component}/")
            return True
        else:
            print(f"⚠️  Manifest command succeeded but directory not found")
            return True  # Still return true as command succeeded

    except subprocess.TimeoutExpired:
        print(f"❌ Manifest installation timed out for {component}")
        return False
    except Exception as e:
        print(f"❌ Error installing manifest for {component}: {e}")
        return False


def install_all_manifests(components, project_path):
    """Install manifests for all specified components.

    Args:
        components: List of component keys
        project_path: Path to the integration project

    Returns:
        bool: True if all successful
    """
    if not components:
        return True

    print(f"📦 Installing {len(components)} component manifest(s)...")
    print("")

    all_success = True
    for component in components:
        if not install_manifest(component, project_path):
            all_success = False

    return all_success


@timed_step("Write Credentials")
def write_credentials_to_env(credentials, project_path):
    """Write OAuth/API credentials to .env file.

    Args:
        credentials: Dict mapping env var names to values
        project_path: Path to the integration project

    Returns:
        bool: True if successful
    """
    if not credentials:
        return True

    print(f"🔐 Writing {len(credentials)} credential(s) to .env...")

    env_path = os.path.join(project_path, ".env")

    try:
        # Read existing content
        existing_lines = []
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                existing_lines = [line.rstrip("\n") for line in f]

        # Add blank line separator if needed
        if existing_lines and existing_lines[-1].strip():
            existing_lines.append("")

        # Add credentials section header
        existing_lines.append("# OAuth/API Credentials")

        # Add credentials
        for key, value in credentials.items():
            existing_lines.append(f"{key}={value}")

        # Write file
        with open(env_path, "w") as f:
            f.write("\n".join(existing_lines))
            f.write("\n")

        # Display masked credentials
        for key in credentials.keys():
            print(f"   {key}=****")

        print("✅ Credentials written to .env")
        return True

    except IOError as e:
        print(f"❌ Failed to write credentials: {e}")
        return False


@timed_step("Install Dependencies")
def install_npm_dependencies(project_path):
    """Install npm dependencies."""
    print("📦 Installing npm dependencies...")
    try:
        result = subprocess.run(
            ["npm", "install"],
            cwd=project_path,
            capture_output=True,
            text=True,
            timeout=180,
        )
        if result.returncode == 0:
            print("✅ Dependencies installed")
            return True
        else:
            print("⚠️  npm install had issues")
            if result.stderr:
                # Show first few lines of error
                error_lines = result.stderr.strip().split("\n")[:5]
                for line in error_lines:
                    print(f"   {line}")
            return True  # Continue anyway, may still work
    except subprocess.TimeoutExpired:
        print("⚠️  npm install timed out (3 minutes)")
        print("   Run manually: npm install")
        return False
    except Exception as e:
        print(f"⚠️  Could not run npm install: {e}")
        print("   Run manually: npm install")
        return False


def print_final_status(success, project_path=None, components=None, credentials=None):
    """Print final status and next steps."""
    print("")
    print("=" * 60)
    if success:
        print("  ✅ PROJECT SCAFFOLDED")
    else:
        print("  ❌ SCAFFOLDING FAILED")
    print("=" * 60)

    print_timing_summary()

    print("")

    if success and project_path:
        print("🎉 Project ready for code generation!")
        print("")
        print(f"📁 Project: {project_path}")
        if components:
            print(f"📦 Manifests: {', '.join(components)}")
        if credentials:
            print(f"🔐 Credentials: {len(credentials)} written to .env")
        print("")
        print("📋 Next: Phase 3 - Generate Code")
        print("   - src/componentRegistry.ts")
        print("   - src/configPages.ts")
        print("   - src/flows.ts")
        print("   - src/index.ts")
    else:
        print("💡 Troubleshooting:")
        print("  • Verify Prism CLI is installed: prism --version")
        print("  • Verify you're logged in: prism me")
        print("  • Install Prism CLI: npm install -g @prismatic-io/prism")


KNOWN_FLAGS = {"--components", "--credentials"}


def parse_args(args):
    """Parse command line arguments.

    Args:
        args: List of command line arguments (sys.argv[1:])

    Returns:
        tuple: (integration_name, components_list, credentials_dict)

    Raises:
        SystemExit: If unknown arguments are provided
    """
    integration_name = None
    components = []
    credentials = {}

    i = 0
    while i < len(args):
        if args[i] == "--components" and i + 1 < len(args):
            # Parse comma-separated components
            components = [c.strip() for c in args[i + 1].split(",") if c.strip()]
            i += 2
        elif args[i] == "--credentials" and i + 1 < len(args):
            # Parse JSON credentials
            try:
                credentials = json.loads(args[i + 1])
            except json.JSONDecodeError as e:
                print(f"❌ Invalid credentials JSON: {e}")
                sys.exit(1)
            i += 2
        elif not args[i].startswith("-"):
            if integration_name is not None:
                print(f"❌ Unexpected argument: {args[i]}")
                print("")
                print("Supported options:")
                print("  <integration-name>              Integration name (required)")
                print("  --components <comp1,comp2,...>  Components to install manifests for")
                print("  --credentials '<json>'          JSON object with OAuth/API credentials for .env")
                sys.exit(1)
            integration_name = args[i]
            i += 1
        elif args[i].startswith("-") and args[i] not in KNOWN_FLAGS:
            print(f"❌ Unknown argument: {args[i]}")
            print("")
            print("Supported options:")
            print("  <integration-name>              Integration name (required)")
            print("  --components <comp1,comp2,...>  Components to install manifests for")
            print("  --credentials '<json>'          JSON object with OAuth/API credentials for .env")
            sys.exit(1)
        else:
            i += 1

    return integration_name, components, credentials


def main():
    print("🏗️  Prismatic Integration Builder - Scaffold Project")
    print("")

    if len(sys.argv) < 2:
        print("❌ Missing integration name")
        print("")
        print("Usage: python scaffold_project.py <INTEGRATION_NAME> [--components <comp1,comp2,...>] [--credentials '<json>']")
        print("")
        print("Examples:")
        print("  python scaffold_project.py salesforce-slack-sync")
        print("  python scaffold_project.py slack-acme --components slack")
        print("  python scaffold_project.py jira-sync --components atlassian-jira --credentials '{\"JIRA_CLIENT_ID\":\"abc\"}'")
        return 1

    # Parse arguments
    integration_name, components, credentials = parse_args(sys.argv[1:])

    if not integration_name:
        print("❌ Missing integration name")
        return 1

    # Validate integration name
    if not validate_integration_name(integration_name):
        print("❌ Invalid integration name")
        print("   Name must be lowercase with hyphens (e.g., 'salesforce-slack-sync')")
        print("   Must start with a letter and end with a letter or number")
        return 1

    # Step 1: Scaffold project
    print_section("Scaffolding Project")
    project_path = scaffold_project(integration_name)
    if not project_path:
        print_final_status(False)
        return 3

    # Step 2: Install npm dependencies
    print_section("Installing Dependencies")
    install_npm_dependencies(project_path)

    # Step 3: Install component manifests (if specified)
    if components:
        print_section("Installing Component Manifests")
        if not install_all_manifests(components, project_path):
            print_final_status(False, project_path, components)
            return 4

    # Step 4: Write credentials to .env (if specified)
    if credentials:
        print_section("Writing Credentials")
        if not write_credentials_to_env(credentials, project_path):
            print("⚠️  Credentials writing failed, but continuing...")

    # Success!
    print_final_status(True, project_path, components, credentials)
    return 0


if __name__ == "__main__":
    sys.exit(main())
