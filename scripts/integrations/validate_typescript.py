#!/usr/bin/env python3
"""
validate_typescript.py

PURPOSE: Validate TypeScript code without building (fast type checking)

USAGE: python validate_typescript.py <integration-dir>

PARAMETERS:
  integration-dir - Path to integration project directory

EXIT CODES:
  0 - Success: No TypeScript errors
  1 - Error: Invalid parameters or directory
  2 - Error: TypeScript validation failed
  3 - Error: npx/tsc not found

BEHAVIOR:
  1. Changes to integration directory
  2. Runs: npx tsc --noEmit
  3. Reports TypeScript errors if any
  4. Faster than full build (~5-10 seconds vs 30-60 seconds)

USE WHEN:
  - Quickly validating code changes before building
  - Checking for type errors during development
  - Pre-build validation to catch errors early
"""

import os
import subprocess
import sys


def validate_typescript(integration_dir):
    """Run TypeScript validation without emitting files."""
    # Validate integration directory
    if not os.path.isdir(integration_dir):
        print(f"❌ Directory not found: {integration_dir}")
        print("")
        print("Please provide a valid integration directory path.")
        return 1

    # Check for tsconfig.json
    tsconfig = os.path.join(integration_dir, "tsconfig.json")
    if not os.path.exists(tsconfig):
        print(f"❌ Not a TypeScript project: {integration_dir}")
        print("")
        print("Integration directories must contain tsconfig.json")
        return 1

    print("⏳ Validating TypeScript...")

    try:
        result = subprocess.run(
            ["npx", "tsc", "--noEmit"],
            cwd=integration_dir,
            capture_output=True,
            text=True,
            timeout=60,
        )

        if result.returncode == 0:
            print("✅ No type errors")
            return 0
        else:
            print("❌ Type errors found:")
            print(result.stdout if result.stdout else result.stderr)
            return 2

    except subprocess.TimeoutExpired:
        print("❌ Validation timeout (60s)")
        return 2
    except FileNotFoundError:
        print("❌ tsc not found")
        print(f"→ Run: python scripts/install_dependencies.py {integration_dir}")
        return 3
    except Exception as e:
        print(f"❌ Error: {e}")
        return 2


def main():
    if len(sys.argv) < 2:
        print("Usage: python validate_typescript.py <integration-dir>")
        print("")
        print("Example:")
        print("  python validate_typescript.py ./my-integration")
        print("")
        print("Benefits:")
        print("  - Fast validation (5-10 seconds vs full build)")
        print("  - Catches type errors early")
        print("  - Better error messages than webpack")
        return 1

    integration_dir = sys.argv[1]
    return validate_typescript(integration_dir)


if __name__ == "__main__":
    sys.exit(main())
