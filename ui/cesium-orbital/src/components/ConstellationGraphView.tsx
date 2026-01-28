/**
 * Constellation Graph View - Tactical HUD Network Topology Visualization
 *
 * Uses Cytoscape.js with ACOG/HUD aesthetic for:
 * - Satellites as diamond nodes (grouped by orbital plane)
 * - Ground stations as hexagon nodes (colored by tier)
 * - ISL links as solid edges (colored by link quality)
 * - Ground links as dashed edges
 * - Routing paths highlighted on selection
 *
 * Designed for LaserLight partnership demo - tactical and impressive.
 */

import { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import { Core, ElementDefinition } from 'cytoscape';
import {
  generateStylesheet,
  getLayoutConfig,
  getLinkQualityColor,
  getPlaneColor,
  NODE_COLORS,
  HIGH_FIDELITY_THRESHOLD,
  LayoutType,
} from '../config/graphStyles';

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
  initialLayout?: LayoutType;
}

// Ground station tier to color mapping
function getTierColor(tier: number): string {
  switch (tier) {
    case 1: return '#ffff00';  // ANSI Yellow
    case 2: return '#0000ff';  // ANSI Blue
    case 3: return '#ff0000';  // ANSI Red
    default: return '#808080'; // ANSI Gray
  }
}

