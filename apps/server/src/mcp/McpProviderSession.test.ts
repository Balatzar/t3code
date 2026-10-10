import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { withAgentDeviceEnvironment, withThreadEnvironment } from "./McpProviderSession.ts";

describe("device CLI environment", () => {
  it("preserves provider credentials and commands while routing devices to the owned daemon", () => {
    const environment = withAgentDeviceEnvironment(
      { PATH: "/provider/bin:/usr/bin", PROVIDER_KEY: "fixture" },
      {
        agentDeviceEnvironment: {
          PATH: "/t3/device/bin",
          PATH_SEPARATOR: ":",
          AGENT_DEVICE_DAEMON_BASE_URL: "http://127.0.0.1:9000",
          AGENT_DEVICE_DAEMON_AUTH_TOKEN: "fixture-device",
        },
      },
    );
    expect(environment).toEqual({
      PATH: "/t3/device/bin:/provider/bin:/usr/bin",
      PROVIDER_KEY: "fixture",
      AGENT_DEVICE_DAEMON_BASE_URL: "http://127.0.0.1:9000",
      AGENT_DEVICE_DAEMON_AUTH_TOKEN: "fixture-device",
    });
  });

  it("does not grant CLI access when device access was not supplied", () => {
    const environment = { PATH: "/usr/bin", PROVIDER_KEY: "fixture" };
    expect(withAgentDeviceEnvironment(environment, undefined)).toBe(environment);
    expect(withAgentDeviceEnvironment(environment, {})).toBe(environment);
  });
});

describe("thread environment", () => {
  it("names the environment and thread the provider process serves", () => {
    const environment = withThreadEnvironment(
      { PATH: "/usr/bin" },
      { environmentId: EnvironmentId.make("env-1"), threadId: ThreadId.make("thread-1") },
    );
    expect(environment).toEqual({
      PATH: "/usr/bin",
      T3CODE_ENVIRONMENT_ID: "env-1",
      T3CODE_THREAD_ID: "thread-1",
    });
  });

  it("leaves the environment untouched without a session", () => {
    const environment = { PATH: "/usr/bin" };
    expect(withThreadEnvironment(environment, undefined)).toBe(environment);
  });
});
