import * as Option from "effect/Option";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  status: "live",
  snapshotAvailable: true,
  completed: false,
  remoteIncluded: true,
  send: vi.fn(async () => undefined),
}));

vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => ({
    status: state.status,
    snapshot: state.snapshotAvailable
      ? Option.some({
          projects: [{ id: "project-1", workspaceRoot: "/remote/project" }],
          threads: [
            {
              id: "thread-1",
              projectId: "project-1",
              title: "Remote test",
              worktreePath: null,
              archivedAt: null,
              hasPendingApprovals: false,
              hasPendingUserInput: false,
              session: { status: "running" },
              latestTurn: {
                turnId: "turn-1",
                state: state.completed ? "completed" : "running",
                completedAt: null,
              },
            },
          ],
        })
      : Option.none(),
  }),
}));
vi.mock("@tanstack/react-router", () => ({ useParams: () => ({}) }));
vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({
    environments: [
      { environmentId: "primary", entry: { target: { _tag: "PrimaryConnectionTarget" } } },
      {
        environmentId: "local-wsl",
        entry: { target: { _tag: "BearerConnectionTarget", connectionId: "local:wsl:ubuntu" } },
      },
      ...(state.remoteIncluded
        ? [
            {
              environmentId: "remote-server",
              entry: { target: { _tag: "SshConnectionTarget", connectionId: "remote" } },
            },
          ]
        : []),
    ],
  }),
}));
vi.mock("../../state/shell", () => ({ environmentShell: { stateValueAtom: vi.fn() } }));

import { DesktopVibeIslandCoordinator } from "./DesktopVibeIslandCoordinator";

let renderer: ReactTestRenderer | undefined;
async function render() {
  await act(() => {
    if (renderer) renderer.update(<DesktopVibeIslandCoordinator />);
    else renderer = create(<DesktopVibeIslandCoordinator />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    status: "live",
    snapshotAvailable: true,
    completed: false,
    remoteIncluded: true,
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { desktopBridge: { sendVibeIslandEvent: state.send } });
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

it("forwards remote lifecycle changes to the local desktop and excludes local provider sessions", async () => {
  await render();
  expect(state.send.mock.calls).toEqual([
    [
      {
        environmentId: "remote-server",
        threadId: "thread-1",
        cwd: "/remote/project",
        title: "Remote test",
        event: "SessionStart",
      },
    ],
    [
      {
        environmentId: "remote-server",
        threadId: "thread-1",
        cwd: "/remote/project",
        title: "Remote test",
        event: "UserPromptSubmit",
      },
    ],
  ]);
  await render();
  expect(state.send).toHaveBeenCalledTimes(2);
  state.completed = true;
  await render();
  expect(state.send).toHaveBeenLastCalledWith(expect.objectContaining({ event: "Stop" }));
  state.status = "cached";
  await render();
  expect(state.send).toHaveBeenLastCalledWith(expect.objectContaining({ event: "SessionEnd" }));
});

it("preserves cards while a foreground resubscription hydrates the snapshot", async () => {
  await render();
  expect(state.send).toHaveBeenCalledTimes(2);
  state.status = "synchronizing";
  state.snapshotAvailable = false;
  await render();
  expect(state.send).toHaveBeenCalledTimes(2);
  state.status = "live";
  await render();
  expect(state.send).toHaveBeenCalledTimes(2);
  state.snapshotAvailable = true;
  await render();
  expect(state.send).toHaveBeenCalledTimes(2);
});

it("ends remote cards when an environment is removed", async () => {
  await render();
  state.remoteIncluded = false;
  await render();
  expect(state.send).toHaveBeenLastCalledWith(
    expect.objectContaining({ environmentId: "remote-server", event: "SessionEnd" }),
  );
});

it("leaves browsers and older desktop versions without the bridge unaffected", async () => {
  vi.stubGlobal("window", {});
  await render();
  expect(state.send).not.toHaveBeenCalled();
});
