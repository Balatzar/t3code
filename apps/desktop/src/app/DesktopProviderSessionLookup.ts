// @effect-diagnostics nodeBuiltinImport:off -- a synchronous read-only lookup run from an Electron URL handler.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

import type { DesktopThreadLink } from "./DesktopThreadLink.ts";

/**
 * Vibe Island only knows the provider's own session id (the Claude session or
 * the Codex thread). The server records it in each thread's resume cursor, so a
 * read-only lookup in the server database finds the T3 thread it belongs to.
 */
export function findThreadForProviderSession(
  stateDir: string,
  providerSessionId: string,
): DesktopThreadLink | null {
  const environmentId = readEnvironmentId(stateDir);
  if (environmentId === null) return null;
  let database: NodeSqlite.DatabaseSync | undefined;
  try {
    database = new NodeSqlite.DatabaseSync(NodePath.join(stateDir, "state.sqlite"), {
      readOnly: true,
    });
    const row = database
      .prepare(
        `SELECT thread_id FROM provider_session_runtime
          WHERE json_valid(resume_cursor_json)
            AND (json_extract(resume_cursor_json, '$.resume') = ?1
              OR json_extract(resume_cursor_json, '$.threadId') = ?1)
          ORDER BY last_seen_at DESC
          LIMIT 1`,
      )
      .get(providerSessionId) as { thread_id?: unknown } | undefined;
    return typeof row?.thread_id === "string" ? { environmentId, threadId: row.thread_id } : null;
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

function readEnvironmentId(stateDir: string): string | null {
  try {
    const value = NodeFS.readFileSync(NodePath.join(stateDir, "environment-id"), "utf8").trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}
