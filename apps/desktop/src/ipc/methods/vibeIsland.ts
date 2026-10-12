import { DesktopVibeIslandEvent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopVibeIsland from "../../app/DesktopVibeIsland.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

export const sendVibeIslandEvent = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.SEND_VIBE_ISLAND_EVENT_CHANNEL,
  payload: DesktopVibeIslandEvent,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.vibeIsland.send")(function* (event) {
    const vibeIsland = yield* DesktopVibeIsland.DesktopVibeIsland;
    yield* vibeIsland.send(event);
  }),
});
