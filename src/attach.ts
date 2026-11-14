import { WebSocket, WebSocketServer } from "ws";
import { Server } from "http";
import { nanoid } from "nanoid";

interface PayloadData {
  text: string;
  roomId?: string;
}

function sendJson(socket: WebSocket, payload: Record<string, unknown>): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function broadcast(
  ws: WebSocketServer,
  payload: Record<string, unknown>,
): void {
  const message = JSON.stringify(payload);
  for (const client of ws.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    client.send(message);
  }
}

export function attachWebSocketServe(server: Server, path: string) {
  const ws = new WebSocketServer({ server, path, maxPayload: 1024 * 1024 });

  ws.on("connection", (socket) => {
    sendJson(socket, { type: "welcome" });
  });

  ws.on("error", console.error);

  function broadcastWithType(type: string, payload: PayloadData) {
    const rawPayload: Record<string, unknown> = {
      type,
      id: nanoid(16),
      payload: {
        text: payload.text,
        room: payload.roomId ?? "public",
      },
      metadata: {
        sentAt: new Date().toISOString(),
      },
    };

    broadcast(ws, { ...rawPayload });
  }

  return { broadcastWithType };
}
