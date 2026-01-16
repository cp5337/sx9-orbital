import { useState } from 'react';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { LoadingScreen } from './LoadingScreen';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';

interface GroundNode {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  tier: number;
  demand_gbps: number;
  weather_score: number;
  status: string;
}

interface Satellite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number;
  status: string;
}

interface Beam {
  id: string;
  beam_type: string;
  source_node_id: string;
  target_node_id: string;
  beam_status: string;
  link_quality_score: number;
  throughput_gbps: number;
}

export function FlatMapView() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const { data: groundNodes, loading: nodesLoading, error: nodesError } = useSupabaseData<GroundNode>('ground_nodes');
  const { data: satellites, loading: satsLoading, error: satsError } = useSupabaseData<Satellite>('satellites');
  const { data: beams, loading: beamsLoading, error: beamsError } = useSupabaseData<Beam>('beams');

  const isLoading = nodesLoading || satsLoading || beamsLoading;
  const hasError = nodesError || satsError || beamsError;

  if (isLoading) {
    return (
      <LoadingScreen
        message="Loading Map View"
        subMessage="Fetching ground stations, satellites, and beam data..."
      />
    );
  }

  if (hasError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-950 p-4">
        <Card className="max-w-2xl w-full bg-slate-900 border-red-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6" />
              Failed to Load Map Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {nodesError && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <p className="text-sm font-semibold text-red-300 mb-2">Ground Nodes Error:</p>
                <p className="text-sm text-slate-300">{nodesError.message}</p>
              </div>
            )}
            {satsError && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <p className="text-sm font-semibold text-red-300 mb-2">Satellites Error:</p>
                <p className="text-sm text-slate-300">{satsError.message}</p>
              </div>
            )}
            {beamsError && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <p className="text-sm font-semibold text-red-300 mb-2">Beams Error:</p>
                <p className="text-sm text-slate-300">{beamsError.message}</p>
              </div>
            )}
            <Button onClick={() => window.location.reload()}>Reload Application</Button>
            <div className="text-xs text-slate-500 bg-slate-800/50 border border-slate-700 rounded p-3">
              <p className="font-semibold mb-1">Troubleshooting:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Check Supabase connection</li>
                <li>Verify database tables exist</li>
                <li>Run "npm run seed" to populate data</li>
                <li>Check browser console for details</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (groundNodes.length === 0 && satellites.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-950 p-4">
        <Card className="max-w-2xl w-full bg-slate-900 border-yellow-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-yellow-400">
              <AlertTriangle className="w-6 h-6" />
              No Data Available
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-slate-300">
              The map cannot be displayed because there are no ground stations or satellites in the database.
            </p>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <p className="text-sm font-semibold text-slate-300 mb-2">Run this command to seed data:</p>
              <code className="text-sm text-cyan-400 bg-slate-900 px-3 py-2 rounded block">
                npm run seed
              </code>
            </div>
            <Button onClick={() => window.location.reload()}>Reload After Seeding</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const worldWidth = 1200;
  const worldHeight = 600;

  const latToY = (lat: number) => {
    return ((90 - lat) / 180) * worldHeight;
  };

  const lonToX = (lon: number) => {
    return ((lon + 180) / 360) * worldWidth;
  };

  const getTierColor = (tier: number) => {
    const colors = {
      1: '#3b82f6',
      2: '#10b981',
      3: '#eab308'
    };
    return colors[tier as keyof typeof colors] || '#6b7280';
  };

  const getBeamColor = (quality: number) => {
    if (quality > 0.8) return '#10b981';
    if (quality > 0.6) return '#eab308';
    if (quality > 0.4) return '#f97316';
    return '#ef4444';
  };

  const spaceToGroundBeams = (beams || []).filter(beam => beam.beam_type === 'space_to_ground');

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h2 className="text-xl font-semibold">SpaceWorld Map</h2>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span>Tier 1 Nodes</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Tier 2 Nodes</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span>Tier 3 Nodes</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Satellites</span>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <div className="w-full h-full min-h-[600px] flex items-center justify-center">
          <svg
            width={worldWidth}
            height={worldHeight}
            className="bg-slate-950"
            viewBox={`0 0 ${worldWidth} ${worldHeight}`}
            style={{ maxWidth: '100%', height: 'auto' }}
          >
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgb(51 65 85)" strokeWidth="0.5" />
              </pattern>
            </defs>

            <rect width={worldWidth} height={worldHeight} fill="url(#grid)" />

            <line x1="0" y1={worldHeight / 2} x2={worldWidth} y2={worldHeight / 2} stroke="rgb(71 85 105)" strokeWidth="1" strokeDasharray="4 4" />
            <line x1={worldWidth / 2} y1="0" x2={worldWidth / 2} y2={worldHeight} stroke="rgb(71 85 105)" strokeWidth="1" strokeDasharray="4 4" />

            {spaceToGroundBeams.map(beam => {
              const source = satellites?.find(s => s.id === beam.source_node_id);
              const target = groundNodes?.find(g => g.id === beam.target_node_id);

              if (!source || !target) return null;

              const x1 = lonToX(source.longitude);
              const y1 = latToY(source.latitude);
              const x2 = lonToX(target.longitude);
              const y2 = latToY(target.latitude);

              return (
                <line
                  key={beam.id}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={getBeamColor(beam.link_quality_score)}
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  opacity="0.6"
                />
              );
            })}

            {groundNodes?.map(node => {
              const x = lonToX(node.longitude);
              const y = latToY(node.latitude);
              const size = node.tier === 1 ? 8 : node.tier === 2 ? 6 : 5;
              const color = getTierColor(node.tier);

              return (
                <g key={node.id}>
                  <circle
                    cx={x}
                    cy={y}
                    r={size}
                    fill={color}
                    stroke={node.status === 'active' ? 'white' : '#ef4444'}
                    strokeWidth="2"
                    className="cursor-pointer transition-all hover:r-10"
                    onMouseEnter={() => setSelectedNode(node.id)}
                    onMouseLeave={() => setSelectedNode(null)}
                  />
                  {node.weather_score < 0.5 && (
                    <circle
                      cx={x}
                      cy={y}
                      r={size + 4}
                      fill="none"
                      stroke="rgb(245 158 11)"
                      strokeWidth="2"
                      opacity="0.5"
                    />
                  )}
                  {selectedNode === node.id && (
                    <g>
                      <rect
                        x={x + 10}
                        y={y - 25}
                        width="150"
                        height="40"
                        fill="rgb(15 23 42)"
                        stroke="rgb(71 85 105)"
                        strokeWidth="1"
                        rx="4"
                      />
                      <text x={x + 15} y={y - 10} fill="white" fontSize="12" fontWeight="bold">
                        {node.name}
                      </text>
                      <text x={x + 15} y={y + 5} fill="rgb(148 163 184)" fontSize="10">
                        Tier {node.tier} | {node.demand_gbps} Gbps
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {satellites?.map(sat => {
              const x = lonToX(sat.longitude);
              const y = latToY(sat.latitude);

              return (
                <g key={sat.id}>
                  <circle
                    cx={x}
                    cy={y}
                    r="6"
                    fill="#ef4444"
                    stroke="white"
                    strokeWidth="2"
                    className="cursor-pointer"
                    onMouseEnter={() => setSelectedNode(sat.id)}
                    onMouseLeave={() => setSelectedNode(null)}
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r="10"
                    fill="none"
                    stroke="rgb(239 68 68)"
                    strokeWidth="1"
                    opacity="0.3"
                  />
                  {selectedNode === sat.id && (
                    <g>
                      <rect
                        x={x + 10}
                        y={y - 25}
                        width="120"
                        height="40"
                        fill="rgb(15 23 42)"
                        stroke="rgb(71 85 105)"
                        strokeWidth="1"
                        rx="4"
                      />
                      <text x={x + 15} y={y - 10} fill="white" fontSize="12" fontWeight="bold">
                        {sat.name}
                      </text>
                      <text x={x + 15} y={y + 5} fill="rgb(148 163 184)" fontSize="10">
                        Alt: {sat.altitude} km
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            <text x="10" y="20" fill="rgb(148 163 184)" fontSize="12">90°N</text>
            <text x="10" y={worldHeight - 10} fill="rgb(148 163 184)" fontSize="12">90°S</text>
            <text x="10" y={worldHeight / 2 + 5} fill="rgb(148 163 184)" fontSize="12">0°</text>
            <text x={worldWidth - 40} y={worldHeight / 2 + 5} fill="rgb(148 163 184)" fontSize="12">180°</text>
          </svg>
        </div>
      </div>

      <div className="p-4 bg-slate-800 border-t border-slate-700">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            <span className="text-slate-400">
              Ground Nodes: <span className="text-white font-semibold">{groundNodes?.length || 0}</span>
            </span>
            <span className="text-slate-400">
              Satellites: <span className="text-white font-semibold">{satellites?.length || 0}</span>
            </span>
            <span className="text-slate-400">
              Active Beams: <span className="text-white font-semibold">{spaceToGroundBeams.length}</span>
            </span>
          </div>
          <span className="text-xs text-slate-500">Hover over nodes for details</span>
        </div>
      </div>
    </div>
  );
}
