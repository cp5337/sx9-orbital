// Data type definitions for PLASMA streaming service

export interface Threat {
  id: string
  severity: "low" | "medium" | "high" | "critical"
  threat_type: string
  source_ip?: string
  target?: string
  ttps: string[]
  timestamp: string
  description: string
  raw_data?: any
}

export interface Tool {
  id: string
  name: string
  unicode: string
  status: "pending" | "running" | "complete" | "failed"
  progress: number
  target: string
  risk_level: "low" | "medium" | "high" | "critical"
  output: string[]
  started_at: string
  completed_at?: string
}

export interface Entity {
  id: string
  type: "actor" | "infrastructure" | "malware" | "campaign"
  name: string
  description: string
  risk_score: number
  first_seen: string
  last_seen: string
  attributes: Record<string, any>
}

export interface Metrics {
  active_threats: number
  tools_running: number
  entities_tracked: number
  events_per_sec: number
  services: {
    wazuh: ServiceStatus
    axon: ServiceStatus
    legion: ServiceStatus
    surrealdb: ServiceStatus
  }
}

export type ServiceStatus = "healthy" | "degraded" | "unhealthy" | "unknown"

export interface WazuhAlert {
  id: string
  rule: {
    level: number
    description: string
    mitre?: string[]
  }
  agent: {
    name: string
    ip?: string
  }
  data?: {
    srcip?: string
    dstip?: string
  }
  timestamp: string
}

export interface WebSocketMessage {
  type: "subscribe" | "unsubscribe" | "deploy_tool" | "threat" | "tool_update" | "metrics" | "error"
  channels?: string[]
  tool?: string
  target?: string
  options?: Record<string, any>
  data?: any
  message?: string
}

export interface ToolDeployRequest {
  tool: string
  target: string
  options?: Record<string, any>
}

export interface HealthResponse {
  status: "healthy" | "unhealthy"
  uptime: number
  connections: {
    sse: number
    ws: number
  }
  services: Record<string, ServiceStatus>
}
