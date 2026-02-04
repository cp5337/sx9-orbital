/**
 * Flat Map View - 2D Map visualization with animated beams
 *
 * Uses MapLibre GL with CARTO dark tiles.
 * Receives data from App.tsx for consistency with other views.
 * Features momentary/pulsing beam animations.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Map, { Marker, Source, Layer, NavigationControl, MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Satellite, GroundNode, FsoLink } from '@/types';
import { beamSelectionStore } from '@/store/beamSelectionStore';

interface FlatMapViewProps {
  satellites: Satellite[];
  groundStations: GroundNode[];
  fsoLinks: FsoLink[];
  onNodeSelect?: (nodeId: string, nodeType: 'satellite' | 'ground-station') => void;
}

// Node colors matching the graph view
const NODE_COLORS = {
  satellite: '#4C8BF5',
  tier1: '#34A853',
  tier2: '#00ACC1',
  tier3: '#FF9800',
};

// Beam colors based on link quality
function getBeamColor(marginDb: number): string {
  if (marginDb >= 6) return '#34A853'; // Green - excellent
  if (marginDb >= 3) return '#4C8BF5'; // Blue - good
  if (marginDb >= 0) return '#FF9800'; // Orange - marginal
  return '#EA4335'; // Red - weak
}

function getTierColor(tier: number): string {
  switch (tier) {
    case 1: return NODE_COLORS.tier1;
    case 2: return NODE_COLORS.tier2;
    case 3: return NODE_COLORS.tier3;
    default: return '#9AA0A6';
  }
}

function getGroundStationSize(tier: number): number {
  switch (tier) {
    case 1: return 10;
    case 2: return 8;
    case 3: return 6;
    default: return 6;
  }
}

export function FlatMapView({
  satellites,
  groundStations,
  fsoLinks,
  onNodeSelect,
}: FlatMapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const [selectedNode, setSelectedNode] = useState<{ id: string; name: string; type: string } | null>(null);
  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 20,
    zoom: 1.5,
  });

  // Animated beam state - cycle through active beams
  const [activeBeamIds, setActiveBeamIds] = useState<Set<string>>(new Set());
  const beamPhaseRef = useRef(0);
  const [beamPhase, setBeamPhase] = useState(0);

  // Stable reference to fsoLinks for the interval closure
  const fsoLinksRef = useRef(fsoLinks);
  fsoLinksRef.current = fsoLinks;

  // Animate beams - single stable interval, no stale closures
  useEffect(() => {
    const interval = setInterval(() => {
      beamPhaseRef.current = (beamPhaseRef.current + 1) % 60;
      setBeamPhase(beamPhaseRef.current);

      // Every 2 seconds, randomly activate/deactivate some beams
      if (beamPhaseRef.current % 20 === 0) {
        const activeLinks = fsoLinksRef.current.filter(l => l.active);
        const newActive = new Set<string>();

        activeLinks.forEach(link => {
          if (Math.random() < 0.7) {
            newActive.add(link.id);
          }
        });

        setActiveBeamIds(newActive);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Listen for satellite selection from store — center/zoom the map
  useEffect(() => {
    const unsubscribe = beamSelectionStore.subscribe((state) => {
      const satId = state.selectedSatelliteId;
      if (!satId) return;
      const sat = satellites.find((s) => s.id === satId);
      if (sat && mapRef.current) {
        mapRef.current.flyTo({
          center: [sat.longitude, sat.latitude],
          zoom: 4,
          duration: 1500,
        });
        setSelectedNode({ id: sat.id, name: sat.name, type: `${sat.altitude} km` });
      }
    });
    return () => { unsubscribe(); };
  }, [satellites]);

  // Build GeoJSON for beam lines - only active beams with pulse effect
  const beamGeoJson = useMemo((): GeoJSON.FeatureCollection => {
    const features: GeoJSON.Feature[] = [];

    fsoLinks
      .filter(link => link.active && activeBeamIds.has(link.id))
      .forEach(link => {
        // Find source (satellite)
        const source = satellites.find(s => s.id === link.source_id);
        // Find target (could be satellite or ground station)
        const targetSat = satellites.find(s => s.id === link.target_id);
        const targetGround = groundStations.find(g => g.id === link.target_id);
        const target = targetSat || targetGround;

        if (source && target) {
          features.push({
            type: 'Feature',
            properties: {
              id: link.id,
              color: getBeamColor(link.margin_db),
              linkType: link.link_type,
              opacity: 0.4 + 0.4 * Math.sin(beamPhase * 0.2), // Pulsing opacity
            },
            geometry: {
              type: 'LineString',
              coordinates: [
                [source.longitude, source.latitude],
                [target.longitude, target.latitude],
              ],
            },
          });
        }
      });

    return {
      type: 'FeatureCollection',
      features,
    };
  }, [satellites, groundStations, fsoLinks, activeBeamIds, beamPhase]);

  // Count stats
  const activeLinks = fsoLinks.filter(l => l.active);
  const islLinks = activeLinks.filter(l => l.link_type === 'sat-sat');
  const groundLinks = activeLinks.filter(l => l.link_type === 'sat-ground');

  const showSatLabels = viewState.zoom > 3;

  const handleNodeClick = useCallback((id: string, name: string, type: string, nodeType: 'satellite' | 'ground-station') => {
    setSelectedNode({ id, name, type });
    onNodeSelect?.(id, nodeType);
  }, [onNodeSelect]);

  const handleSatelliteMarkerClick = useCallback((sat: Satellite) => {
    setSelectedNode({ id: sat.id, name: sat.name, type: `${sat.altitude} km` });
    onNodeSelect?.(sat.id, 'satellite');
    beamSelectionStore.selectSatellite(sat.id);
  }, [onNodeSelect]);

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 rounded-lg overflow-hidden">
      {/* Header with legend */}
      <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-900/80 z-10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-slate-100 tracking-wide">
            Constellation Map
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: NODE_COLORS.tier1 }} />
            <span className="text-slate-300">Tier 1</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: NODE_COLORS.tier2 }} />
            <span className="text-slate-300">Tier 2</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: NODE_COLORS.tier3 }} />
            <span className="text-slate-300">Tier 3</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5" style={{ backgroundColor: NODE_COLORS.satellite, transform: 'rotate(45deg)' }} />
            <span className="text-slate-300">SAT</span>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <Map
          ref={mapRef}
          {...viewState}
          onMove={evt => setViewState(evt.viewState)}
          style={{ width: '100%', height: '100%' }}
          mapStyle={{
            version: 8,
            name: 'Dark',
            sources: {
              'carto-dark': {
                type: 'raster',
                tiles: [
                  'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                  'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                  'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                ],
                tileSize: 256,
                attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
              },
            },
            layers: [
              {
                id: 'carto-dark-layer',
                type: 'raster',
                source: 'carto-dark',
                minzoom: 0,
                maxzoom: 19,
              },
            ],
          }}
        >
          <NavigationControl position="top-left" />

          {/* Animated beam lines */}
          <Source id="beams" type="geojson" data={beamGeoJson}>
            <Layer
              id="beam-lines"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 2,
                'line-opacity': ['get', 'opacity'],
              }}
            />
          </Source>

          {/* Ground station markers — circles */}
          {groundStations.map(gs => {
            const size = getGroundStationSize(gs.tier);
            return (
              <Marker
                key={gs.id}
                longitude={gs.longitude}
                latitude={gs.latitude}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  handleNodeClick(gs.id, gs.name, `Tier ${gs.tier}`, 'ground-station');
                }}
              >
                <div
                  className="cursor-pointer transition-transform hover:scale-125"
                  style={{
                    width: size,
                    height: size,
                    backgroundColor: getTierColor(gs.tier),
                    borderRadius: '50%',
                    border: '2px solid #1F1F1F',
                    boxShadow: selectedNode?.id === gs.id ? '0 0 8px #fff' : undefined,
                  }}
                  title={gs.name}
                />
              </Marker>
            );
          })}

          {/* Satellite markers — diamonds (rotated squares) with optional labels */}
          {satellites.map(sat => (
            <Marker
              key={sat.id}
              longitude={sat.longitude}
              latitude={sat.latitude}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                handleSatelliteMarkerClick(sat);
              }}
            >
              <div className="flex flex-col items-center cursor-pointer">
                <div
                  className="transition-transform hover:scale-125"
                  style={{
                    width: 8,
                    height: 8,
                    backgroundColor: NODE_COLORS.satellite,
                    transform: 'rotate(45deg)',
                    border: '1.5px solid #1F1F1F',
                    boxShadow: selectedNode?.id === sat.id ? '0 0 8px #fff' : undefined,
                  }}
                  title={sat.name}
                />
                {showSatLabels && (
                  <span className="text-[8px] text-blue-300 mt-0.5 whitespace-nowrap select-none pointer-events-none">
                    {sat.name?.slice(0, 3).toUpperCase()}
                  </span>
                )}
              </div>
            </Marker>
          ))}
        </Map>

        {/* Selected node tooltip */}
        {selectedNode && (
          <div className="absolute top-4 right-4 bg-slate-900/95 border border-slate-700 rounded-lg p-3 z-20">
            <div className="text-sm font-semibold text-white">{selectedNode.name}</div>
            <div className="text-xs text-slate-400">{selectedNode.type}</div>
            <button
              className="mt-2 text-xs text-slate-500 hover:text-slate-300"
              onClick={() => setSelectedNode(null)}
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Stats footer */}
      <div className="p-3 bg-slate-800 border-t border-slate-700">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-6">
            <span className="text-slate-400">
              GND: <span className="text-white font-semibold">{groundStations.length}</span>
            </span>
            <span className="text-slate-400">
              SAT: <span className="text-white font-semibold">{satellites.length}</span>
            </span>
            <span className="text-slate-400">
              ISL: <span className="text-white font-semibold">{islLinks.length}</span>
            </span>
            <span className="text-slate-400">
              DL: <span className="text-white font-semibold">{groundLinks.length}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-slate-500">Beams active</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FlatMapView;
