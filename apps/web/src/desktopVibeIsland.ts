import type {
  DesktopVibeIslandEvent,
  EnvironmentId,
  OrchestrationProjectShell,
  OrchestrationV2ThreadShell,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

type VibeIslandThread = Pick<
  OrchestrationV2ThreadShell,
  | "id"
  | "projectId"
  | "title"
  | "worktreePath"
  | "archivedAt"
  | "settledAt"
  | "activeProviderThreadId"
  | "latestRunId"
  | "latestRunCompletedAt"
  | "activityRunStatus"
  | "status"
> & {
  readonly lineage: Pick<OrchestrationV2ThreadShell["lineage"], "relationshipToParent">;
  readonly pendingRuntimeRequest: Pick<
    NonNullable<OrchestrationV2ThreadShell["pendingRuntimeRequest"]>,
    "id"
  > | null;
};

export interface DesktopVibeIslandThreadState {
  readonly payload: DesktopVibeIslandEvent;
  readonly runId: VibeIslandThread["latestRunId"];
  readonly raw: VibeIslandThread;
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
    if (thread.archivedAt !== null || thread.lineage.relationshipToParent === "subagent") continue;
    const prior = previous.get(thread.id);
    if (prior?.raw === thread) {
      threads.set(thread.id, prior);
      continue;
    }
    const awaitingInput = thread.pendingRuntimeRequest !== null;
    const liveSession = thread.activeProviderThreadId !== null && thread.settledAt === null;
    const running =
      thread.activityRunStatus != null ||
      ["preparing", "queued", "starting", "running", "waiting"].includes(thread.status);
    const completedAt = thread.latestRunCompletedAt
      ? DateTime.toEpochMillis(thread.latestRunCompletedAt)
      : Number.NaN;
    const recentlyCompleted = completedAt <= nowMs && nowMs - completedAt <= 5 * 60_000;
    const selected = thread.id === selectedThreadId && thread.latestRunId !== null;
    if (!prior && !liveSession && !running && !awaitingInput && !recentlyCompleted && !selected)
      continue;
    const cwd = thread.worktreePath ?? workspaceRoots.get(thread.projectId);
    if (!cwd) continue;
    const event = awaitingInput
      ? "Notification"
      : thread.status === "failed"
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
    const runId = thread.latestRunId;
    if (!prior) events.push({ ...payload, event: "SessionStart" });
    if (!prior || prior.runId !== runId || prior.payload.event !== event) events.push(payload);
    threads.set(thread.id, { payload, runId, raw: thread });
  }
  for (const [threadId, prior] of previous) {
    if (!threads.has(threadId)) events.push({ ...prior.payload, event: "SessionEnd" });
  }
  return { events, threads };
}
