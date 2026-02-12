// Data normalization functions

import type { Threat, WazuhAlert, ServiceStatus } from "./types.js"

export function normalizeWazuhAlert(alert: WazuhAlert): Threat {
  return {
    id: `THREAT_${alert.id}`,
    severity: mapSeverityLevel(alert.rule.level),
    threat_type: alert.rule.description,
    source_ip: alert.data?.srcip,
    target: alert.agent.name,
    ttps: alert.rule.mitre || [],
    timestamp: alert.timestamp,
    description: alert.rule.description,
    raw_data: alert,
  }
}

function mapSeverityLevel(level: number): "low" | "medium" | "high" | "critical" {
  if (level >= 12) return "critical"
  if (level >= 8) return "high"
  if (level >= 5) return "medium"
  return "low"
}

export function mapServiceStatus(status: string | undefined): ServiceStatus {
  if (!status) return "unknown"

  const normalized = status.toLowerCase()
  if (["healthy", "up", "online", "active"].includes(normalized)) return "healthy"
  if (["degraded", "slow"].includes(normalized)) return "degraded"
  if (["unhealthy", "down", "offline", "error"].includes(normalized)) return "unhealthy"

  return "unknown"
}
