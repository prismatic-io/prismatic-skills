#!/usr/bin/env python3
"""
build_integration.py

PURPOSE: Compile TypeScript CNI code to JavaScript

USAGE: python build_integration.py <project-directory>

PARAMETERS:
  project-directory - Path to integration project directory

EXIT CODES:
  0 - Success: Build completed
  1 - Error: Project directory not found
  2 - Error: TypeScript compilation failed

"""

import os
import subprocess
import sys


def parse_typescript_errors(stderr):
    """Parse TypeScript compilation errors into readable format."""
    if not stderr:
        return ""

    lines = stderr.split("\n")
    errors = []
    current_error = []

    for line in lines:
        if ".ts(" in line and "error TS" in line:
            if current_error:
                errors.append("\n".join(current_error))
                current_error = []
            current_error.append(line)
        elif current_error and line.strip():
            current_error.append(line)

    if current_error:
        errors.append("\n".join(current_error))

    if errors:
        return "\n\n".join(errors)
    return stderr


def build_integration(project_dir):
    """Compile TypeScript to JavaScript."""
    if not os.path.isdir(project_dir):
        print(f"❌ Project directory not found: {project_dir}")
        return 1

    package_json = os.path.join(project_dir, "package.json")
    if not os.path.isfile(package_json):
        print(f"❌ package.json not found in {project_dir}")
        print("")
        print("This doesn't appear to be a valid Node.js project.")
        return 1

    node_modules = os.path.join(project_dir, "node_modules")
    if not os.path.isdir(node_modules):
        print("❌ Dependencies not installed")
        print(f"→ Run: python scripts/install_dependencies.py {project_dir}")
        return 1

    print("⏳ Building...")

    try:
        result = subprocess.run(
            ["npm", "run", "build"],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode == 0:
            dist_path = os.path.join(project_dir, "dist")
            print(f"✅ Build complete: {dist_path}/")
            return 0
        else:
            print("❌ Build failed")
            if result.stderr:
                parsed_errors = parse_typescript_errors(result.stderr)
                print(parsed_errors if parsed_errors else result.stderr)
            elif result.stdout:
                print(result.stdout)
            print(f"→ Validate: python scripts/validate_typescript.py {project_dir}")
            return 2

    except subprocess.TimeoutExpired:
        print("❌ Build timed out (2 minutes)")
        print("")
        print("The build took longer than expected.")
        print("This could indicate an issue with the build process.")
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
        print("Usage: python build_integration.py <project-directory>")
        return 1

    return build_integration(sys.argv[1])


if __name__ == "__main__":
    sys.exit(main())
