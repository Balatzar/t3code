// @effect-diagnostics nodeBuiltinImport:off - The suite verifies the integration template installed into Vibe Island.
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import {
  parseDesktopThreadLink,
  parseVibeIslandSessionLink,
  threadLinkUrl,
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
    expect(parseDesktopThreadLink("t3code://threads/env-1/%ZZ", "t3code")).toBeNull();
    expect(parseDesktopThreadLink("t3code://vibe-island?thread=env-1", "t3code")).toBeNull();
    expect(
      parseDesktopThreadLink("t3code://vibe-island?thread=env-1%2Fthread-1%2Fextra", "t3code"),
    ).toBeNull();
    expect(parseDesktopThreadLink("--inspect", "t3code")).toBeNull();
    expect(parseDesktopThreadLink(undefined, "t3code")).toBeNull();
  });

  it("encodes the route for the renderer", () => {
    expect(threadLinkUrl({ environmentId: "env 1", threadId: "thread/1" }, "t3code")).toBe(
      "t3code://threads/env%201/thread%2F1",
    );
  });

  it("opens the remote T3 thread carried by a custom Vibe Island card", () => {
    const thread = "env-remote/thread-remote";
    expect(
      parseDesktopThreadLink(`t3code://vibe-island?thread=${encodeURIComponent(thread)}`, "t3code"),
    ).toEqual({
      environmentId: "env-remote",
      threadId: "thread-remote",
    });
  });

  it("the installed Vibe Island rule carries a custom thread without a database lookup", () => {
    const integration: { jumpRule: { template: string } } = JSON.parse(
      NodeFS.readFileSync(new URL("../../../../assets/vibe/t3code.json", import.meta.url), "utf8"),
    );
    const thread = "env-remote/thread-remote";
    const url = integration.jumpRule.template
      .replaceAll("{session_id}", encodeURIComponent(`t3code-${thread}`))
      .replaceAll("{raw_session_id}", encodeURIComponent(thread));
    expect(parseDesktopThreadLink(url, "t3code")).toEqual({
      environmentId: "env-remote",
      threadId: "thread-remote",
    });
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

  it.each([
    ["claude", "provider-session-1"],
    ["codex", "codex-provider-session-1"],
  ])("the installed Vibe Island rule opens a built-in %s session", (_provider, sessionId) => {
    const integration: { jumpRule: { template: string } } = JSON.parse(
      NodeFS.readFileSync(new URL("../../../../assets/vibe/t3code.json", import.meta.url), "utf8"),
    );
    // Vibe Island only supplies raw_session_id for custom agents.
    const url = integration.jumpRule.template
      .replaceAll("{session_id}", sessionId)
      .replaceAll("{raw_session_id}", "");
    expect(parseVibeIslandSessionLink(url, "t3code")).toBe("provider-session-1");
  });
});
