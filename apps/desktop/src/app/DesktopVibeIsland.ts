import type { DesktopVibeIslandEvent } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";

const encodePayload = Schema.encodeEffect(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.String)),
);

export class DesktopVibeIsland extends Context.Service<
  DesktopVibeIsland,
  {
    readonly send: (event: DesktopVibeIslandEvent) => Effect.Effect<void>;
  }
>()("@t3tools/desktop/app/DesktopVibeIsland") {}

const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const fileSystem = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const mutex = yield* Semaphore.make(1);
  const executable = environment.path.join(
    environment.homeDirectory,
    ".vibe-island",
    "bin",
    "vibe-island-bridge",
  );

  const send = Effect.fn("desktop.vibeIsland.send")(function* (event: DesktopVibeIslandEvent) {
    if (environment.platform !== "darwin") return;

    yield* mutex.withPermits(1)(
      Effect.scoped(
        Effect.gen(function* () {
          if (!(yield* fileSystem.exists(executable))) return;

          const payload = {
            hook_event_name: event.event,
            session_id: `${event.environmentId}/${event.threadId}`,
            cwd: event.cwd,
            ...(event.event === "UserPromptSubmit" ? { prompt: event.title } : {}),
            ...(event.event === "Stop" || event.event === "StopFailure"
              ? { last_assistant_message: event.title }
              : {}),
            ...(event.event === "Notification"
              ? { notification_type: "permission_prompt", message: event.title }
              : {}),
          };
          const input = yield* encodePayload(payload);
          const handle = yield* spawner.spawn(
            ChildProcess.make(executable, ["--source", "t3code"], {
              // A remote workspace path is metadata, not a local working directory.
              cwd: environment.homeDirectory,
              env: {
                T3CODE_ENVIRONMENT_ID: event.environmentId,
                T3CODE_THREAD_ID: event.threadId,
              },
              extendEnv: true,
              stdin: Stream.make(`${input}\n`).pipe(Stream.encodeText),
              stdout: "ignore",
              stderr: "ignore",
            }),
          );
          yield* handle.exitCode;
        }),
      ).pipe(Effect.timeout("2 seconds"), Effect.ignore),
    );
  });

  return DesktopVibeIsland.of({ send });
});

export const layer = Layer.effect(DesktopVibeIsland, make);
