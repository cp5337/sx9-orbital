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
    case 1: return '#00f0ff';  // Cyan - Tier 1 (Primary)
    case 2: return '#00ff9f';  // Green - Tier 2
    case 3: return '#ffd700';  // Gold - Tier 3
    default: return '#666666'; // Gray
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
  const handleNodeClick = useCallback((evt: any) => {
    const node = evt.target;
    const nodeId = node.id();
    const nodeType = node.data('nodeType') === 'Satellite' ? 'satellite' : 'ground-station';
    onNodeSelect?.(nodeId, nodeType);
  }, [onNodeSelect]);

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
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden border border-slate-800">
      {/* HUD Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-3 bg-gradient-to-b from-black/90 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <h3 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
                Constellation Topology
              </h3>
            </div>
            <span className="text-[10px] font-mono text-slate-500">
              [{currentLayout.toUpperCase()}]
            </span>
          </div>

          {/* Layout Toggle Button */}
          <button
            onClick={() => setIsLayoutPanelOpen(!isLayoutPanelOpen)}
            className="px-3 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider
                       text-cyan-400 border border-cyan-400/50 rounded
                       hover:bg-cyan-400/10 hover:border-cyan-400
                       transition-all duration-200"
          >
            Layout
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 mt-2 text-[10px] font-mono">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rotate-45 border-2 border-purple-500 bg-black/80" />
            <span className="text-purple-400">SAT</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-black/80 border-2 border-cyan-400" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }} />
            <span className="text-cyan-400">GND</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 bg-green-400" />
            <span className="text-green-400">ISL</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 border-t-2 border-dashed border-cyan-400" />
            <span className="text-cyan-400">DL</span>
          </div>
        </div>
      </div>

      {/* Layout Options Panel */}
      {isLayoutPanelOpen && (
        <div className="absolute top-20 right-3 z-20 p-3 bg-black/95 border border-slate-700 rounded-lg shadow-xl">
          <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
            Select Layout
          </div>
          <div className="grid grid-cols-2 gap-2">
            {layoutOptions.map((option) => (
              <button
                key={option.key}
                onClick={() => handleLayoutChange(option.key)}
                className={`px-3 py-2 text-[10px] font-mono uppercase tracking-wider rounded
                           border transition-all duration-200 flex items-center gap-2
                           ${currentLayout === option.key
                             ? 'border-cyan-400 text-cyan-400 bg-cyan-400/10'
                             : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
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

      {/* Stats Footer - HUD Style */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-4 py-2 bg-gradient-to-t from-black/95 to-transparent">
        <div className="flex items-center justify-between text-[10px] font-mono">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">SAT:</span>
              <span className="text-purple-400 font-bold">{satellites.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">GND:</span>
              <span className="text-cyan-400 font-bold">{groundStations.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">LINKS:</span>
              <span className="text-green-400 font-bold">{fsoLinks.filter(l => l.active).length}</span>
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

      {/* Corner Brackets - Tactical HUD Effect */}
      <div className="absolute top-2 left-2 w-6 h-6 border-l-2 border-t-2 border-cyan-400/50 pointer-events-none" />
      <div className="absolute top-2 right-2 w-6 h-6 border-r-2 border-t-2 border-cyan-400/50 pointer-events-none" />
      <div className="absolute bottom-2 left-2 w-6 h-6 border-l-2 border-b-2 border-cyan-400/50 pointer-events-none" />
      <div className="absolute bottom-2 right-2 w-6 h-6 border-r-2 border-b-2 border-cyan-400/50 pointer-events-none" />
    </div>
  );
}

export default ConstellationGraphView;
