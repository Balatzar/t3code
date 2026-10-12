import { useAtomValue } from "@effect/atom-react";
import { useParams } from "@tanstack/react-router";
import type { DesktopVibeIslandEvent, EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { useCallback, useEffect, useRef } from "react";

import { isDesktopLocalConnectionTarget } from "../../connection/desktopLocal";
import {
  reconcileDesktopVibeIslandThreads,
  type DesktopVibeIslandThreadState,
} from "../../desktopVibeIsland";
import { useEnvironments } from "../../state/environments";
import { environmentShell } from "../../state/shell";

export function DesktopVibeIslandCoordinator() {
  const { environments } = useEnvironments();
  const send = window.desktopBridge?.sendVibeIslandEvent;
  if (!send) return null;
  return environments
    .filter(
      ({ entry }) =>
        entry.target._tag !== "PrimaryConnectionTarget" &&
        !isDesktopLocalConnectionTarget(entry.target),
    )
    .map(({ environmentId }) => (
      <EnvironmentVibeIsland key={environmentId} environmentId={environmentId} send={send} />
    ));
}

function EnvironmentVibeIsland({
  environmentId,
  send,
}: {
  environmentId: EnvironmentId;
  send: (event: DesktopVibeIslandEvent) => Promise<void>;
}) {
  const shell = useAtomValue(environmentShell.stateValueAtom(environmentId));
  const { environmentId: selectedEnvironmentId, threadId: selectedThreadId } = useParams({
    strict: false,
  });
  const previous = useRef(new Map<ThreadId, DesktopVibeIslandThreadState>());
  const queue = useRef(Promise.resolve());
  const deliver = useCallback(
    (events: readonly DesktopVibeIslandEvent[]) => {
      for (const event of events) {
        queue.current = queue.current.then(() => send(event)).catch(() => undefined);
      }
    },
    [send],
  );

  useEffect(() => {
    if (
      shell.status === "synchronizing" ||
      (shell.status === "live" && Option.isNone(shell.snapshot))
    )
      return;
    const snapshot = shell.status === "live" ? Option.getOrNull(shell.snapshot) : null;
    const next = reconcileDesktopVibeIslandThreads(
      environmentId,
      snapshot?.projects ?? [],
      snapshot?.threads ?? [],
      previous.current,
      Date.now(),
      selectedEnvironmentId === environmentId ? selectedThreadId : undefined,
    );
    previous.current = next.threads;
    deliver(next.events);
  }, [environmentId, shell, deliver, selectedEnvironmentId, selectedThreadId]);

  useEffect(
    () => () => {
      deliver(
        [...previous.current.values()].map(({ payload }) => ({ ...payload, event: "SessionEnd" })),
      );
      previous.current.clear();
    },
    [deliver],
  );

  return null;
}
