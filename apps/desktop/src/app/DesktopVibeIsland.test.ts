import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { DesktopVibeIslandEvent, EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import * as DesktopConfig from "./DesktopConfig.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopVibeIsland from "./DesktopVibeIsland.ts";
import { sendVibeIslandEvent } from "../ipc/methods/vibeIsland.ts";

const event = (kind: DesktopVibeIslandEvent["event"]): DesktopVibeIslandEvent => ({
  environmentId: EnvironmentId.make("remote-environment"),
  threadId: ThreadId.make("thread-remote"),
  cwd: "/remote/workspace/only-on-server",
  title: "Test depuis le serveur",
  event: kind,
});

const makeLayer = (homeDirectory: string, platform: NodeJS.Platform = "darwin") =>
  DesktopVibeIsland.layer.pipe(
    Layer.provide(
      DesktopEnvironment.layer({
        dirname: `${homeDirectory}/apps/desktop/dist-electron`,
        homeDirectory,
        platform,
        processArch: "arm64",
        appVersion: "0.0.44",
        appPath: homeDirectory,
        isPackaged: false,
        resourcesPath: homeDirectory,
        runningUnderArm64Translation: false,
      }).pipe(Layer.provide(DesktopConfig.layerTest({}))),
    ),
  );

const recording = Schema.fromJsonString(
  Schema.Struct({
    args: Schema.Array(Schema.String),
    cwd: Schema.String,
    environmentId: Schema.String,
    threadId: Schema.String,
    payload: Schema.Record(Schema.String, Schema.String),
  }),
);

const installFixture = Effect.fnUntraced(function* (homeDirectory: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const binDirectory = path.join(homeDirectory, ".vibe-island", "bin");
  const executable = path.join(binDirectory, "vibe-island-bridge");
  yield* fileSystem.makeDirectory(binDirectory, { recursive: true });
  yield* fileSystem.writeFileString(
    executable,
    `#!${process.execPath}
const fs = require("node:fs");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync("events.ndjson", JSON.stringify({
    args: process.argv.slice(2),
    cwd: process.cwd(),
    environmentId: process.env.T3CODE_ENVIRONMENT_ID,
    threadId: process.env.T3CODE_THREAD_ID,
    payload: JSON.parse(input),
  }) + "\\n");
});
`,
  );
  yield* fileSystem.chmod(executable, 0o755);
});

describe("DesktopVibeIsland", () => {
  it.effect("sends remote thread events through the local executable in order", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const homeDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-vibe-island-",
      });
      yield* installFixture(homeDirectory);
      const events = [
        event("SessionStart"),
        event("UserPromptSubmit"),
        event("Stop"),
        event("Notification"),
        event("StopFailure"),
        event("SessionEnd"),
      ];

      yield* Effect.gen(function* () {
        const vibeIsland = yield* DesktopVibeIsland.DesktopVibeIsland;
        yield* Effect.forEach(events, vibeIsland.send, { concurrency: "unbounded" });
      }).pipe(Effect.provide(makeLayer(homeDirectory)));

      const output = yield* fileSystem.readFileString(path.join(homeDirectory, "events.ndjson"));
      const records = yield* Effect.forEach(output.trim().split("\n"), (line) =>
        Schema.decodeEffect(recording)(line),
      );
      const canonicalHomeDirectory = yield* fileSystem.realPath(homeDirectory);
      assert.deepEqual(
        records.map(({ payload }) => payload.hook_event_name),
        events.map(({ event }) => event),
      );
      for (const record of records) {
        assert.deepEqual(record.args, ["--source", "t3code"]);
        assert.equal(record.cwd, canonicalHomeDirectory);
        assert.equal(record.environmentId, events[0]?.environmentId);
        assert.equal(record.threadId, events[0]?.threadId);
        assert.equal(record.payload.session_id, "remote-environment/thread-remote");
        assert.equal(record.payload.cwd, "/remote/workspace/only-on-server");
      }
      assert.deepEqual(records[0]?.payload, {
        hook_event_name: "SessionStart",
        session_id: "remote-environment/thread-remote",
        cwd: "/remote/workspace/only-on-server",
      });
      assert.equal(records[1]?.payload.prompt, "Test depuis le serveur");
      assert.equal(records[2]?.payload.last_assistant_message, "Test depuis le serveur");
      assert.equal(records[3]?.payload.notification_type, "permission_prompt");
      assert.equal(records[3]?.payload.message, "Test depuis le serveur");
      assert.equal(records[4]?.payload.last_assistant_message, "Test depuis le serveur");
      assert.isFalse(yield* fileSystem.exists(event("Stop").cwd));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("does nothing when Vibe Island is absent or the platform is not macOS", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const homeDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-vibe-island-",
      });
      const send = DesktopVibeIsland.DesktopVibeIsland.pipe(
        Effect.flatMap((vibeIsland) => vibeIsland.send(event("UserPromptSubmit"))),
      );
      yield* send.pipe(Effect.provide(makeLayer(homeDirectory)));
      assert.isFalse(yield* fileSystem.exists(path.join(homeDirectory, ".vibe-island")));

      yield* installFixture(homeDirectory);
      yield* send.pipe(Effect.provide(makeLayer(homeDirectory, "linux")));
      assert.isFalse(yield* fileSystem.exists(path.join(homeDirectory, "events.ndjson")));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects unsupported events before invoking the local helper", () =>
    Effect.gen(function* () {
      let calls = 0;
      const result = yield* Effect.exit(
        sendVibeIslandEvent.handler({ ...event("Stop"), event: "exec" }),
      ).pipe(
        Effect.provideService(DesktopVibeIsland.DesktopVibeIsland, {
          send: () =>
            Effect.sync(() => {
              calls++;
            }),
        }),
      );
      assert.isTrue(Exit.isFailure(result));
      assert.equal(calls, 0);
    }),
  );

  it.effect("releases the event queue when the helper does not finish", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const delegate = yield* ChildProcessSpawner.ChildProcessSpawner;
      const started = yield* Deferred.make<void>();
      const homeDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-vibe-island-",
      });
      yield* installFixture(homeDirectory);
      let calls = 0;
      const spawner = ChildProcessSpawner.make((command) =>
        Effect.gen(function* () {
          const handle = yield* delegate.spawn(command);
          calls++;
          if (calls !== 1) return handle;
          yield* Deferred.succeed(started, undefined);
          return ChildProcessSpawner.makeHandle({ ...handle, exitCode: Effect.never });
        }),
      );

      yield* Effect.gen(function* () {
        const vibeIsland = yield* DesktopVibeIsland.DesktopVibeIsland;
        const first = yield* vibeIsland.send(event("SessionStart")).pipe(Effect.forkChild);
        yield* Deferred.await(started);
        const next = yield* vibeIsland.send(event("Stop")).pipe(Effect.forkChild);
        yield* TestClock.adjust("2 seconds");
        yield* Fiber.join(first);
        yield* Fiber.join(next);
        assert.equal(calls, 2);
      }).pipe(
        Effect.provide(makeLayer(homeDirectory)),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
