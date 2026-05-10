import { subscribeSession } from "@/lib/session-bus";
import { loadSessionPayload } from "@/lib/session-payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";

  if (!id) {
    return new Response(JSON.stringify({ error: "Session id is required." }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const initial = await loadSessionPayload(id, request.url);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const writeFrame = (frame: string) => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          closed = true;
        }
      };

      const sendEvent = (event: string, data: unknown) => {
        writeFrame(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      if (!initial) {
        sendEvent("session-error", { error: "Session not found." });
        try {
          controller.close();
        } catch {
          // already closed
        }
        return;
      }

      sendEvent("payload", initial);

      const unsubscribe = subscribeSession(id, (payload) => {
        sendEvent("payload", payload);
      });

      const heartbeat = setInterval(() => {
        writeFrame(": keep-alive\n\n");
      }, 25000);

      const cleanup = () => {
        if (closed) {
          return;
        }
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener("abort", cleanup);
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    }
  });
}