export function ConstellationGraphView({
  satellites,
  groundStations,
  fsoLinks,
  onNodeSelect,
  onLinkSelect,
  initialLayout = 'cose',
}: ConstellationGraphViewProps) {
  const cyRef = useRef<Core | null>(null);
  const [currentLayout, setCurrentLayout] = useState<LayoutType>(initialLayout);
  const [isLayoutPanelOpen, setIsLayoutPanelOpen] = useState(false);
  const [isolatedNodeId, setIsolatedNodeId] = useState<string | null>(null);

  // Determine if we should use high fidelity rendering
  const totalElements = satellites.length + groundStations.length + fsoLinks.length;
  const isHighFidelity = totalElements < HIGH_FIDELITY_THRESHOLD;

  // Generate stylesheet based on fidelity mode
  const stylesheet = useMemo(() => generateStylesheet(isHighFidelity), [isHighFidelity]);

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
          nodeType: 'Satellite',
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
          nodeType: 'GroundStation',
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
            linkType: link.type,
            color: getLinkQualityColor(link.marginDb),
            marginDb: link.marginDb,
          }
        });
      }
    });

    return [...nodes, ...edges];
  }, [satellites, groundStations, fsoLinks]);

  // Get layout configuration
  const layoutConfig = useMemo(() => {
    const config = getLayoutConfig(currentLayout);
    // For concentric layout, customize the concentric function
    if (currentLayout === 'concentric') {
      return {
        ...config,
        concentric: (node: any) => {
          return node.data('nodeType') === 'Satellite' ? 2 : 1;
        },
      };
    }
    return config;
  }, [currentLayout]);

  // Handle layout change
  const handleLayoutChange = useCallback((newLayout: LayoutType) => {
    setCurrentLayout(newLayout);
    setIsLayoutPanelOpen(false);

    // Trigger re-layout
    if (cyRef.current) {
      const layout = cyRef.current.layout(getLayoutConfig(newLayout));
      layout.run();
    }
  }, []);

  // Handle node click
  const clearIsolation = useCallback(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    cy.elements().removeClass('faded');
    setIsolatedNodeId(null);
  }, []);

  const isolateNode = useCallback((nodeId: string) => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    cy.elements().addClass('faded');
    const node = cy.$id(nodeId);
    node.removeClass('faded');
    node.connectedEdges().removeClass('faded');
    node.connectedEdges().connectedNodes().removeClass('faded');
    setIsolatedNodeId(nodeId);
  }, []);

  const handleNodeClick = useCallback((evt: any) => {
    const node = evt.target;
    const nodeId = node.id();
    const nodeType = node.data('nodeType') === 'Satellite' ? 'satellite' : 'ground-station';
    onNodeSelect?.(nodeId, nodeType);

    if (isolatedNodeId === nodeId) {
      clearIsolation();
    } else {
      isolateNode(nodeId);
    }
  }, [onNodeSelect, isolatedNodeId, clearIsolation, isolateNode]);

  // Handle edge click
  const handleEdgeClick = useCallback((evt: any) => {
    const edge = evt.target;
    const edgeId = edge.id();
    onLinkSelect?.(edgeId);
  }, [onLinkSelect]);

  // Highlight path between two nodes (exposed via ref for external use)
  const highlightPath = useCallback((sourceId: string, targetId: string) => {
    if (!cyRef.current) return;

    const cy = cyRef.current;
    cy.elements().removeClass('highlighted faded');

    // Use Dijkstra to find shortest path with edge weight function
    const dijkstra = cy.elements().dijkstra({
      root: `#${sourceId}`,
      weight: (edge: any) => {
        const margin = edge.data('marginDb') || 0;
        return 10 - margin; // Lower margin = higher cost
      }
    });

    const path = dijkstra.pathTo(cy.$(`#${targetId}`));
    if (path.length > 0) {
      cy.elements().addClass('faded');
      path.removeClass('faded').addClass('highlighted');
    }
  }, []);

  // Expose highlightPath to parent via ref (for future route highlighting)
  useEffect(() => {
    (window as any).__constellationGraphHighlightPath = highlightPath;
    return () => {
      delete (window as any).__constellationGraphHighlightPath;
    };
  }, [highlightPath]);

  // Layout options for the panel
  const layoutOptions: { key: LayoutType; label: string; icon: string }[] = [
    { key: 'cose', label: 'Force-Directed', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
    { key: 'dagre', label: 'Hierarchical', icon: 'M3 3h18v18H3V3zm4 4v10h10V7H7z' },
    { key: 'circle', label: 'Circle', icon: 'M12 2a10 10 0 100 20 10 10 0 000-20z' },
    { key: 'concentric', label: 'Concentric', icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a6 6 0 100 12 6 6 0 000-12z' },
    { key: 'grid', label: 'Grid', icon: 'M3 3h6v6H3V3zm12 0h6v6h-6V3zM3 15h6v6H3v-6zm12 0h6v6h-6v-6z' },
    { key: 'breadthfirst', label: 'Tree', icon: 'M12 2v6m0 0l-4 4m4-4l4 4m-8 4h8' },
  ];

  return (
    <div className="relative w-full h-full bg-slate-900/80 rounded-lg overflow-hidden border border-slate-800">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-3 bg-slate-900/80 backdrop-blur border-b border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <h3 className="text-xs font-semibold text-slate-100 tracking-wide">
                Constellation Topology
              </h3>
            </div>
            <span className="text-[10px] text-slate-400">
              [{currentLayout.toUpperCase()}]
            </span>
          </div>

          {/* Layout Toggle Button */}
          <button
            onClick={() => setIsLayoutPanelOpen(!isLayoutPanelOpen)}
            className="px-3 py-1.5 text-[10px] font-semibold tracking-wide
                       text-slate-200 border border-slate-600 rounded
                       hover:bg-slate-800 hover:border-slate-500
                       transition-all duration-200"
          >
            Layout
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 mt-2 text-[10px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rotate-45 border-2 border-slate-400 bg-slate-900/80" />
            <span className="text-slate-300">SAT</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-slate-900/80 border-2 border-sky-300" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }} />
            <span className="text-slate-300">GND</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 bg-blue-400" />
            <span className="text-slate-300">ISL</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 border-t-2 border-dashed border-sky-300" />
            <span className="text-slate-300">DL</span>
          </div>
        </div>
      </div>

      {/* Layout Options Panel */}
      {isLayoutPanelOpen && (
        <div className="absolute top-20 right-3 z-20 p-3 bg-slate-900/95 border border-slate-700 rounded-lg shadow-xl backdrop-blur">
          <div className="text-[10px] font-semibold text-slate-300 tracking-wide mb-2">
            Select Layout
          </div>
          <div className="grid grid-cols-2 gap-2">
            {layoutOptions.map((option) => (
              <button
                key={option.key}
                onClick={() => handleLayoutChange(option.key)}
                className={`px-3 py-2 text-[10px] rounded
                           border transition-all duration-200 flex items-center gap-2
                           ${currentLayout === option.key
                             ? 'border-slate-400 text-slate-100 bg-slate-800'
                             : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                           }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d={option.icon} />
                </svg>
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Graph Canvas */}
      <div className="absolute inset-0 pt-20 pb-12">
        <CytoscapeComponent
          elements={elements}
          stylesheet={stylesheet as any}
          layout={layoutConfig}
          style={{ width: '100%', height: '100%' }}
          cy={(cy: Core) => {
            cyRef.current = cy;
            cy.on('tap', 'node', handleNodeClick);
            cy.on('tap', 'edge', handleEdgeClick);
          cy.on('tap', (evt) => {
            if (evt.target === cy) {
              clearIsolation();
            }
          });

            // Add hover effects
            cy.on('mouseover', 'node', (evt) => {
              evt.target.addClass('hover');
            });
            cy.on('mouseout', 'node', (evt) => {
              evt.target.removeClass('hover');
            });
          }}
          wheelSensitivity={0.3}
        />
      </div>

      {/* Stats Footer */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-4 py-2 bg-slate-900/80 border-t border-slate-800 backdrop-blur">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">SAT:</span>
              <span className="text-slate-200 font-semibold">{satellites.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">GND:</span>
              <span className="text-slate-200 font-semibold">{groundStations.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">LINKS:</span>
              <span className="text-slate-200 font-semibold">{fsoLinks.filter(l => l.active).length}</span>
            </div>
          </div>

          {/* Link Quality Summary */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: NODE_COLORS.Active }} />
              <span className="text-slate-500">NOMINAL</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: NODE_COLORS.Degraded }} />
              <span className="text-slate-500">MARGINAL</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: NODE_COLORS.Critical }} />
              <span className="text-slate-500">CRITICAL</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConstellationGraphView;
