import { NextResponse } from "next/server";
import { getGame, resolvePlayer, subscribe } from "@/lib/game/store";
import { onShutdown } from "@/lib/lifecycle";

const HEARTBEAT_MS = 25_000;

/**
 * Server-sent event stream of game and playback updates (see GameEvent), as the player with `?token=` may see them
 * (EventSource can't send headers); without a valid token as a spectator.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/game/[id]/events">) {
  const { id } = await ctx.params;
  if (!getGame(id)) return NextResponse.json({ error: "Spiel nicht gefunden" }, { status: 404 });

  const params = new URL(req.url).searchParams;
  const screen = params.get("role") === "screen";
  const viewer = resolvePlayer(id, params.get("token"));
  const encoder = new TextEncoder();
  let close = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe: (() => void) | null = null;
      let stopOnShutdown = () => {};
      const send = (chunk: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(chunk)); } catch { close(); }
      };
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe?.();
        stopOnShutdown();
        try { controller.close(); } catch {}
      };
      // On shutdown the stream ends; the browser reconnects on its own
      stopOnShutdown = onShutdown(() => close());
      unsubscribe = subscribe(id, event => {
        send(`data: ${JSON.stringify(event)}\n\n`);
        if (event.type === "deleted") close();
      }, { screen, viewer });
      if (!unsubscribe) close();
      req.signal.addEventListener("abort", () => close());
    },
    cancel() {
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      // no-transform keeps compression middleware from buffering the stream
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
