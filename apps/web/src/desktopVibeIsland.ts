import type {
  DesktopVibeIslandEvent,
  EnvironmentId,
  OrchestrationLatestTurn,
  OrchestrationProjectShell,
  OrchestrationSession,
  OrchestrationThreadShell,
  ThreadId,
} from "@t3tools/contracts";

type VibeIslandThread = Pick<
  OrchestrationThreadShell,
  | "id"
  | "projectId"
  | "title"
  | "worktreePath"
  | "archivedAt"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
> & {
  readonly session: Pick<OrchestrationSession, "status"> | null;
  readonly latestTurn: Pick<OrchestrationLatestTurn, "turnId" | "state" | "completedAt"> | null;
};

export interface DesktopVibeIslandThreadState {
  readonly payload: DesktopVibeIslandEvent;
  readonly turnId: string | null;
}

export function reconcileDesktopVibeIslandThreads(
  environmentId: EnvironmentId,
  projects: ReadonlyArray<Pick<OrchestrationProjectShell, "id" | "workspaceRoot">>,
  current: ReadonlyArray<VibeIslandThread>,
  previous: ReadonlyMap<ThreadId, DesktopVibeIslandThreadState>,
  nowMs: number,
  selectedThreadId?: string,
): {
  events: DesktopVibeIslandEvent[];
  threads: Map<ThreadId, DesktopVibeIslandThreadState>;
} {
  const events: DesktopVibeIslandEvent[] = [];
  const threads = new Map<ThreadId, DesktopVibeIslandThreadState>();
  const workspaceRoots = new Map(projects.map((project) => [project.id, project.workspaceRoot]));
  for (const thread of current) {
    if (thread.archivedAt !== null) continue;
    const prior = previous.get(thread.id);
    const awaitingInput = thread.hasPendingApprovals || thread.hasPendingUserInput;
    const liveSession =
      thread.session !== null &&
      thread.session.status !== "stopped" &&
      thread.session.status !== "error";
    const running =
      thread.latestTurn?.state === "running" ||
      (thread.latestTurn === null &&
        (thread.session?.status === "running" || thread.session?.status === "starting"));
    const completedAt = Date.parse(thread.latestTurn?.completedAt ?? "");
    const recentlyCompleted = completedAt <= nowMs && nowMs - completedAt <= 5 * 60_000;
    const selected = thread.id === selectedThreadId && thread.latestTurn !== null;
    if (!prior && !liveSession && !running && !awaitingInput && !recentlyCompleted && !selected)
      continue;
    const cwd = thread.worktreePath ?? workspaceRoots.get(thread.projectId);
    if (!cwd) continue;
    const event = awaitingInput
      ? "Notification"
      : thread.session?.status === "error" || thread.latestTurn?.state === "error"
        ? "StopFailure"
        : running
          ? "UserPromptSubmit"
          : "Stop";
    const payload = {
      environmentId,
      threadId: thread.id,
      cwd,
      title: thread.title.slice(0, 500),
      event,
    } satisfies DesktopVibeIslandEvent;
    const turnId = thread.latestTurn?.turnId ?? null;
    if (!prior) events.push({ ...payload, event: "SessionStart" });
    if (!prior || prior.turnId !== turnId || prior.payload.event !== event) events.push(payload);
    threads.set(thread.id, { payload, turnId });
  }
  for (const [threadId, prior] of previous) {
    if (!threads.has(threadId)) events.push({ ...prior.payload, event: "SessionEnd" });
  }
  return { events, threads };
}
