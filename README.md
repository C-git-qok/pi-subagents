# pi-subagents (fork)

Fork of [@tintinweb/pi-subagents](https://github.com/nicepkg/pi-subagents) with child session isolation.

## Changes

### Session Isolation

Child agent sessions are now stored in `<parent>/tasks/` subdirectories instead of the flat session directory.

**Before:**
```
~/.pi/agent/sessions/<cwd>/
├── main.jsonl
├── explore.jsonl      ← visible in /resume ❌
└── research.jsonl     ← visible in /resume ❌
```

**After:**
```
~/.pi/agent/sessions/<cwd>/
├── main.jsonl
└── main/
    └── tasks/
        ├── explore.jsonl   ← hidden from /resume ✅
        └── research.jsonl  ← hidden from /resume ✅
```

### Why

- `/resume` lists only flat `.jsonl` files in the session directory
- Child agent sessions don't pollute the resume list
- Parent session lineage is preserved via `parentSession` metadata

### Files Changed

- `src/session-dir.ts` — New file: derives subagent session directories
- `src/agent-runner.ts` — Uses derived session directory for child spawns

### Install

```bash
# From GitHub
pi install github:C-git-qok/-tintinweb-L-pi-subagents

# Or locally
cd ~/dev/pi-subagents
pi install file:.
```

## Notes

- Depends on Pi's shallow session discovery (scans only `*.jsonl` in flat dir)
- Multi-level nesting is intentional: `tasks/<child>/tasks/<grandchild>`
- `rememberAgents` behavior unchanged
- Compatible with `@tintinweb/pi-tasks`

## Upstream

Based on `@tintinweb/pi-subagents` v0.19.0
