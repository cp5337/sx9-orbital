// Main server entry point

import express, { type Request, type Response } from "express"
import cors from "cors"
import compression from "compression"
import rateLimit from "express-rate-limit"
import { WebSocketServer } from "ws"
import { createServer } from "http"
import { config } from "./config.js"
import { logger } from "./logger.js"
import { cache } from "./cache.js"
import { DataAggregator } from "./data-aggregator.js"
import { SSEManager, WebSocketManager } from "./streaming.js"
import { normalizeWazuhAlert } from "./normalizers.js"
import { postWithRetry } from "./http-client.js"
import { register, sseConnections, wsConnections, broadcastEvents } from "./metrics.js"
import type { HealthResponse, WazuhAlert, ToolDeployRequest } from "./types.js"

const app = express()
const server = createServer(app)

// Middleware
app.use(
  cors({
    origin: config.cors.origins,
    credentials: true,
  }),
)
app.use(compression())
app.use(express.json())

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: "Too many requests, please try again later",
})
app.use("/api/", limiter)

// Initialize managers
const dataAggregator = new DataAggregator()
const sseManager = new SSEManager()
const wsManager = new WebSocketManager()

// WebSocket server
const wss = new WebSocketServer({ server, path: "/ws" })

wss.on("connection", (ws) => {
  wsManager.addConnection(ws)
  wsConnections.set(wsManager.getConnectionCount())
})

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  const health: HealthResponse = {
    status: "healthy",
    uptime: process.uptime(),
    connections: {
      sse: sseManager.getConnectionCount(),
      ws: wsManager.getConnectionCount(),
    },
    services: {
      wazuh: "unknown",
      axon: "unknown",
      legion: "unknown",
      surrealdb: "unknown",
    },
  }

  res.json(health)
})

// Prometheus metrics endpoint
app.get("/metrics", async (req: Request, res: Response) => {
  res.set("Content-Type", register.contentType)
  res.end(await register.metrics())
})

// SSE streaming endpoint
app.get("/stream", (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  })

  sseManager.addConnection(res)
  sseConnections.set(sseManager.getConnectionCount())

  // Send initial connection message
  res.write(`event: connected\n`)
  res.write(`data: {"message":"Connected to PLASMA streaming service"}\n\n`)
})

// REST API endpoints
app.get("/api/threats", async (req: Request, res: Response) => {
  const threats = await dataAggregator.fetchThreats()
  res.json(threats)
})

app.get("/api/threats/:id", async (req: Request, res: Response) => {
  const threats = await dataAggregator.fetchThreats()
  const threat = threats.find((t) => t.id === req.params.id)

  if (threat) {
    res.json(threat)
  } else {
    res.status(404).json({ error: "Threat not found" })
  }
})

app.get("/api/tools", async (req: Request, res: Response) => {
  const tools = await dataAggregator.fetchTools()
  res.json(tools)
})

app.get("/api/entities", async (req: Request, res: Response) => {
  const entities = await dataAggregator.fetchEntities()
  res.json(entities)
})

app.get("/api/metrics", async (req: Request, res: Response) => {
  const metrics = await dataAggregator.fetchMetrics()
  res.json(metrics)
})

app.post("/api/tools/deploy", async (req: Request, res: Response) => {
  const { tool, target, options }: ToolDeployRequest = req.body

  if (!tool || !target) {
    return res.status(400).json({ error: "Tool and target are required" })
  }

  try {
    const result = await postWithRetry(`${config.services.axon}/api/tools/deploy`, { tool, target, options })

    if (result) {
      logger.info({ tool, target }, "Tool deployed successfully")
      res.json(result)
    } else {
      res.status(500).json({ error: "Failed to deploy tool" })
    }
  } catch (error: any) {
    logger.error({ tool, target, error: error.message }, "Tool deployment failed")
    res.status(500).json({ error: "Failed to deploy tool" })
  }
})

app.get("/api/stats", async (req: Request, res: Response) => {
  try {
    const stats = await cache.get("stats:cache")
    res.json(stats || {})
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to fetch stats")
    res.status(500).json({ error: "Failed to fetch stats" })
  }
})

// Wazuh alert webhook
app.post("/webhook/wazuh", async (req: Request, res: Response) => {
  try {
    const alert: WazuhAlert = req.body
    logger.info({ alert_id: alert.id }, "Received Wazuh alert")

    // Normalize alert
    const threat = normalizeWazuhAlert(alert)

    // Forward to AXON for USIM generation
    await postWithRetry(`${config.services.axon}/api/wazuh/alert`, alert)

    // Broadcast to clients
    sseManager.broadcast("alert", threat)
    wsManager.broadcast("alert", threat, "alerts")

    broadcastEvents.inc({ type: "alert", protocol: "sse" })
    broadcastEvents.inc({ type: "alert", protocol: "ws" })

    res.status(200).json({ received: true })
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to process Wazuh alert")
    res.status(500).json({ error: "Failed to process alert" })
  }
})

// Data polling and broadcasting
async function pollAndBroadcast() {
  try {
    const { threats, tools, entities, metrics } = await dataAggregator.aggregateAll()

    // Broadcast via SSE
    sseManager.broadcast("threat", threats)
    sseManager.broadcast("tool", tools)
    sseManager.broadcast("entity", entities)
    sseManager.broadcast("metrics", metrics)

    // Broadcast via WebSocket
    wsManager.broadcast("threat", threats, "threats")
    wsManager.broadcast("tool", tools, "tools")
    wsManager.broadcast("entity", entities, "entities")
    wsManager.broadcast("metrics", metrics, "metrics")

    // Update metrics
    broadcastEvents.inc({ type: "threat", protocol: "sse" })
    broadcastEvents.inc({ type: "tool", protocol: "sse" })
    broadcastEvents.inc({ type: "entity", protocol: "sse" })
    broadcastEvents.inc({ type: "metrics", protocol: "sse" })

    logger.debug("Data broadcast completed")
  } catch (error: any) {
    logger.error({ error: error.message }, "Polling failed")
  }
}

// Heartbeat for SSE connections
function sendHeartbeat() {
  sseManager.sendHeartbeat()
}

// Start server
async function start() {
  try {
    // Connect to Redis
    await cache.connect()

    // Subscribe to Redis pub/sub channels
    await cache.subscribe(["plasma:threats", "plasma:tools", "plasma:entities", "plasma:metrics"], (channel, data) => {
      const eventType = channel.split(":")[1]
      sseManager.broadcast(eventType, data)
      wsManager.broadcast(eventType, data, eventType)
    })

    // Start polling
    setInterval(pollAndBroadcast, config.polling.intervalMs)
    setInterval(sendHeartbeat, 30000) // Heartbeat every 30 seconds

    // Start server
    server.listen(config.port, () => {
      logger.info({ port: config.port }, "PLASMA Streaming Service started")
      logger.info({ services: config.services }, "Backend services configured")
    })

    // Initial data fetch
    await pollAndBroadcast()
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to start server")
    process.exit(1)
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down gracefully")

  await cache.disconnect()
  server.close(() => {
    logger.info("Server closed")
    process.exit(0)
  })
})

process.on("SIGINT", async () => {
  logger.info("Received SIGINT, shutting down gracefully")

  await cache.disconnect()
  server.close(() => {
    logger.info("Server closed")
    process.exit(0)
  })
})

// Start the server
start()
