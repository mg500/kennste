import { afterEach, describe, expect, it } from "vitest";
import * as eventsRoute from "@/app/api/game/[id]/events/route";
import * as readyRoute from "@/app/api/health/ready/route";
import * as healthRoute from "@/app/api/health/route";
import { createGame } from "./game/store";
import { beginShutdown, resetLifecycle } from "./lifecycle";

afterEach(resetLifecycle);

describe("shutdown", () => {
  it("ends open event streams, so the server can exit right away instead of waiting for them", async () => {
    const { game } = createGame("Max", undefined, null);
    const res = await eventsRoute.GET(new Request(`http://test/api/game/${game.id}/events`), { params: Promise.resolve({ id: game.id }) } as never);
    const reader = res.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"type":"game"');

    beginShutdown();
    expect((await reader.read()).done).toBe(true);
  });

  it("reports not ready any more, but still alive", async () => {
    expect(readyRoute.GET().status).toBe(200);
    beginShutdown();
    const ready = readyRoute.GET();
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({ ready: false });
    expect(healthRoute.GET().status).toBe(200);
  });
});
