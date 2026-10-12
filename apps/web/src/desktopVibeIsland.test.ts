import { EnvironmentId, ProjectId, ThreadId, TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { reconcileDesktopVibeIslandThreads } from "./desktopVibeIsland";

const environmentId = EnvironmentId.make("remote-server");
const projectId = ProjectId.make("project-1");
const threadId = ThreadId.make("thread-1");
const projects = [{ id: projectId, workspaceRoot: "/remote/project" }];
const nowMs = Date.parse("2026-10-12T12:00:00.000Z");

function thread() {
  return {
    id: threadId,
    projectId,
    title: "Check the remote thread",
    worktreePath: null,
    archivedAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    session: { status: "running" as const },
    latestTurn: {
      turnId: TurnId.make("turn-1"),
      state: "running" as const,
      completedAt: null,
    },
  };
}

describe("desktop Vibe Island remote threads", () => {
  it("restores a running remote thread and does not repeat stable snapshots", () => {
    const current = thread();
    const restored = reconcileDesktopVibeIslandThreads(
      environmentId,
      projects,
      [current],
      new Map(),
      nowMs,
    );
    expect(restored.events).toEqual([
      {
        environmentId,
        threadId,
        cwd: "/remote/project",
        title: current.title,
        event: "SessionStart",
      },
      {
        environmentId,
        threadId,
        cwd: "/remote/project",
        title: current.title,
        event: "UserPromptSubmit",
      },
    ]);
    expect(
      reconcileDesktopVibeIslandThreads(environmentId, projects, [current], restored.threads, nowMs)
        .events,
    ).toEqual([]);
  });

  it("sends completion and starts a later turn once", () => {
    const current = thread();
    const running = reconcileDesktopVibeIslandThreads(
      environmentId,
      projects,
      [current],
      new Map(),
      nowMs,
    );
    const completed = {
      ...current,
      session: { status: "ready" as const },
      latestTurn: {
        ...current.latestTurn,
        state: "completed" as const,
        completedAt: "2026-10-12T11:59:59.000Z",
      },
    };
    const stopped = reconcileDesktopVibeIslandThreads(
      environmentId,
      projects,
      [completed],
      running.threads,
      nowMs,
    );
    expect(stopped.events.map(({ event }) => event)).toEqual(["Stop"]);
    expect(
      reconcileDesktopVibeIslandThreads(
        environmentId,
        projects,
        [completed],
        stopped.threads,
        nowMs,
      ).events,
    ).toEqual([]);
    const next = {
      ...current,
      latestTurn: { ...current.latestTurn, turnId: TurnId.make("turn-2") },
    };
    expect(
      reconcileDesktopVibeIslandThreads(
        environmentId,
        projects,
        [next],
        stopped.threads,
        nowMs,
      ).events.map(({ event }) => event),
    ).toEqual(["UserPromptSubmit"]);
  });

  it("restores recently completed threads without importing historic threads", () => {
    const current = thread();
    const completed = {
      ...current,
      session: { status: "ready" as const },
      latestTurn: {
        ...current.latestTurn,
        state: "completed" as const,
        completedAt: "2026-10-12T11:59:00.000Z",
      },
    };
    const historic = {
      ...completed,
      id: ThreadId.make("historic"),
      session: { status: "stopped" as const },
      latestTurn: { ...completed.latestTurn, completedAt: "2026-10-12T11:54:59.000Z" },
    };
    const restored = reconcileDesktopVibeIslandThreads(
      environmentId,
      projects,
      [completed, historic],
      new Map(),
      nowMs,
    );
    expect(restored.events.map(({ threadId, event }) => ({ threadId, event }))).toEqual([
      { threadId, event: "SessionStart" },
      { threadId, event: "Stop" },
    ]);
    expect([...restored.threads.keys()]).toEqual([threadId]);
  });

  it("restores an attached idle session using the latest turn's completed state", () => {
    const current = thread();
    const idle = {
      ...current,
      latestTurn: {
        ...current.latestTurn,
        state: "completed" as const,
        completedAt: "2026-10-12T10:00:00.000Z",
      },
    };
    expect(
      reconcileDesktopVibeIslandThreads(
        environmentId,
        projects,
        [idle],
        new Map(),
        nowMs,
      ).events.map(({ event }) => event),
    ).toEqual(["SessionStart", "Stop"]);
  });

  it("restores the selected thread after reconnect even when its session is stopped", () => {
    const current = thread();
    const selected = {
      ...current,
      session: { status: "stopped" as const },
      latestTurn: {
        ...current.latestTurn,
        state: "completed" as const,
        completedAt: "2026-10-12T10:00:00.000Z",
      },
    };
    expect(
      reconcileDesktopVibeIslandThreads(
        environmentId,
        projects,
        [selected],
        new Map(),
        nowMs,
        threadId,
      ).events.map(({ event }) => event),
    ).toEqual(["SessionStart", "Stop"]);
  });

  it("restores an approval and reports failures without waiting for provider hooks", () => {
    const current = { ...thread(), hasPendingApprovals: true };
    const approval = reconcileDesktopVibeIslandThreads(
      environmentId,
      projects,
      [current],
      new Map(),
      nowMs,
    );
    expect(approval.events.map(({ event }) => event)).toEqual(["SessionStart", "Notification"]);
    const failed = {
      ...current,
      hasPendingApprovals: false,
      session: { status: "error" as const },
      latestTurn: { ...current.latestTurn, state: "error" as const },
    };
    expect(
      reconcileDesktopVibeIslandThreads(
        environmentId,
        projects,
        [failed],
        approval.threads,
        nowMs,
      ).events.map(({ event }) => event),
    ).toEqual(["StopFailure"]);
  });

  it.each(["removed", "archived", "disconnected"])("ends tracked sessions when %s", (reason) => {
    const current = thread();
    const running = reconcileDesktopVibeIslandThreads(
      environmentId,
      projects,
      [current],
      new Map(),
      nowMs,
    );
    const remaining =
      reason === "archived" ? [{ ...current, archivedAt: "2026-10-12T12:00:00.000Z" }] : [];
    const ended = reconcileDesktopVibeIslandThreads(
      environmentId,
      projects,
      remaining,
      running.threads,
      nowMs,
    );
    expect(ended.events.map(({ event }) => event)).toEqual(["SessionEnd"]);
    expect(ended.threads.size).toBe(0);
    expect(
      reconcileDesktopVibeIslandThreads(environmentId, projects, remaining, ended.threads, nowMs)
        .events,
    ).toEqual([]);
  });
});
