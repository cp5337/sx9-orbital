// Data aggregation from backend services

import { config } from "./config.js"
import { logger } from "./logger.js"
import { cache } from "./cache.js"
import { fetchWithRetry } from "./http-client.js"
import type { Threat, Tool, Entity, Metrics } from "./types.js"
import { mapServiceStatus } from "./normalizers.js"

export class DataAggregator {
  async fetchThreats(): Promise<Threat[]> {
    try {
      const threats = await fetchWithRetry<Threat[]>(`${config.services.axon}/api/threats`)

      if (threats) {
        await cache.set("threats:cache", threats, config.cache.ttlSeconds)
        return threats
      }

      // Fallback to cached data
      logger.warn("AXON unavailable, using cached threats")
      const cached = await cache.get<Threat[]>("threats:cache")
      return cached || []
    } catch (error: any) {
      logger.error({ error: error.message }, "Failed to fetch threats")
      return []
    }
  }

  async fetchTools(): Promise<Tool[]> {
    try {
      const tools = await fetchWithRetry<Tool[]>(`${config.services.axon}/api/usims`)

      if (tools) {
        await cache.set("tools:cache", tools, config.cache.ttlSeconds)
        return tools
      }

      logger.warn("AXON unavailable, using cached tools")
      const cached = await cache.get<Tool[]>("tools:cache")
      return cached || []
    } catch (error: any) {
      logger.error({ error: error.message }, "Failed to fetch tools")
      return []
    }
  }

  async fetchEntities(): Promise<Entity[]> {
    try {
      const entities = await fetchWithRetry<Entity[]>(`${config.services.legion}/api/entities`)

      if (entities) {
        await cache.set("entities:cache", entities, config.cache.ttlSeconds)
        return entities
      }

      logger.warn("Legion unavailable, using cached entities")
      const cached = await cache.get<Entity[]>("entities:cache")
      return cached || []
    } catch (error: any) {
      logger.error({ error: error.message }, "Failed to fetch entities")
      return []
    }
  }

  async fetchMetrics(): Promise<Metrics> {
    try {
      const [axonMetrics, statsMetrics, services] = await Promise.all([
        fetchWithRetry<any>(`${config.services.axon}/api/metrics`),
        fetchWithRetry<any>(`${config.services.stats}/api/stats/threats`),
        fetchWithRetry<any[]>(`${config.services.monitoring}/api/services`),
      ])

      const metrics: Metrics = {
        active_threats: axonMetrics?.active_threats || 0,
        tools_running: axonMetrics?.tools_running || 0,
        entities_tracked: axonMetrics?.entities_tracked || 0,
        events_per_sec: axonMetrics?.events_per_sec || 0,
        services: {
          wazuh: mapServiceStatus(services?.find((s) => s.name === "wazuh")?.status),
          axon: mapServiceStatus(services?.find((s) => s.name === "axon")?.status),
          legion: mapServiceStatus(services?.find((s) => s.name === "legion")?.status),
          surrealdb: mapServiceStatus(services?.find((s) => s.name === "surrealdb")?.status),
        },
      }

      await cache.set("metrics:cache", metrics, config.cache.ttlSeconds)
      return metrics
    } catch (error: any) {
      logger.error({ error: error.message }, "Failed to fetch metrics")

      const cached = await cache.get<Metrics>("metrics:cache")
      return (
        cached || {
          active_threats: 0,
          tools_running: 0,
          entities_tracked: 0,
          events_per_sec: 0,
          services: {
            wazuh: "unknown",
            axon: "unknown",
            legion: "unknown",
            surrealdb: "unknown",
          },
        }
      )
    }
  }

  async aggregateAll() {
    const [threats, tools, entities, metrics] = await Promise.all([
      this.fetchThreats(),
      this.fetchTools(),
      this.fetchEntities(),
      this.fetchMetrics(),
    ])

    return { threats, tools, entities, metrics }
  }
}
