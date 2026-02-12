"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { type GraphNode, type GraphEdge, getNodeColor } from "@/lib/graph-data"

interface GraphCanvasProps {
  nodes: GraphNode[]
  selectedNode: GraphNode | null
  onNodeClick: (node: GraphNode) => void
  onNodeHover: (node: GraphNode | null) => void
  layout: "force" | "hierarchical" | "circular" | "grid"
}

interface NodePosition {
  x: number
  y: number
  vx: number
  vy: number
}

export function GraphCanvas({ nodes, selectedNode, onNodeClick, onNodeHover, layout }: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map())
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const animationRef = useRef<number>()

  // Initialize node positions based on layout
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const width = canvas.width
    const height = canvas.height
    const positions = new Map<string, NodePosition>()

    if (layout === "force") {
      // Random initial positions for force-directed
      nodes.forEach((node) => {
        positions.set(node.id, {
          x: Math.random() * width,
          y: Math.random() * height,
          vx: 0,
          vy: 0,
        })
      })
    } else if (layout === "circular") {
      // Circular layout
      const radius = Math.min(width, height) * 0.35
      const angleStep = (2 * Math.PI) / nodes.length
      nodes.forEach((node, i) => {
        positions.set(node.id, {
          x: width / 2 + radius * Math.cos(i * angleStep),
          y: height / 2 + radius * Math.sin(i * angleStep),
          vx: 0,
          vy: 0,
        })
      })
    } else if (layout === "grid") {
      // Grid layout
      const cols = Math.ceil(Math.sqrt(nodes.length))
      const cellWidth = width / (cols + 1)
      const cellHeight = height / (Math.ceil(nodes.length / cols) + 1)
      nodes.forEach((node, i) => {
        const row = Math.floor(i / cols)
        const col = i % cols
        positions.set(node.id, {
          x: (col + 1) * cellWidth,
          y: (row + 1) * cellHeight,
          vx: 0,
          vy: 0,
        })
      })
    } else if (layout === "hierarchical") {
      // Hierarchical layout by type
      const typeGroups = new Map<string, GraphNode[]>()
      nodes.forEach((node) => {
        if (!typeGroups.has(node.type)) {
          typeGroups.set(node.type, [])
        }
        typeGroups.get(node.type)!.push(node)
      })

      const types = Array.from(typeGroups.keys())
      const levelHeight = height / (types.length + 1)

      types.forEach((type, levelIndex) => {
        const nodesInLevel = typeGroups.get(type)!
        const levelWidth = width / (nodesInLevel.length + 1)
        nodesInLevel.forEach((node, i) => {
          positions.set(node.id, {
            x: (i + 1) * levelWidth,
            y: (levelIndex + 1) * levelHeight,
            vx: 0,
            vy: 0,
          })
        })
      })
    }

    setNodePositions(positions)
  }, [nodes, layout])

  // Force-directed simulation
  useEffect(() => {
    if (layout !== "force" || nodePositions.size === 0) return

    const simulate = () => {
      const newPositions = new Map(nodePositions)
      const alpha = 0.3

      // Apply forces
      nodes.forEach((node1) => {
        const pos1 = newPositions.get(node1.id)
        if (!pos1) return

        // Repulsion between all nodes
        nodes.forEach((node2) => {
          if (node1.id === node2.id) return
          const pos2 = newPositions.get(node2.id)
          if (!pos2) return

          const dx = pos2.x - pos1.x
          const dy = pos2.y - pos1.y
          const distance = Math.sqrt(dx * dx + dy * dy) || 1
          const force = 1000 / (distance * distance)

          pos1.vx -= (dx / distance) * force * alpha
          pos1.vy -= (dy / distance) * force * alpha
        })

        // Attraction along edges
        node1.relationships.forEach((edge) => {
          const pos2 = newPositions.get(edge.targetId)
          if (!pos2) return

          const dx = pos2.x - pos1.x
          const dy = pos2.y - pos1.y
          const distance = Math.sqrt(dx * dx + dy * dy) || 1
          const force = distance * 0.01 * edge.strength

          pos1.vx += (dx / distance) * force * alpha
          pos1.vy += (dy / distance) * force * alpha
        })

        // Center gravity
        const canvas = canvasRef.current
        if (canvas) {
          const centerX = canvas.width / 2
          const centerY = canvas.height / 2
          pos1.vx += (centerX - pos1.x) * 0.001
          pos1.vy += (centerY - pos1.y) * 0.001
        }

        // Update position with velocity damping
        pos1.x += pos1.vx
        pos1.y += pos1.vy
        pos1.vx *= 0.9
        pos1.vy *= 0.9
      })

      setNodePositions(newPositions)
      animationRef.current = requestAnimationFrame(simulate)
    }

    animationRef.current = requestAnimationFrame(simulate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [layout, nodes, nodePositions])

  // Drawing
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.fillStyle = "#0d1117"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom, zoom)

    // Get all edges
    const edges: { edge: GraphEdge; source: NodePosition; target: NodePosition }[] = []
    nodes.forEach((node) => {
      const sourcePos = nodePositions.get(node.id)
      if (!sourcePos) return

      node.relationships.forEach((edge) => {
        const targetPos = nodePositions.get(edge.targetId)
        if (targetPos) {
          edges.push({ edge, source: sourcePos, target: targetPos })
        }
      })
    })

    // Draw edges
    edges.forEach(({ edge, source, target }) => {
      const isConnectedToSelected =
        selectedNode && (edge.sourceId === selectedNode.id || edge.targetId === selectedNode.id)

      ctx.strokeStyle = isConnectedToSelected ? "#22d3ee" : "#30363d"
      ctx.lineWidth = edge.strength * 2
      ctx.globalAlpha = isConnectedToSelected ? 1 : 0.3

      ctx.beginPath()
      ctx.moveTo(source.x, source.y)
      ctx.lineTo(target.x, target.y)
      ctx.stroke()

      // Draw arrow
      const angle = Math.atan2(target.y - source.y, target.x - source.x)
      const arrowSize = 8
      ctx.fillStyle = ctx.strokeStyle
      ctx.beginPath()
      ctx.moveTo(target.x, target.y)
      ctx.lineTo(
        target.x - arrowSize * Math.cos(angle - Math.PI / 6),
        target.y - arrowSize * Math.sin(angle - Math.PI / 6),
      )
      ctx.lineTo(
        target.x - arrowSize * Math.cos(angle + Math.PI / 6),
        target.y - arrowSize * Math.sin(angle + Math.PI / 6),
      )
      ctx.closePath()
      ctx.fill()
    })

    ctx.globalAlpha = 1

    // Draw nodes
    nodes.forEach((node) => {
      const pos = nodePositions.get(node.id)
      if (!pos) return

      const isSelected = selectedNode?.id === node.id
      const isConnected =
        selectedNode &&
        (selectedNode.relationships.some((e) => e.targetId === node.id) ||
          node.relationships.some((e) => e.targetId === selectedNode.id))

      // Node size based on priority
      const baseSize = { critical: 20, high: 16, medium: 12, low: 10 }[node.priority]
      const size = isSelected ? baseSize * 1.3 : baseSize

      // Opacity
      ctx.globalAlpha = !selectedNode || isSelected || isConnected ? 1 : 0.3

      // Draw node
      ctx.fillStyle = getNodeColor(node.type)
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, size, 0, 2 * Math.PI)
      ctx.fill()

      // Border
      if (isSelected || node.state === "investigating") {
        ctx.strokeStyle = "#22d3ee"
        ctx.lineWidth = isSelected ? 3 : 2
        ctx.stroke()
      } else if (node.state === "high_activity") {
        ctx.strokeStyle = getNodeColor(node.type)
        ctx.lineWidth = 3
        ctx.stroke()
      }

      // EEI badge
      if (node.eeiCount > 0) {
        ctx.fillStyle = "#eab308"
        ctx.beginPath()
        ctx.arc(pos.x + size * 0.7, pos.y - size * 0.7, 6, 0, 2 * Math.PI)
        ctx.fill()

        ctx.fillStyle = "#0d1117"
        ctx.font = "bold 8px sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(node.eeiCount.toString(), pos.x + size * 0.7, pos.y - size * 0.7)
      }

      // Label
      if (isSelected || zoom > 1.5) {
        ctx.fillStyle = "#e6edf3"
        ctx.font = "12px sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "top"
        ctx.fillText(node.name.substring(0, 20), pos.x, pos.y + size + 5)
      }
    })

    ctx.restore()
  }, [nodes, nodePositions, selectedNode, pan, zoom])

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - pan.x) / zoom
    const y = (e.clientY - rect.top - pan.y) / zoom

    // Check if clicking on a node
    let clickedNode: GraphNode | null = null
    for (const node of nodes) {
      const pos = nodePositions.get(node.id)
      if (!pos) continue

      const size = { critical: 20, high: 16, medium: 12, low: 10 }[node.priority]
      const distance = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2)

      if (distance <= size) {
        clickedNode = node
        break
      }
    }

    if (clickedNode) {
      onNodeClick(clickedNode)
    } else {
      setIsDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    } else {
      // Hover detection
      const rect = canvas.getBoundingClientRect()
      const x = (e.clientX - rect.left - pan.x) / zoom
      const y = (e.clientY - rect.top - pan.y) / zoom

      let hoveredNode: GraphNode | null = null
      for (const node of nodes) {
        const pos = nodePositions.get(node.id)
        if (!pos) continue

        const size = { critical: 20, high: 16, medium: 12, low: 10 }[node.priority]
        const distance = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2)

        if (distance <= size) {
          hoveredNode = node
          canvas.style.cursor = "pointer"
          break
        }
      }

      if (!hoveredNode) {
        canvas.style.cursor = isDragging ? "grabbing" : "grab"
      }

      onNodeHover(hoveredNode)
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((prev) => Math.max(0.5, Math.min(3, prev * delta)))
  }

  return (
    <canvas
      ref={canvasRef}
      width={1600}
      height={900}
      className="w-full h-full"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    />
  )
}
