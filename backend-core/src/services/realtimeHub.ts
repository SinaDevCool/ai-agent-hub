import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import type { RealtimeEvent } from "../types/api.js";

class RealtimeHub {
  private wss?: WebSocketServer;

  attach(server: Server) {
    this.wss = new WebSocketServer({ server, path: "/ws" });
    this.wss.on("connection", (socket) => {
      socket.send(JSON.stringify({ type: "system.ready", payload: { ok: true } }));
    });
  }

  broadcast(event: RealtimeEvent) {
    const message = JSON.stringify(event);
    this.wss?.clients.forEach((client) => {
      if (client.readyState === client.OPEN) client.send(message);
    });
  }
}

export const realtimeHub = new RealtimeHub();
