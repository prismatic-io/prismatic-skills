#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PARENT="$(dirname "$REPO_ROOT")"

echo "Removing iterative test worktrees..."

for dir in prismatic-test-python prismatic-test-typescript prismatic-test-nuclear; do
  target="$PARENT/$dir"
  if [ -d "$target" ]; then
    git -C "$REPO_ROOT" worktree remove "$target" --force
    echo "  removed $dir"
  else
    echo "  $dir not found, skipping"
  fi
done

echo "Done."
