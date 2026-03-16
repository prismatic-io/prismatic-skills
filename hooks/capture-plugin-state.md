---
name: capture-plugin-state
event: SessionStart
command: "cd ${CLAUDE_PLUGIN_ROOT} && git rev-parse --short HEAD > /tmp/prismatic-skills-loaded-commit && git branch --show-current > /tmp/prismatic-skills-loaded-branch 2>/dev/null || echo 'detached' > /tmp/prismatic-skills-loaded-branch"
---
