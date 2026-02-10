#!/usr/bin/env python3
"""
package_for_download.py

PURPOSE: Package completed integration for user download

USAGE: python package_for_download.py <project-directory> [version-name]

PARAMETERS:
  project-directory - Path to integration project directory
  version-name - (Optional) Version name (e.g., "v1", "final")

EXIT CODES:
  0 - Success: Package created
  1 - Error: Project directory not found
  2 - Error: Zip creation failed

"""

import os
import sys
import zipfile
from datetime import datetime


def create_package(project_dir, version_name=None):
    """Create zip package of integration."""
    if not os.path.isdir(project_dir):
        print(f"❌ Project directory not found: {project_dir}")
        return 1

    project_name = os.path.basename(os.path.abspath(project_dir))
    if version_name:
        package_name = f"{project_name}-{version_name}.zip"
    else:
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        package_name = f"{project_name}-{timestamp}.zip"

    outputs_dir = "/mnt/user-data/outputs"
    os.makedirs(outputs_dir, exist_ok=True)
    output_path = os.path.join(outputs_dir, package_name)

    print(f"📦 Packaging integration: {project_dir}")
    print(f"Package: {package_name}")
    print("")

    try:
        file_count = 0
        excluded_patterns = [
            "node_modules",
            ".git",
            "__pycache__",
            ".DS_Store",
            ".env",
            "components",
        ]

        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(project_dir):
                dirs[:] = [d for d in dirs if d not in excluded_patterns]

                rel_root = os.path.relpath(root, os.path.dirname(project_dir))

                should_skip = False
                for pattern in excluded_patterns:
                    if pattern in root:
                        should_skip = True
                        break

                if should_skip:
                    continue

                for file in files:
                    if file in excluded_patterns or file.endswith(".pyc"):
                        continue

                    file_path = os.path.join(root, file)
                    arcname = os.path.join(rel_root, file)

                    zipf.write(file_path, arcname)
                    file_count += 1

        size_bytes = os.path.getsize(output_path)
        size_kb = size_bytes / 1024
        size_mb = size_kb / 1024

        print("✅ Package created successfully")
        print("")
        print(f"Files included: {file_count}")
        if size_mb >= 1:
            print(f"Package size: {size_mb:.2f} MB")
        else:
            print(f"Package size: {size_kb:.2f} KB")
        print("")
        print(f"Download location: {output_path}")
        print(f"Download link: computer:///{output_path}")
        print("")
        print("📋 Package contents:")
        print("  - Source code (src/)")
        print("  - Built artifacts (dist/)")
        print("  - Configuration files (package.json, tsconfig.json)")
        print("  - Documentation")
        print("")
        print("ℹ️  Excluded from package:")
        print("  - node_modules/ (dependencies)")
        print("  - components/ (downloaded component source)")
        print("  - .git/ (version control)")
        print("  - .env (secrets)")
        print("")
        print("To use this package:")
        print("  1. Download the zip file")
        print("  2. Extract on your local machine")
        print("  3. Run: npm install")
        print("  4. Deploy to Prismatic")

        return 0

    except Exception as e:
        print(f"❌ Error creating package: {e}")
        print("")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        return 2


def main():
    if len(sys.argv) < 2:
        print("❌ No project directory provided")
        print(
            "Usage: python package_for_download.py <project-directory> [version-name]"
        )
        return 1

    project_dir = sys.argv[1]
    version_name = sys.argv[2] if len(sys.argv) > 2 else None

    return create_package(project_dir, version_name)


if __name__ == "__main__":
    sys.exit(main())
