/**
 * Constellation Graph View - Network topology visualization using Cytoscape.js
 *
 * Shows:
 * - Satellites as nodes (grouped by orbital plane)
 * - Ground stations as nodes (colored by tier)
 * - FSO links as edges (colored by link quality)
 * - Routing paths highlighted on selection
 */

import { useEffect, useRef, useMemo, useCallback } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape, { Core, Stylesheet, ElementDefinition } from 'cytoscape';

interface Satellite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number;
  planeIndex?: number;
}

interface GroundStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  tier: number;
  weather_score: number;
}

interface FsoLink {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'sat-sat' | 'sat-ground';
  marginDb: number;
  active: boolean;
}

interface ConstellationGraphViewProps {
  satellites: Satellite[];
  groundStations: GroundStation[];
  fsoLinks: FsoLink[];
  onNodeSelect?: (nodeId: string, nodeType: 'satellite' | 'ground-station') => void;
  onLinkSelect?: (linkId: string) => void;
  layout?: 'circle' | 'grid' | 'concentric' | 'breadthfirst';
}

// Link quality color based on margin
function getLinkColor(marginDb: number): string {
  if (marginDb >= 6) return '#22c55e'; // Green - strong
  if (marginDb >= 3) return '#eab308'; // Yellow - marginal
  if (marginDb >= 0) return '#f97316'; // Orange - weak
  return '#ef4444'; // Red - failing
}

// Ground station tier color
function getTierColor(tier: number): string {
  switch (tier) {
    case 1: return '#3b82f6'; // Blue - Tier 1
    case 2: return '#10b981'; // Green - Tier 2
    case 3: return '#eab308'; // Yellow - Tier 3
    default: return '#6b7280'; // Gray
  }
}

// Satellite plane color
function getPlaneColor(planeIndex: number): string {
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
  return colors[planeIndex % colors.length];
}

const stylesheet: Stylesheet[] = [
  {
    selector: 'node',
    style: {
      'label': 'data(label)',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'font-size': '10px',
      'color': '#e2e8f0',
      'text-margin-y': 5,
      'background-color': 'data(color)',
      'border-width': 2,
      'border-color': '#1e293b',
    }
  },
  {
    selector: 'node[type="satellite"]',
    style: {
      'shape': 'diamond',
      'width': 24,
      'height': 24,
    }
  },
  {
    selector: 'node[type="ground-station"]',
    style: {
      'shape': 'ellipse',
      'width': 20,
      'height': 20,
    }
  },
  {
    selector: 'edge',
    style: {
      'width': 2,
      'line-color': 'data(color)',
      'curve-style': 'bezier',
      'opacity': 0.7,
    }
  },
  {
    selector: 'edge[type="sat-sat"]',
    style: {
      'line-style': 'solid',
      'width': 3,
    }
  },
  {
    selector: 'edge[type="sat-ground"]',
    style: {
      'line-style': 'dashed',
      'width': 2,
    }
  },
  {
    selector: ':selected',
    style: {
      'border-width': 4,
      'border-color': '#fbbf24',
      'line-color': '#fbbf24',
    }
  },
  {
    selector: '.highlighted',
    style: {
      'background-color': '#fbbf24',
      'line-color': '#fbbf24',
      'transition-property': 'background-color, line-color',
      'transition-duration': 300,
    }
  },
  {
    selector: '.faded',
    style: {
      'opacity': 0.2,
    }
  }
];

