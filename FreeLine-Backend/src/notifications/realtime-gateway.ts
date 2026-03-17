import { WebSocket } from "ws";

import type { RealtimeEvent, RealtimeGateway } from "./types.js";

export class MessageRealtimeGateway implements RealtimeGateway {
  private readonly connectionsByUserId = new Map<string, Set<WebSocket>>();

  attachConnection(input: { socket: WebSocket; userId: string }): void {
    const connections = this.connectionsByUserId.get(input.userId) ?? new Set<WebSocket>();
    connections.add(input.socket);
    this.connectionsByUserId.set(input.userId, connections);

    input.socket.once("close", () => {
      this.detachConnection(input.userId, input.socket);
    });
    input.socket.once("error", () => {
      this.detachConnection(input.userId, input.socket);
    });

    input.socket.send(JSON.stringify({ type: "realtime:ready" }));
  }

  async publish(event: RealtimeEvent): Promise<void> {
    const connections = this.connectionsByUserId.get(event.userId);
    if (!connections?.size) {
      return;
    }

    const payload = JSON.stringify({
      conversation: event.conversation,
      message: event.message,
      type: event.type
    });

    for (const socket of Array.from(connections)) {
      if (socket.readyState !== WebSocket.OPEN) {
        this.detachConnection(event.userId, socket);
        continue;
      }

      try {
        socket.send(payload);
      } catch {
        this.detachConnection(event.userId, socket);
      }
    }
  }

  private detachConnection(userId: string, socket: WebSocket): void {
    const connections = this.connectionsByUserId.get(userId);
    if (!connections) {
      return;
    }

    connections.delete(socket);

    if (connections.size === 0) {
      this.connectionsByUserId.delete(userId);
    }
  }
}
