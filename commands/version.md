---
name: version
description: Check which plugin version is loaded and whether the session is stale
user-invocable: true
---

Check whether this session's plugin matches what's currently on disk.

## Steps

1. Read the load-time snapshot (captured when this session started):
   - `cat /tmp/prismatic-skills-loaded-commit` → the commit hash at session start
   - `cat /tmp/prismatic-skills-loaded-branch` → the branch at session start

2. Read the current disk state:
   - `cd ${CLAUDE_PLUGIN_ROOT} && git rev-parse --short HEAD` → current commit
   - `cd ${CLAUDE_PLUGIN_ROOT} && git branch --show-current` → current branch

3. Compare them and report:

**If both match:**
> Plugin: prismatic-skills
> Branch: {branch} @ {commit}
> Status: current

**If they differ:**
> Plugin: prismatic-skills
> Loaded at session start: {loaded_branch} @ {loaded_commit}
> Current on disk: {current_branch} @ {current_commit}
> Status: STALE — restart your Claude Code session to pick up the new version

4. Also list the key structural indicators for the loaded version:
   - Run `ls ${CLAUDE_PLUGIN_ROOT}/scripts/ 2>/dev/null | head -5` — if scripts exist, which kind?
   - Run `ls ${CLAUDE_PLUGIN_ROOT}/agents/` — which agents are present?
   - Whether `${CLAUDE_PLUGIN_ROOT}/package.json` exists