export function ConstellationGraphView({
  satellites,
  groundStations,
  fsoLinks,
  onNodeSelect,
  onLinkSelect,
  layout = 'concentric',
}: ConstellationGraphViewProps) {
  const cyRef = useRef<Core | null>(null);

  // Build Cytoscape elements from props
  const elements: ElementDefinition[] = useMemo(() => {
    const nodes: ElementDefinition[] = [];
    const edges: ElementDefinition[] = [];

    // Add satellite nodes
    satellites.forEach((sat, idx) => {
      const planeIndex = sat.planeIndex ?? Math.floor(idx / 4);
      nodes.push({
        data: {
          id: sat.id,
          label: sat.name,
          type: 'satellite',
          color: getPlaneColor(planeIndex),
          planeIndex,
          altitude: sat.altitude,
          lat: sat.latitude,
          lon: sat.longitude,
        }
      });
    });

    // Add ground station nodes
    groundStations.forEach((gs) => {
      nodes.push({
        data: {
          id: gs.id,
          label: gs.name,
          type: 'ground-station',
          color: getTierColor(gs.tier),
          tier: gs.tier,
          weatherScore: gs.weather_score,
          lat: gs.latitude,
          lon: gs.longitude,
        }
      });
    });

    // Add FSO link edges
    fsoLinks.forEach((link) => {
      if (link.active) {
        edges.push({
          data: {
            id: link.id,
            source: link.sourceId,
            target: link.targetId,
            type: link.type,
            color: getLinkColor(link.marginDb),
            marginDb: link.marginDb,
          }
        });
      }
    });

    return [...nodes, ...edges];
  }, [satellites, groundStations, fsoLinks]);

  // Layout configuration
  const layoutConfig = useMemo(() => {
    switch (layout) {
      case 'circle':
        return { name: 'circle', padding: 50 };
      case 'grid':
        return { name: 'grid', padding: 50 };
      case 'breadthfirst':
        return { name: 'breadthfirst', directed: false, padding: 50 };
      case 'concentric':
      default:
        return {
          name: 'concentric',
          padding: 50,
          concentric: (node: any) => {
            // Satellites in center, ground stations on outer ring
            return node.data('type') === 'satellite' ? 2 : 1;
          },
          levelWidth: () => 1,
        };
    }
  }, [layout]);

  // Handle node click
  const handleNodeClick = useCallback((evt: any) => {
    const node = evt.target;
    const nodeId = node.id();
    const nodeType = node.data('type');
    onNodeSelect?.(nodeId, nodeType);
  }, [onNodeSelect]);

  // Handle edge click
  const handleEdgeClick = useCallback((evt: any) => {
    const edge = evt.target;
    const edgeId = edge.id();
    onLinkSelect?.(edgeId);
  }, [onLinkSelect]);

  // Highlight path between two nodes
  const highlightPath = useCallback((sourceId: string, targetId: string) => {
    if (!cyRef.current) return;

    const cy = cyRef.current;
    cy.elements().removeClass('highlighted faded');

    // Use Dijkstra to find shortest path
    const dijkstra = cy.elements().dijkstra(`#${sourceId}`, (edge) => {
      const margin = edge.data('marginDb') || 0;
      return 10 - margin; // Lower margin = higher cost
    });

    const path = dijkstra.pathTo(cy.$(`#${targetId}`));
    if (path.length > 0) {
      cy.elements().addClass('faded');
      path.removeClass('faded').addClass('highlighted');
    }
  }, []);

  return (
    <div className="w-full h-full bg-slate-950 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-slate-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Constellation Topology</h3>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rotate-45 bg-red-500" />
            <span className="text-slate-400">Satellites</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-slate-400">Ground Stations</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 bg-green-500" />
            <span className="text-slate-400">Strong Link</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 bg-yellow-500" />
            <span className="text-slate-400">Marginal</span>
          </div>
        </div>
      </div>

      {/* Graph */}
      <div className="h-[calc(100%-48px)]">
        <CytoscapeComponent
          elements={elements}
          stylesheet={stylesheet}
          layout={layoutConfig}
          style={{ width: '100%', height: '100%' }}
          cy={(cy) => {
            cyRef.current = cy;
            cy.on('tap', 'node', handleNodeClick);
            cy.on('tap', 'edge', handleEdgeClick);
          }}
          wheelSensitivity={0.3}
        />
      </div>

      {/* Stats footer */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-slate-900/90 border-t border-slate-700 text-xs text-slate-400 flex gap-4">
        <span>Satellites: {satellites.length}</span>
        <span>Ground Stations: {groundStations.length}</span>
        <span>Active Links: {fsoLinks.filter(l => l.active).length}</span>
      </div>
    </div>
  );
}

export default ConstellationGraphView;
