#!/bin/bash
# Build distribution packages for Prismatic Skills
# Creates ZIP files following Anthropic's skill packaging guidelines

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$ROOT_DIR/dist"

# Files/directories to exclude from packages
EXCLUDES=(
    "*.pyc"
    "__pycache__"
    "__pycache__/*"
    ".DS_Store"
    ".git"
    ".git/*"
    ".gitignore"
    "*.egg-info"
    "*.egg-info/*"
)

# Build exclude arguments for zip
build_excludes() {
    local args=""
    for pattern in "${EXCLUDES[@]}"; do
        args="$args -x \"$pattern\""
    done
    echo "$args"
}

echo "Building Prismatic Skills distribution packages..."
echo "=================================================="

# Clean and create dist directory
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Build individual skill packages
echo ""
echo "Building skill packages..."

for skill_dir in "$ROOT_DIR/skills/"*/; do
    if [ -d "$skill_dir" ]; then
        skill_name=$(basename "$skill_dir")
        zip_file="$DIST_DIR/${skill_name}.zip"

        echo "  - $skill_name.zip"

        # Create zip with skill folder at root (Anthropic guideline)
        cd "$ROOT_DIR/skills"
        eval "zip -r \"$zip_file\" \"$skill_name\" $(build_excludes)" > /dev/null
    fi
done

# Build individual agent packages
echo ""
echo "Building agent packages..."

for agent_file in "$ROOT_DIR/agents/"*.md; do
    if [ -f "$agent_file" ]; then
        agent_name=$(basename "$agent_file" .md)
        zip_file="$DIST_DIR/${agent_name}.zip"

        echo "  - $agent_name.zip"

        # Create zip with agent file at root
        cd "$ROOT_DIR/agents"
        zip "$zip_file" "$(basename "$agent_file")" > /dev/null
    fi
done

# Build combined package
echo ""
echo "Building combined package..."
echo "  - prismatic-skills-all.zip"

cd "$ROOT_DIR"
eval "zip -r \"$DIST_DIR/prismatic-skills-all.zip\" \
    skills/ \
    agents/ \
    README.md \
    $(build_excludes)" > /dev/null

# Summary
echo ""
echo "=================================================="
echo "Distribution packages created in dist/:"
echo ""
ls -lh "$DIST_DIR"
echo ""
echo "Installation:"
echo "  unzip dist/<package>.zip -d ~/.claude/skills/   # For skills"
echo "  unzip dist/<package>.zip -d ~/.claude/agents/   # For agents"
