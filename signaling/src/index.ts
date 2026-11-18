import { Room } from "./room";

// Durable Object classes must be reachable from the Worker's exports; the
// entry point itself has to be a default export because Wrangler maps
// `main` to the Worker's default handler.
export { Room };

const ROOM_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CLIENT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const CLIENT_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

function turnEnabled(value: string): boolean {
  return value === "true";
}

function isAllowedOrigin(origin: string | null, configured: string | undefined): boolean {
  if (!origin || !configured) return false;
  let candidate: string;
  try {
    candidate = new URL(origin).origin;
  } catch {
    return false;
  }
  for (const entry of configured.split(",")) {
    const value = entry.trim();
    if (!value) continue;
    try {
      if (new URL(value).origin === candidate) return true;
    } catch {
      // Ignore malformed allowlist entries rather than widening access.
    }
  }
  return false;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json(
        { status: "ok", service: "holo-signaling", turnEnabled: turnEnabled(env.TURN_ENABLED) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (url.pathname !== "/ws") {
      return Response.json({ error: "not-found" }, { status: 404 });
    }
    if (request.method !== "GET") {
      return new Response("method not allowed", { status: 405 });
    }

    if (!isAllowedOrigin(request.headers.get("Origin"), env.ORIGINS)) {
      return Response.json({ error: "origin-not-allowed" }, { status: 403 });
    }

    const upgrade = request.headers.get("Upgrade");
    if (upgrade?.toLowerCase() !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    const roomId = url.searchParams.get("roomId") ?? "";
    const clientId = url.searchParams.get("clientId") ?? "";
    const token = url.searchParams.get("token") ?? "";
    if (!ROOM_ID.test(roomId) || !CLIENT_ID.test(clientId) || !CLIENT_TOKEN.test(token)) {
      return Response.json({ error: "bad-request" }, { status: 400 });
    }

    const stub = env.ROOMS.getByName(`room:${roomId}`);
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;
