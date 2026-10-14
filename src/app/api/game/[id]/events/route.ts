import { NextResponse } from "next/server";
import { getGame, subscribe } from "@/lib/game/store";

const HEARTBEAT_MS = 25_000;

/** Server-sent event stream of game and playback updates (see GameEvent). */
export async function GET(req: Request, ctx: RouteContext<"/api/game/[id]/events">) {
  const { id } = await ctx.params;
  if (!getGame(id)) return NextResponse.json({ error: "Spiel nicht gefunden" }, { status: 404 });

  const screen = new URL(req.url).searchParams.get("role") === "screen";
  const encoder = new TextEncoder();
  let close = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe: (() => void) | null = null;
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
        try { controller.close(); } catch {}
      };
      unsubscribe = subscribe(id, event => {
        send(`data: ${JSON.stringify(event)}\n\n`);
        if (event.type === "deleted") close();
      }, { screen });
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
