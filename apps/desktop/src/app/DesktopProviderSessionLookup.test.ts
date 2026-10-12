// @effect-diagnostics nodeBuiltinImport:off - the suite builds a real SQLite fixture on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { findThreadForProviderSession } from "./DesktopProviderSessionLookup.ts";

const directories: string[] = [];

function makeStateDir(cursors: Record<string, unknown>, databaseName = "state.sqlite"): string {
  const stateDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-session-lookup-"));
  directories.push(stateDir);
  NodeFS.writeFileSync(NodePath.join(stateDir, "environment-id"), "env-1\n");
  const database = new NodeSqlite.DatabaseSync(NodePath.join(stateDir, databaseName));
  database.exec(
    "CREATE TABLE provider_session_runtime (thread_id TEXT, last_seen_at TEXT, resume_cursor_json TEXT)",
  );
  const insert = database.prepare("INSERT INTO provider_session_runtime VALUES (?, ?, ?)");
  for (const [threadId, cursor] of Object.entries(cursors)) {
    insert.run(threadId, "2026-10-11T00:00:00.000Z", JSON.stringify(cursor));
  }
  database.close();
  return stateDir;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

describe("provider session lookup", () => {
  it("uses current V2 native thread references before copied legacy cursors", () => {
    const stateDir = makeStateDir(
      {
        "legacy-thread": { resume: "claude-session-1" },
        "unimported-thread": { threadId: "legacy-codex-session" },
      },
      "statev2.sqlite",
    );
    const database = new NodeSqlite.DatabaseSync(NodePath.join(stateDir, "statev2.sqlite"));
    database.exec(
      "CREATE TABLE orchestration_v2_projection_provider_threads (thread_id TEXT, updated_at TEXT, payload_json TEXT)",
    );
    const insert = database.prepare(
      "INSERT INTO orchestration_v2_projection_provider_threads VALUES (?, ?, ?)",
    );
    insert.run(
      "claude-v2-thread",
      "2026-10-12T00:00:00.000Z",
      JSON.stringify({ nativeThreadRef: { nativeId: "claude-session-1" } }),
    );
    insert.run(
      "codex-v2-thread",
      "2026-10-12T00:00:00.000Z",
      JSON.stringify({ nativeThreadRef: { nativeId: "codex-session-1" } }),
    );
    database.close();

    expect(findThreadForProviderSession(stateDir, "claude-session-1")).toEqual({
      environmentId: "env-1",
      threadId: "claude-v2-thread",
    });
    expect(findThreadForProviderSession(stateDir, "codex-session-1")).toEqual({
      environmentId: "env-1",
      threadId: "codex-v2-thread",
    });
    expect(findThreadForProviderSession(stateDir, "legacy-codex-session")).toEqual({
      environmentId: "env-1",
      threadId: "unimported-thread",
    });
  });

  it("finds the thread of a Claude session and of a Codex thread", () => {
    const stateDir = makeStateDir({
      "thread-claude": { threadId: "thread-claude", resume: "claude-session-1" },
      "thread-codex": { threadId: "codex-thread-1" },
    });
    expect(findThreadForProviderSession(stateDir, "claude-session-1")).toEqual({
      environmentId: "env-1",
      threadId: "thread-claude",
    });
    expect(findThreadForProviderSession(stateDir, "codex-thread-1")).toEqual({
      environmentId: "env-1",
      threadId: "thread-codex",
    });
  });

  it("returns nothing for an unknown session or a missing database", () => {
    const stateDir = makeStateDir({ "thread-1": { resume: "known" } });
    expect(findThreadForProviderSession(stateDir, "unknown")).toBeNull();
    expect(findThreadForProviderSession(NodePath.join(stateDir, "missing"), "known")).toBeNull();
  });
});
