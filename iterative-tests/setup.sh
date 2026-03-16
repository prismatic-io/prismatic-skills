#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PARENT="$(dirname "$REPO_ROOT")"

echo "Creating iterative test worktrees..."

for branch_worktree in \
  "bl/improve-python-dag-usage:prismatic-test-python" \
  "bl/use-TS-instead-of-python:prismatic-test-typescript" \
  "bl/rely-on-types-only:prismatic-test-nuclear"; do

  branch="${branch_worktree%%:*}"
  dir="${branch_worktree##*:}"
  target="$PARENT/$dir"

  if [ -d "$target" ]; then
    echo "  $dir already exists, skipping"
  else
    git -C "$REPO_ROOT" worktree add "$target" "$branch"
    echo "  created $dir → $branch"
  fi
done

echo ""
echo "Worktrees ready. To run a test:"
echo ""
echo "  cd $PARENT/prismatic-test-python"
echo "  claude --plugin-dir ."
echo ""
echo "  cd $PARENT/prismatic-test-typescript"
echo "  claude --plugin-dir ."
echo ""
echo "  cd $PARENT/prismatic-test-nuclear"
echo "  claude --plugin-dir ."
