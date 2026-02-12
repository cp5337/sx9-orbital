"use client"

import { type GraphNode, mockEEIRequirements, getRelationshipIcon, getPriorityColor } from "@/lib/graph-data"
import { X, Shield, Users, Box, Calendar, Tag, ExternalLink, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useState } from "react"

interface NodeDetailsPanelProps {
  node: GraphNode
  onClose: () => void
  onNodeNavigate: (nodeId: string) => void
}

export function NodeDetailsPanel({ node, onClose, onNodeNavigate }: NodeDetailsPanelProps) {
  const [showAllEEI, setShowAllEEI] = useState(false)
  const [showMetadata, setShowMetadata] = useState(false)

  const nodeEEIs = mockEEIRequirements.filter((eei) => eei.nodeId === node.id)
  const displayedEEIs = showAllEEI ? nodeEEIs : nodeEEIs.slice(0, 3)

  const getTypeIcon = () => {
    switch (node.type) {
      case "task":
        return <Shield className="w-5 h-5" />
      case "actor":
        return <Users className="w-5 h-5" />
      case "object":
        return <Box className="w-5 h-5" />
      case "event":
        return <Calendar className="w-5 h-5" />
      case "attribute":
        return <Tag className="w-5 h-5" />
    }
  }

  const getStateText = (state: GraphNode["state"]) => {
    return state
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  return (
    <div
      className="absolute bottom-0 left-0 right-0 p-6 max-h-96 overflow-y-auto border-t"
      style={{
        backgroundColor: "var(--bg-elevated)",
        borderColor: "var(--border-primary)",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3 flex-1">
          <div style={{ color: getPriorityColor(node.priority) }}>{getTypeIcon()}</div>
          <div className="flex-1">
            <h3 className="font-mono text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
              {node.id}
            </h3>
            <h2 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {node.name}
            </h2>
            <div className="flex gap-2 flex-wrap">
              <Badge
                variant="outline"
                style={{
                  borderColor: "var(--border-accent)",
                  color: "var(--accent-cyan)",
                }}
              >
                {node.category}
              </Badge>
              <Badge
                variant="outline"
                style={{
                  borderColor: getPriorityColor(node.priority),
                  color: getPriorityColor(node.priority),
                }}
              >
                {node.priority.toUpperCase()}
              </Badge>
              <Badge
                variant="outline"
                style={{
                  borderColor: "var(--border-primary)",
                  color: "var(--text-secondary)",
                }}
              >
                {getStateText(node.state)}
              </Badge>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Description */}
      <p className="mb-4" style={{ color: "var(--text-secondary)" }}>
        {node.description}
      </p>

      {/* Relationships */}
      {node.relationships.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold mb-2 uppercase" style={{ color: "var(--text-muted)" }}>
            Relationships ({node.relationships.length})
          </h3>
          <div className="space-y-2">
            {node.relationships.map((edge, i) => (
              <button
                key={i}
                onClick={() => onNodeNavigate(edge.targetId)}
                className="w-full flex items-start gap-3 p-2 rounded hover:bg-opacity-50 transition-colors text-left"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                }}
              >
                <span className="text-lg">{getRelationshipIcon(edge.relationshipType)}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      {edge.relationshipType.replace("_", " ")}
                    </span>
                    <span className="text-xs" style={{ color: "var(--accent-cyan)" }}>
                      [{edge.strength.toFixed(2)}]
                    </span>
                  </div>
                  <p className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
                    {edge.targetId}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    {edge.description}
                  </p>
                </div>
                <ExternalLink className="w-4 h-4 mt-1" style={{ color: "var(--accent-cyan)" }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* EEI Requirements */}
      {nodeEEIs.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold uppercase" style={{ color: "var(--text-muted)" }}>
              EEI Requirements ({nodeEEIs.length})
            </h3>
            <Button
              variant="outline"
              size="sm"
              style={{
                borderColor: "var(--accent-cyan)",
                color: "var(--accent-cyan)",
              }}
            >
              Match with Stream
            </Button>
          </div>
          <div className="space-y-2">
            {displayedEEIs.map((eei, i) => (
              <div
                key={i}
                className="p-3 rounded"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  borderLeft: `3px solid var(--accent-${eei.timeSensitivity === "critical" ? "red" : "yellow"})`,
                }}
              >
                <div className="flex items-start gap-2 mb-1">
                  <span className="text-xs font-bold" style={{ color: "var(--accent-cyan)" }}>
                    #{eei.rank}
                  </span>
                  {eei.matchCount && eei.matchCount > 0 && (
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: "var(--accent-green)",
                        color: "var(--accent-green)",
                        fontSize: "10px",
                      }}
                    >
                      {eei.matchCount} matches
                    </Badge>
                  )}
                </div>
                <p className="text-sm mb-2" style={{ color: "var(--text-primary)" }}>
                  {eei.question}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  <span className="font-semibold">Collection:</span> {eei.collectionMethod}
                </p>
              </div>
            ))}
          </div>
          {nodeEEIs.length > 3 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllEEI(!showAllEEI)}
              className="mt-2 w-full"
              style={{ color: "var(--accent-cyan)" }}
            >
              {showAllEEI ? (
                <>
                  Show Less <ChevronUp className="w-4 h-4 ml-1" />
                </>
              ) : (
                <>
                  Show All {nodeEEIs.length} EEI Requirements <ChevronDown className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Metadata */}
      {(node.metadata.attckTechniques || node.metadata.kaliTools || node.metadata.historicalIncidents) && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowMetadata(!showMetadata)}
            className="w-full justify-between mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            <span className="text-sm font-semibold uppercase">Metadata</span>
            {showMetadata ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
          {showMetadata && (
            <div className="space-y-3 p-3 rounded" style={{ backgroundColor: "var(--bg-tertiary)" }}>
              {node.metadata.attckTechniques && (
                <div>
                  <h4 className="text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                    ATT&CK Techniques
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {node.metadata.attckTechniques.map((tech, i) => (
                      <Badge key={i} variant="secondary" className="font-mono text-xs">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {node.metadata.kaliTools && (
                <div>
                  <h4 className="text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                    Kali Tools
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {node.metadata.kaliTools.map((tool, i) => (
                      <Badge key={i} variant="secondary" className="font-mono text-xs">
                        {tool}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {node.metadata.historicalIncidents && (
                <div>
                  <h4 className="text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                    Historical Incidents
                  </h4>
                  <ul className="text-xs space-y-1" style={{ color: "var(--text-secondary)" }}>
                    {node.metadata.historicalIncidents.map((incident, i) => (
                      <li key={i}>• {incident}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
