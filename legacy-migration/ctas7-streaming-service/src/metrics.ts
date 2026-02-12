// Prometheus metrics

import promClient from "prom-client"

const register = new promClient.Registry()

// Collect default metrics
promClient.collectDefaultMetrics({ register })

// HTTP request duration
export const httpRequestDuration = new promClient.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
})

// SSE connections
export const sseConnections = new promClient.Gauge({
  name: "sse_connections_total",
  help: "Number of active SSE connections",
  registers: [register],
})

// WebSocket connections
export const wsConnections = new promClient.Gauge({
  name: "ws_connections_total",
  help: "Number of active WebSocket connections",
  registers: [register],
})

// Data aggregation errors
export const aggregationErrors = new promClient.Counter({
  name: "data_aggregation_errors_total",
  help: "Number of data aggregation errors",
  labelNames: ["service"],
  registers: [register],
})

// Broadcast events
export const broadcastEvents = new promClient.Counter({
  name: "broadcast_events_total",
  help: "Number of broadcast events",
  labelNames: ["type", "protocol"],
  registers: [register],
})

export { register }
