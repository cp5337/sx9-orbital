// Configuration for PLASMA streaming service

export const config = {
  port: Number.parseInt(process.env.PORT || "15180", 10),

  services: {
    axon: process.env.AXON_URL || "http://localhost:15176",
    legion: process.env.LEGION_URL || "http://localhost:15177",
    stats: process.env.STATS_URL || "http://localhost:18108",
    monitoring: process.env.MONITORING_URL || "http://localhost:18109",
    wazuh: process.env.WAZUH_URL || "http://localhost:55000",
  },

  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },

  cors: {
    origins: [
      "http://localhost:3000",
      "http://localhost:15174",
      "https://plasma.vercel.app",
      process.env.FRONTEND_URL,
    ].filter(Boolean) as string[],
  },

  polling: {
    intervalMs: 2000, // Poll backend services every 2 seconds
  },

  cache: {
    ttlSeconds: 60, // Cache data for 60 seconds
  },

  retry: {
    maxRetries: 3,
    baseDelayMs: 1000,
  },

  http: {
    timeoutMs: 5000,
    maxSockets: 50,
  },

  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
  },

  logging: {
    level: process.env.LOG_LEVEL || "info",
  },
}
