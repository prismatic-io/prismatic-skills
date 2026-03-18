#!/bin/bash
# PreToolUse hook for Bash commands.
# Requires user confirmation for scaffold and deploy operations.
# Reads tool input from stdin (JSON with tool_input.command).

COMMAND=$(jq -r '.tool_input.command // ""' 2>/dev/null)

if echo "$COMMAND" | grep -q 'scaffold-project.ts'; then
  echo '{"hookSpecificOutput":{"permissionDecision":"ask","permissionDecisionReason":"Scaffolding creates project files on disk."}}'
elif echo "$COMMAND" | grep -q 'deploy-integration.ts'; then
  echo '{"hookSpecificOutput":{"permissionDecision":"ask","permissionDecisionReason":"Deploying pushes code to the Prismatic platform."}}'
fi
# No output + exit 0 = allow (passthrough for all other commands)
