// @effect-diagnostics nodeBuiltinImport:off -- a synchronous read-only lookup run from an Electron URL handler.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

import type { DesktopThreadLink } from "./DesktopThreadLink.ts";

/**
 * Vibe Island only knows the provider's own session id (the Claude session or
 * the Codex thread). The server records it in each provider thread's native reference, so a
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
    const v2Path = NodePath.join(stateDir, "statev2.sqlite");
    database = new NodeSqlite.DatabaseSync(
      NodeFS.existsSync(v2Path) ? v2Path : NodePath.join(stateDir, "state.sqlite"),
      {
        readOnly: true,
      },
    );
    const table = database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    );
    const v2Row = table.get("orchestration_v2_projection_provider_threads")
      ? database
          .prepare(
            `SELECT thread_id FROM orchestration_v2_projection_provider_threads
            WHERE thread_id IS NOT NULL AND json_valid(payload_json)
              AND json_extract(payload_json, '$.nativeThreadRef.nativeId') = ?1
            ORDER BY updated_at DESC
            LIMIT 1`,
          )
          .get(providerSessionId)
      : undefined;
    // V2 retains legacy cursors for threads whose transcripts have not been imported yet.
    const row =
      v2Row ??
      (table.get("provider_session_runtime")
        ? database
            .prepare(
              `SELECT thread_id FROM provider_session_runtime
          WHERE json_valid(resume_cursor_json)
            AND (json_extract(resume_cursor_json, '$.resume') = ?1
              OR json_extract(resume_cursor_json, '$.threadId') = ?1)
          ORDER BY last_seen_at DESC
          LIMIT 1`,
            )
            .get(providerSessionId)
        : undefined);
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
