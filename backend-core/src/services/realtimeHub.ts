import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { env, frontendOrigins } from "../config/env.js";
import type { RealtimeEvent } from "../types/api.js";
import { resolveDevelopmentUser, resolveUserFromBearerToken } from "./authService.js";

type AuthenticatedSocket = WebSocket & { userId?: string };

function bearerProtocol(request: IncomingMessage) {
  const protocols = String(request.headers["sec-websocket-protocol"] ?? "")
    .split(",")
    .map((value) => value.trim());
  const protocol = protocols.find((value) => value.startsWith("auth."));
  return protocol ? protocol.slice("auth.".length) : "";
}

function rejectUpgrade(socket: Duplex, status: 401 | 403) {
  const label = status === 401 ? "Unauthorized" : "Forbidden";
  socket.write(`HTTP/1.1 ${status} ${label}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

class RealtimeHub {
  private wss?: WebSocketServer;

  attach(server: Server) {
    this.wss = new WebSocketServer({
      noServer: true,
      handleProtocols: (protocols) => protocols.has("ai-agent-hub") ? "ai-agent-hub" : false
    });
    server.on("upgrade", (request, socket, head) => {
      void this.authorizeUpgrade(request, socket, head);
    });
    this.wss.on("connection", (socket: AuthenticatedSocket) => {
      socket.send(JSON.stringify({ type: "system.ready", payload: { ok: true } }));
    });
  }

  private async authorizeUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (path !== "/ws") return rejectUpgrade(socket, 403);
    const origin = request.headers.origin;
    if (origin && !frontendOrigins.includes(origin)) return rejectUpgrade(socket, 403);
    const token = bearerProtocol(request);
    const user = token
      ? await resolveUserFromBearerToken(token)
      : env.NODE_ENV !== "production" ? await resolveDevelopmentUser() : null;
    if (!user || !this.wss) return rejectUpgrade(socket, 401);
    this.wss.handleUpgrade(request, socket, head, (connectedSocket) => {
      const authenticatedSocket = connectedSocket as AuthenticatedSocket;
      authenticatedSocket.userId = user.id;
      this.wss?.emit("connection", authenticatedSocket, request);
    });
  }

  broadcastToUser(userId: string, event: RealtimeEvent) {
    const message = JSON.stringify(event);
    this.wss?.clients.forEach((client) => {
      const authenticatedClient = client as AuthenticatedSocket;
      if (authenticatedClient.userId === userId && client.readyState === WebSocket.OPEN) client.send(message);
    });
  }
}

export const realtimeHub = new RealtimeHub();
