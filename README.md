# @tintinweb/pi-subagents (fork)

> **Fork of [@tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents)** with session isolation for cleaner `/resume` lists.

A [pi](https://pi.dev) extension that brings **Claude Code-style autonomous sub-agents and workflow orchestration** to pi. Spawn specialized agents that run in isolated sessions — each with its own tools, system prompt, model, and thinking level.

## What's Different in This Fork

### Session Isolation

**Problem**: By default, all subagent sessions are stored in the same flat directory as parent sessions. This clutters `/resume` with dozens of internal agent sessions that users rarely need to resume.

**Solution**: Subagent sessions are now stored in a `<parent>/tasks/` subdirectory, leveraging Pi's shallow session discovery (which only scans `*.jsonl` in the flat top-level directory) to automatically hide child sessions from `/resume`.

```
~/.pi/agent/sessions/<cwd>/
├── main.jsonl                    ← /resume 可见
├── another-session.jsonl         ← /resume 可见
└── main/
    └── tasks/
        ├── explore.jsonl         ← /resume 不可见 ✅
        └── explore/
            └── tasks/
                └── child.jsonl   ← /resume 不可见 ✅ (multi-level)
```

#### How It Works

1. **Session files** for subagents are written to `<parent>/tasks/` instead of the flat parent directory
2. **`parentSession` metadata** is preserved — lineage tracking remains intact
3. **`/resume`** only scans the top-level directory, so child sessions are invisible
4. **`@handle`** can still resume subagent sessions (the file path is complete)
5. **Multi-level nesting** is intentional: a child that spawns produces `<child>/tasks/<grandchild>`, mirroring the agent tree

#### Implementation

- `src/session-dir.ts`: New file with `deriveSubagentSessionDir()` — pure function derived from [@gotgenes/pi-subagents](https://github.com/gotgenes/pi-subagents)
- `src/agent-runner.ts`: Modified to use derived session directory for child sessions while preserving `baseSessionDir` for resume

#### Compatibility

| Feature | Status | Notes |
|---------|--------|-------|
| FleetView | ✅ | Unaffected |
| Agent mentions | ✅ | Unaffected |
| Workflow | ✅ | Unaffected |
| steer_subagent | ✅ | Unaffected |
| get_subagent_result | ✅ | Unaffected |
| pi-tasks | ⚠️ | Separate issue (not related to this patch) |
| rememberAgents | ✅ | Session location changed, persistence logic unchanged |
| Resume via /resume | ✅ | Shows only parent sessions |
| Resume via @handle | ✅ | Can still open child sessions |

---

## Features

- **Claude Code look & feel** — same tool names, calling conventions, and UI patterns (`Agent`, `get_subagent_result`, `steer_subagent`) — feels native
- **Parallel background agents** — spawn multiple agents that run concurrently with automatic queuing (configurable concurrency limit, default 10) and smart group join (consolidated notifications)
- **Live widget UI** — persistent above-editor widget with animated spinners, live tool activity, token counts, and colored status icons
- **FleetView** — Claude Code-style navigable list of `main` + every running subagent rendered below the editor
- **Conversation viewer** — select any agent in `/agents` to open a live-scrolling overlay of its full conversation
- **Custom agent types** — define agents in `.pi/agents/<name>.md` with YAML frontmatter
- **Nested subagents** — opt-in delegation with ownership-scoped tools
- **Agent mentions** — `@explore check the RPC path` sends to that agent
- **Scripted workflows** — deterministic JavaScript orchestration with `agent()`, `parallel()`, `pipeline()`, `phase()`, `log()`
- **Mid-run steering** — inject messages into running agents
- **Session resume** — pick up where an agent left off
- **Graceful turn limits** — agents get a "wrap up" warning before hard abort
- **Persistent agent memory** — three scopes (project, local, user)
- **Git worktree isolation** — run agents in isolated repo copies
- **Skill preloading** — inject named skills into agent system prompts
- **Cross-extension RPC** — other pi extensions can spawn, stop, and join subagents

## Install

```bash
# Install from GitHub
pi install github:C-git-qok/pi-subagents

# Or install locally
pi install file:~/dev/pi-subagents
```

## Development

```bash
# Clone the fork
git clone https://github.com/C-git-qok/pi-subagents.git
cd pi-subagents

# Install dependencies
bun install

# Build
bun run build

# Run in development mode
pi -e ./src/index.ts
```

## Credits

- **Original**: [tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents)
- **Session isolation**: Derived from [gotgenes/pi-subagents](https://github.com/gotgenes/pi-subagents) session-dir.ts

## License

MIT — same as original.
