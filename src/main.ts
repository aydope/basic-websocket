import { WebSocketServer as WebSocketServer, WebSocket } from "ws";

const ws = new WebSocketServer({ port: 3000 });

ws.on("connection", (socket, request) => {
  const ip = request.socket.remoteAddress;

  socket.on("message", (rawData) => {
    const message = rawData.toString();
    console.log({ rawData });

    ws.clients.forEach((client) => {
      if (client !== socket && client.readyState === WebSocket.OPEN) {
        client.send(`[BROADCAST/${ip}]: ${message}`);
      }
    });
  });

  socket.on("error", (err) => {
    console.error(`[ERROR/${ip}]: ${err.message}`);
  });

  socket.on("close", (code, reason) => {
    console.log(`[CLOSE/${ip}]: ${code} ${reason}`);
  });
});

console.log("WebSocket server is live on ws://localhost:3000");
