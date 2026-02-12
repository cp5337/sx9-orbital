// SSE and WebSocket streaming managers

import type { Response } from "express"
import { WebSocket } from "ws"
import { logger } from "./logger.js"
import type { WebSocketMessage } from "./types.js"

// SSE connection manager
export class SSEManager {
  private connections = new Set<Response>()

  addConnection(res: Response): void {
    this.connections.add(res)
    logger.info({ total: this.connections.size }, "SSE client connected")

    res.on("close", () => {
      this.connections.delete(res)
      logger.info({ total: this.connections.size }, "SSE client disconnected")
    })
  }

  broadcast(event: string, data: any): void {
    const payload = JSON.stringify(data)

    for (const connection of this.connections) {
      try {
        connection.write(`event: ${event}\n`)
        connection.write(`data: ${payload}\n\n`)
      } catch (error: any) {
        logger.warn({ error: error.message }, "Failed to send SSE message")
        this.connections.delete(connection)
      }
    }
  }

  sendHeartbeat(): void {
    this.broadcast("heartbeat", { timestamp: new Date().toISOString() })
  }

  getConnectionCount(): number {
    return this.connections.size
  }
}

// WebSocket connection manager
export class WebSocketManager {
  private connections = new Map<WebSocket, Set<string>>()

  addConnection(ws: WebSocket): void {
    this.connections.set(ws, new Set())
    logger.info({ total: this.connections.size }, "WebSocket client connected")

    ws.on("close", () => {
      this.connections.delete(ws)
      logger.info({ total: this.connections.size }, "WebSocket client disconnected")
    })

    ws.on("message", (message: string) => {
      try {
        const data: WebSocketMessage = JSON.parse(message.toString())
        this.handleMessage(ws, data)
      } catch (error: any) {
        logger.warn({ error: error.message }, "Failed to parse WebSocket message")
        this.sendError(ws, "Invalid message format")
      }
    })
  }

  private handleMessage(ws: WebSocket, message: WebSocketMessage): void {
    const channels = this.connections.get(ws)
    if (!channels) return

    switch (message.type) {
      case "subscribe":
        if (message.channels) {
          message.channels.forEach((ch) => channels.add(ch))
          logger.info({ channels: message.channels }, "Client subscribed to channels")
        }
        break

      case "unsubscribe":
        if (message.channels) {
          message.channels.forEach((ch) => channels.delete(ch))
          logger.info({ channels: message.channels }, "Client unsubscribed from channels")
        }
        break

      default:
        logger.warn({ type: message.type }, "Unknown message type")
    }
  }

  broadcast(type: string, data: any, channel?: string): void {
    const message: WebSocketMessage = { type, data } as any
    const payload = JSON.stringify(message)

    for (const [ws, channels] of this.connections) {
      // If channel specified, only send to subscribed clients
      if (channel && !channels.has(channel)) continue

      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload)
        }
      } catch (error: any) {
        logger.warn({ error: error.message }, "Failed to send WebSocket message")
      }
    }
  }

  sendError(ws: WebSocket, message: string): void {
    try {
      ws.send(JSON.stringify({ type: "error", message }))
    } catch (error: any) {
      logger.warn({ error: error.message }, "Failed to send error message")
    }
  }

  getConnectionCount(): number {
    return this.connections.size
  }
}
