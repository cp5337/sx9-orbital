export interface GraphNode {
  id: string
  name: string
  category: string
  type: "task" | "actor" | "object" | "event" | "attribute"
  priority: "critical" | "high" | "medium" | "low"
  state: "normal" | "investigating" | "increasing" | "reducing" | "high_activity" | "low_activity"
  description: string
  eeiCount: number
  relationships: GraphEdge[]
  metadata: {
    attckTechniques?: string[]
    kaliTools?: string[]
    historicalIncidents?: string[]
  }
}

export interface GraphEdge {
  sourceId: string
  targetId: string
  relationshipType: "enables" | "informs" | "vulnerable_to" | "feeds" | "requires" | "detects"
  unicodeOp: string
  strength: number
  description: string
}

export interface EEIRequirement {
  nodeId: string
  rank: number
  question: string
  collectionMethod: string
  timeSensitivity: "critical" | "high" | "medium" | "low"
  matchCount?: number
}

export const mockNodes: GraphNode[] = [
  {
    id: "uuid-100-000-000-A",
    name: "Advanced Persistent Reconnaissance",
    category: "Reconnaissance",
    type: "task",
    priority: "critical",
    state: "investigating",
    description: "Systematic intelligence gathering on target organization",
    eeiCount: 7,
    relationships: [],
    metadata: {
      attckTechniques: ["T1595", "T1592", "T1590"],
      kaliTools: ["nmap", "recon-ng", "theharvester"],
      historicalIncidents: ["APT28 energy sector 2024", "Sandworm Ukraine 2015"],
    },
  },
  {
    id: "uuid-004-000-000-A",
    name: "Vulnerability Exploitation",
    category: "Exploitation",
    type: "task",
    priority: "critical",
    state: "high_activity",
    description: "Exploiting identified vulnerabilities to gain access",
    eeiCount: 5,
    relationships: [],
    metadata: {
      attckTechniques: ["T1190", "T1203", "T1068"],
      kaliTools: ["metasploit", "exploit-db", "sqlmap"],
    },
  },
  {
    id: "uuid-011-000-000-A",
    name: "Attack Planning",
    category: "Planning",
    type: "task",
    priority: "high",
    state: "normal",
    description: "Strategic planning and coordination of attack operations",
    eeiCount: 4,
    relationships: [],
    metadata: {
      attckTechniques: ["T1583", "T1584", "T1586"],
      kaliTools: ["maltego", "spiderfoot"],
    },
  },
  {
    id: "uuid-026-000-000-A",
    name: "Counter-Intelligence Operations",
    category: "Defense",
    type: "task",
    priority: "high",
    state: "normal",
    description: "Defensive measures and threat detection",
    eeiCount: 6,
    relationships: [],
    metadata: {
      attckTechniques: ["T1562", "T1070"],
      kaliTools: ["snort", "suricata", "zeek"],
    },
  },
  {
    id: "apt28",
    name: "APT28 (Fancy Bear)",
    category: "Nation-State Actor",
    type: "actor",
    priority: "critical",
    state: "high_activity",
    description: "Russian GRU-affiliated APT group",
    eeiCount: 0,
    relationships: [],
    metadata: {
      historicalIncidents: ["2016 DNC hack", "2017 NotPetya", "2024 Energy sector"],
    },
  },
  {
    id: "apt29",
    name: "APT29 (Cozy Bear)",
    category: "Nation-State Actor",
    type: "actor",
    priority: "critical",
    state: "normal",
    description: "Russian SVR-affiliated APT group",
    eeiCount: 0,
    relationships: [],
    metadata: {
      historicalIncidents: ["SolarWinds 2020", "COVID-19 vaccine research"],
    },
  },
  {
    id: "mimikatz",
    name: "Mimikatz",
    category: "Credential Dumper",
    type: "object",
    priority: "high",
    state: "normal",
    description: "Post-exploitation tool for credential extraction",
    eeiCount: 0,
    relationships: [],
    metadata: {
      attckTechniques: ["T1003"],
    },
  },
  {
    id: "cobalt-strike",
    name: "Cobalt Strike",
    category: "C2 Framework",
    type: "object",
    priority: "high",
    state: "increasing",
    description: "Command and control framework for adversary simulation",
    eeiCount: 0,
    relationships: [],
    metadata: {
      attckTechniques: ["T1071", "T1090", "T1219"],
    },
  },
  {
    id: "colonial-pipeline-2021",
    name: "Colonial Pipeline Ransomware",
    category: "Critical Infrastructure Attack",
    type: "event",
    priority: "critical",
    state: "normal",
    description: "May 2021 ransomware attack on US fuel pipeline",
    eeiCount: 0,
    relationships: [],
    metadata: {
      historicalIncidents: ["DarkSide ransomware", "Energy sector"],
    },
  },
  {
    id: "solarwinds-2020",
    name: "SolarWinds Supply Chain Attack",
    category: "Supply Chain Compromise",
    type: "event",
    priority: "critical",
    state: "normal",
    description: "December 2020 supply chain attack via SolarWinds Orion",
    eeiCount: 0,
    relationships: [],
    metadata: {
      historicalIncidents: ["APT29", "SUNBURST backdoor"],
    },
  },
  {
    id: "zero-day-exploit",
    name: "Zero-Day Vulnerability",
    category: "Vulnerability Type",
    type: "attribute",
    priority: "critical",
    state: "low_activity",
    description: "Previously unknown software vulnerability",
    eeiCount: 0,
    relationships: [],
    metadata: {},
  },
  {
    id: "spear-phishing",
    name: "Spear Phishing Campaign",
    category: "Initial Access Vector",
    type: "attribute",
    priority: "high",
    state: "normal",
    description: "Targeted phishing attacks against specific individuals",
    eeiCount: 0,
    relationships: [],
    metadata: {
      attckTechniques: ["T1566"],
    },
  },
]

