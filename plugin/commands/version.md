---
name: version
description: Check which plugin version is loaded and whether the session is stale
user-invocable: true
---

Check whether this session's plugin matches what's currently on disk.

Run the version-check script and report its output verbatim:

```
npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/run.ts version-check
```

The script compares the load-time version snapshot (written by the SessionStart hook) against the current `plugin.json` and prints one of three statuses:

- **current** — loaded version matches disk
- **STALE** — loaded version differs from disk; tell the user to restart their Claude Code session
- **unknown** — snapshot file missing (older session); tell the user to restart Claude Code so the snapshot hook runs

It also lists the loaded `scripts/` and `agents/` directories as structural indicators.
