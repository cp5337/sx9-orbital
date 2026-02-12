"use client"

import { useState } from "react"
import { Network, Search, Filter, Maximize, Download, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { GraphCanvas } from "@/components/graph-canvas"
import { NodeDetailsPanel } from "@/components/node-details-panel"
import { type GraphNode, mockNodes } from "@/lib/graph-data"

export default function GraphViewer() {
  const [nodes] = useState<GraphNode[]>(mockNodes)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [layout, setLayout] = useState<"force" | "hierarchical" | "circular" | "grid">("force")
  const [searchQuery, setSearchQuery] = useState("")
  const [filters, setFilters] = useState({
    types: new Set<string>(["task", "actor", "object", "event", "attribute"]),
    priorities: new Set<string>(["critical", "high", "medium", "low"]),
    states: new Set<string>(),
  })

  // Filter nodes
  const filteredNodes = nodes.filter((node) => {
    if (!filters.types.has(node.type)) return false
    if (!filters.priorities.has(node.priority)) return false
    if (filters.states.size > 0 && !filters.states.has(node.state)) return false
    if (
      searchQuery &&
      !node.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !node.id.toLowerCase().includes(searchQuery.toLowerCase())
    )
      return false
    return true
  })

  const handleNodeClick = (node: GraphNode) => {
    setSelectedNode(node)
  }

  const handleNodeNavigate = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId)
    if (node) {
      setSelectedNode(node)
    }
  }

  const clearFilters = () => {
    setFilters({
      types: new Set(["task", "actor", "object", "event", "attribute"]),
      priorities: new Set(["critical", "high", "medium", "low"]),
      states: new Set(),
    })
    setSearchQuery("")
  }

  const activeFilterCount =
    5 - filters.types.size + (4 - filters.priorities.size) + filters.states.size + (searchQuery ? 1 : 0)

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: "var(--bg-secondary)" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{
          backgroundColor: "var(--bg-elevated)",
          borderColor: "var(--border-primary)",
        }}
      >
        <div className="flex items-center gap-4">
          <Network className="w-6 h-6" style={{ color: "var(--accent-cyan)" }} />
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            CTAS-7 Task Graph Viewer
          </h1>
          <Badge
            variant="outline"
            style={{
              borderColor: "var(--border-accent)",
              color: "var(--text-secondary)",
            }}
          >
            {filteredNodes.length} / {nodes.length} nodes
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          {/* Layout Selector */}
          <Select value={layout} onValueChange={(value: any) => setLayout(value)}>
            <SelectTrigger
              className="w-40"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                borderColor: "var(--border-primary)",
                color: "var(--text-primary)",
              }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="force">Force-Directed</SelectItem>
              <SelectItem value="hierarchical">Hierarchical</SelectItem>
              <SelectItem value="circular">Circular</SelectItem>
              <SelectItem value="grid">Grid</SelectItem>
            </SelectContent>
          </Select>

          {/* Filter Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="relative bg-transparent">
                <Filter className="w-4 h-4" />
                {activeFilterCount > 0 && (
                  <Badge
                    className="absolute -top-1 -right-1 w-5 h-5 p-0 flex items-center justify-center"
                    style={{ backgroundColor: "var(--accent-cyan)", color: "var(--bg-primary)" }}
                  >
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Filter by Type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {["task", "actor", "object", "event", "attribute"].map((type) => (
                <DropdownMenuCheckboxItem
                  key={type}
                  checked={filters.types.has(type)}
                  onCheckedChange={(checked) => {
                    const newTypes = new Set(filters.types)
                    if (checked) newTypes.add(type)
                    else newTypes.delete(type)
                    setFilters({ ...filters, types: newTypes })
                  }}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </DropdownMenuCheckboxItem>
              ))}

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Filter by Priority</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {["critical", "high", "medium", "low"].map((priority) => (
                <DropdownMenuCheckboxItem
                  key={priority}
                  checked={filters.priorities.has(priority)}
                  onCheckedChange={(checked) => {
                    const newPriorities = new Set(filters.priorities)
                    if (checked) newPriorities.add(priority)
                    else newPriorities.delete(priority)
                    setFilters({ ...filters, priorities: newPriorities })
                  }}
                >
                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Search */}
          <div className="relative w-64">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
              style={{ color: "var(--text-muted)" }}
            />
            <Input
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                borderColor: "var(--border-primary)",
                color: "var(--text-primary)",
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2"
              >
                <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              </button>
            )}
          </div>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} style={{ color: "var(--accent-cyan)" }}>
              Clear Filters
            </Button>
          )}

          {/* Center Button */}
          <Button variant="outline" size="icon">
            <Maximize className="w-4 h-4" />
          </Button>

          {/* Export Button */}
          <Button variant="outline" size="icon">
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Graph Area */}
      <div className="flex-1 relative" style={{ backgroundColor: "var(--bg-secondary)" }}>
        {filteredNodes.length > 0 ? (
          <>
            <GraphCanvas
              nodes={filteredNodes}
              selectedNode={selectedNode}
              onNodeClick={handleNodeClick}
              onNodeHover={setHoveredNode}
              layout={layout}
            />

            {/* Hover Tooltip */}
            {hoveredNode && !selectedNode && (
              <div
                className="absolute top-4 left-4 p-3 rounded-lg shadow-lg max-w-xs pointer-events-none"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderColor: "var(--border-accent)",
                  borderWidth: "1px",
                }}
              >
                <div className="font-mono text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                  {hoveredNode.id}
                </div>
                <div className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                  {hoveredNode.name}
                </div>
                <div className="text-xs flex gap-2">
                  <span style={{ color: "var(--text-secondary)" }}>{hoveredNode.category}</span>
                  <span style={{ color: "var(--accent-cyan)" }}>•</span>
                  <span style={{ color: "var(--text-secondary)" }}>{hoveredNode.priority}</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <Network className="w-24 h-24 mb-4 opacity-50" style={{ color: "var(--text-muted)" }} />
            <p className="text-lg mb-4" style={{ color: "var(--text-secondary)" }}>
              No nodes match current filters
            </p>
            <Button
              onClick={clearFilters}
              style={{
                backgroundColor: "var(--accent-cyan)",
                color: "var(--bg-primary)",
              }}
            >
              Reset Filters
            </Button>
          </div>
        )}
      </div>

      {/* Node Details Panel */}
      {selectedNode && (
        <NodeDetailsPanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          onNodeNavigate={handleNodeNavigate}
        />
      )}
    </div>
  )
}
