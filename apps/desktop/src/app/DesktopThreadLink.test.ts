import { describe, expect, it } from "vite-plus/test";

import {
  parseDesktopThreadLink,
  parseVibeIslandSessionLink,
  threadLinkMenuAction,
} from "./DesktopThreadLink.ts";

describe("desktop thread links", () => {
  it("reads the environment and thread from a thread link", () => {
    expect(parseDesktopThreadLink("t3code://threads/env-1/thread-1", "t3code")).toEqual({
      environmentId: "env-1",
      threadId: "thread-1",
    });
  });

  it("ignores links for another scheme, host, or path shape", () => {
    expect(parseDesktopThreadLink("t3code-dev://threads/env-1/thread-1", "t3code")).toBeNull();
    expect(parseDesktopThreadLink("t3code://app/env-1/thread-1", "t3code")).toBeNull();
    expect(parseDesktopThreadLink("t3code://threads/env-1", "t3code")).toBeNull();
    expect(parseDesktopThreadLink("t3code://threads/env-1/thread-1/extra", "t3code")).toBeNull();
    expect(parseDesktopThreadLink("--inspect", "t3code")).toBeNull();
    expect(parseDesktopThreadLink(undefined, "t3code")).toBeNull();
  });

  it("encodes the route for the renderer", () => {
    expect(threadLinkMenuAction({ environmentId: "env 1", threadId: "thread/1" })).toBe(
      "open-thread:env%201/thread%2F1",
    );
  });

  it("reads the provider session from a Vibe Island link", () => {
    expect(parseVibeIslandSessionLink("t3code://vibe-island?session=abc-1", "t3code")).toBe(
      "abc-1",
    );
    expect(parseVibeIslandSessionLink("t3code://vibe-island?session=codex-01a1-2b", "t3code")).toBe(
      "01a1-2b",
    );
    expect(parseVibeIslandSessionLink("t3code://vibe-island?session=", "t3code")).toBeNull();
    expect(parseVibeIslandSessionLink("t3code://threads/env/thread", "t3code")).toBeNull();
  });
});