// Initialize relationships
mockNodes[0].relationships = [
  {
    sourceId: "uuid-100-000-000-A",
    targetId: "uuid-004-000-000-A",
    relationshipType: "enables",
    unicodeOp: "→",
    strength: 0.99,
    description: "Advanced reconnaissance critically enables vulnerability exploitation",
  },
  {
    sourceId: "uuid-100-000-000-A",
    targetId: "uuid-011-000-000-A",
    relationshipType: "informs",
    unicodeOp: "⇢",
    strength: 0.85,
    description: "Reconnaissance informs attack planning",
  },
  {
    sourceId: "uuid-100-000-000-A",
    targetId: "apt28",
    relationshipType: "feeds",
    unicodeOp: "👁",
    strength: 0.9,
    description: "Intelligence feeds threat actor profiles",
  },
]

mockNodes[1].relationships = [
  {
    sourceId: "uuid-004-000-000-A",
    targetId: "mimikatz",
    relationshipType: "requires",
    unicodeOp: "⚡",
    strength: 0.75,
    description: "Exploitation requires credential dumping tools",
  },
  {
    sourceId: "uuid-004-000-000-A",
    targetId: "zero-day-exploit",
    relationshipType: "requires",
    unicodeOp: "⚡",
    strength: 0.95,
    description: "Exploitation leverages zero-day vulnerabilities",
  },
]

mockNodes[4].relationships = [
  {
    sourceId: "apt28",
    targetId: "uuid-100-000-000-A",
    relationshipType: "enables",
    unicodeOp: "→",
    strength: 0.88,
    description: "Threat actor enables reconnaissance operations",
  },
  {
    sourceId: "apt28",
    targetId: "spear-phishing",
    relationshipType: "enables",
    unicodeOp: "→",
    strength: 0.92,
    description: "APT28 frequently uses spear phishing",
  },
]

export const mockEEIRequirements: EEIRequirement[] = [
  {
    nodeId: "uuid-100-000-000-A",
    rank: 1,
    question: "What are the critical vulnerabilities in the target organization's systems and infrastructure?",
    collectionMethod: "Vulnerability scanning, penetration testing, code review",
    timeSensitivity: "critical",
    matchCount: 12,
  },
  {
    nodeId: "uuid-100-000-000-A",
    rank: 2,
    question: "What are the security protocols and response times of security personnel?",
    collectionMethod: "Physical observation, social engineering, insider threat",
    timeSensitivity: "high",
    matchCount: 5,
  },
  {
    nodeId: "uuid-100-000-000-A",
    rank: 3,
    question: "What are the key personnel and their access privileges?",
    collectionMethod: "OSINT, LinkedIn, company directories",
    timeSensitivity: "high",
    matchCount: 8,
  },
  {
    nodeId: "uuid-004-000-000-A",
    rank: 1,
    question: "What exploit frameworks are available for identified vulnerabilities?",
    collectionMethod: "Exploit-DB, Metasploit, GitHub",
    timeSensitivity: "critical",
    matchCount: 15,
  },
  {
    nodeId: "uuid-004-000-000-A",
    rank: 2,
    question: "What defensive measures are in place to detect exploitation attempts?",
    collectionMethod: "Network traffic analysis, EDR logs",
    timeSensitivity: "high",
    matchCount: 7,
  },
]

export function getNodeColor(type: GraphNode["type"]): string {
  const colors = {
    task: "#22d3ee",
    actor: "#ef4444",
    object: "#10b981",
    event: "#eab308",
    attribute: "#3b82f6",
  }
  return colors[type]
}

export function getPriorityColor(priority: GraphNode["priority"]): string {
  const colors = {
    critical: "#ef4444",
    high: "#eab308",
    medium: "#3b82f6",
    low: "#8b949e",
  }
  return colors[priority]
}

export function getRelationshipIcon(type: GraphEdge["relationshipType"]): string {
  const icons = {
    enables: "→",
    informs: "⇢",
    vulnerable_to: "⚠",
    feeds: "👁",
    requires: "⚡",
    detects: "🔍",
  }
  return icons[type]
}
