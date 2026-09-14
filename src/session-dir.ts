/**
 * session-dir.ts — Pure function for deriving subagent session directories.
 *
 * Subagent sessions are nested under the parent session's basename so they are
 * discoverable via the parent session path without cluttering the main session list.
 *
 * Ported from @gotgenes/pi-subagents session-dir.ts.
 */

import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

/**
 * Derive the session directory for a subagent from the parent session file.
 *
 * Layout: `<parent-dir>/<parent-basename>/tasks/`
 *
 * Example:
 *   parent: `~/.pi/agent/sessions/2026-09-09T17-38-37-369Z_01a08740-0eb9-77da-b3f5-83a5dfb696a7.jsonl`
 *   result: `~/.pi/agent/sessions/2026-09-09T17-38-37-369Z_01a08740-0eb9-77da-b3f5-83a5dfb696a7/tasks`
 *
 * Falls back to a temp directory when the parent session is not persisted
 * (e.g. API/headless mode where the parent uses `SessionManager.inMemory()`).
 */
export function deriveSubagentSessionDir(
  parentSessionFile: string | undefined,
  fallbackDir?: string,
): string {
  if (parentSessionFile) {
    const dir = dirname(parentSessionFile);
    const base = basename(parentSessionFile, ".jsonl");
    return join(dir, base, "tasks");
  }

  // Fallback: use a temp directory keyed by uid and cwd so different
  // projects don't collide when the parent session is not persisted.
  const fallback = fallbackDir ?? process.cwd();
  const encoded = fallback.replace(/[/\\]/g, "-").replace(/^[A-Za-z]:-/, "").replace(/^-+/, "");
  const uid = typeof process.getuid === "function"
    ? process.getuid()
    : (process.env.USERNAME ?? "unknown");
  const root = join(tmpdir(), `pi-subagents-${uid}`);
  return join(root, encoded, "tasks");
}
