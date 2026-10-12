import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  primaryIncluded: false,
  primaryPhase: "connecting",
  remotePhase: "connecting",
  remoteConfig: false,
  pending: [] as string[],
  listener: undefined as ((url: string) => void) | undefined,
  navigate: vi.fn(async () => undefined),
}));
const webLinks = {
  onOpen: (listener: (url: string) => void) => {
    state.listener = listener;
    return () => {
      state.listener = undefined;
    };
  },
  setReady: vi.fn(async (ready: boolean) => {
    if (ready) for (const url of state.pending.splice(0)) state.listener?.(url);
  }),
};

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: state.navigate, state: { matches: [] } }),
}));
vi.mock("../../state/environments", () => ({
  usePrimaryEnvironment: () =>
    state.primaryIncluded
      ? {
          environmentId: "local-fixture",
          connection: { phase: state.primaryPhase },
          serverConfig: {},
        }
      : null,
  useEnvironments: () => ({
    environments: [
      {
        environmentId: "remote-fixture",
        connection: { phase: state.remotePhase },
        serverConfig: state.remoteConfig ? {} : null,
      },
    ],
  }),
  useEnvironmentHttpBaseUrl: () => null,
}));
vi.mock("../../hooks/useScratchProject", () => ({
  useScratchProject: () => ({ scratchEnvironmentId: vi.fn(), openScratchProject: vi.fn() }),
}));
vi.mock("../../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => vi.fn() }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../../state/use-atom-query-runner", () => ({ useAtomQueryRunner: () => vi.fn() }));
vi.mock("../../state/assets", () => ({ assetEnvironment: { createUrl: {} } }));
vi.mock("../../state/preview", () => ({ previewEnvironment: { open: {} } }));
vi.mock("../../browser/openFileInPreview", () => ({
  openFileInPreview: vi.fn(),
  openUrlInPreview: vi.fn(),
}));
vi.mock("../../browser/previewRuntime", () => ({ isPreviewAvailableFor: vi.fn() }));
vi.mock("../../composerDraftStore", () => ({ useComposerDraftStore: { getState: vi.fn() } }));
vi.mock("../../rightPanelStore", () => ({
  selectActiveRightPanelSurface: vi.fn(),
  useRightPanelStore: { getState: vi.fn() },
}));
vi.mock("../../threadRoutes", () => ({ resolveThreadRouteTarget: vi.fn() }));
vi.mock("../ui/toast", () => ({ stackedThreadToast: vi.fn(), toastManager: { add: vi.fn() } }));

import { DesktopWebLinkCoordinator } from "./DesktopWebLinkCoordinator";

let renderer: ReactTestRenderer | undefined;
async function render() {
  await act(() => {
    if (renderer) renderer.update(<DesktopWebLinkCoordinator />);
    else renderer = create(<DesktopWebLinkCoordinator />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    primaryIncluded: false,
    primaryPhase: "connecting",
    remotePhase: "connecting",
    remoteConfig: false,
    pending: ["t3code://threads/remote-fixture/thread-fixture"],
    listener: undefined,
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { desktopBridge: { webLinks } });
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

it("opens the queued remote thread once a remote is usable with the local environment disabled", async () => {
  await render();
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.pending).toHaveLength(1);
  state.remotePhase = "connected";
  await render();
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.pending).toHaveLength(1);
  state.remoteConfig = true;
  await render();
  expect(state.navigate).toHaveBeenCalledExactlyOnceWith({
    href: "/remote-fixture/thread-fixture",
  });
  expect(state.pending).toEqual([]);
  await render();
  expect(state.navigate).toHaveBeenCalledTimes(1);
});

it("keeps the existing local startup readiness when a primary environment is enabled", async () => {
  state.primaryIncluded = true;
  state.remotePhase = "connected";
  state.remoteConfig = true;
  await render();
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.pending).toHaveLength(1);
  state.primaryPhase = "connected";
  await render();
  expect(state.navigate).toHaveBeenCalledExactlyOnceWith({
    href: "/remote-fixture/thread-fixture",
  });
  expect(state.pending).toEqual([]);
});
