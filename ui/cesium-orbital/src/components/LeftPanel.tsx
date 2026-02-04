import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Globe, Activity, Satellite, Radio, Zap, Target } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Separator } from './ui/separator';

type WorldType = 'production' | 'staging' | 'sandbox' | 'fusion';
type PanelMode = 'worlds' | 'feed';

// Greek alphabet for satellite short names
const GREEK = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ'];

interface SatelliteStatus {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'eclipse';
  currentTarget?: string;
  currentTargetName?: string;
  elevation?: number;
  azimuth?: number;
  marginDb?: number;
}

interface GroundStationStatus {
  id: string;
  name: string;
  status: 'tracking' | 'slewing' | 'idle';
  trackingSatellite?: string;
  trackingSatelliteName?: string;
  azimuth: number;
  elevation: number;
  weatherScore: number;
}

interface LeftPanelProps {
  currentWorld: WorldType;
  onWorldChange: (world: WorldType) => void;
  stats: {
    groundStations: number;
    satellites: number;
    activeLinks: number;
  };
  satelliteStatuses?: SatelliteStatus[];
  groundStationStatuses?: GroundStationStatus[];
  onSatelliteSelect?: (satId: string) => void;
  onStationSelect?: (stationId: string) => void;
}

export function LeftPanel({
  currentWorld,
  onWorldChange,
  stats,
  satelliteStatuses = [],
  groundStationStatuses = [],
  onSatelliteSelect,
  onStationSelect,
}: LeftPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [mode, setMode] = useState<PanelMode>('worlds');
  const [expandedSat, setExpandedSat] = useState<string | null>(null);

  const worlds: { id: WorldType; label: string; color: string; icon: typeof Globe }[] = [
    { id: 'production', label: 'Production', color: 'text-green-400 border-green-400/50', icon: Globe },
    { id: 'staging', label: 'Staging', color: 'text-blue-400 border-blue-400/50', icon: Globe },
    { id: 'sandbox', label: 'Sandbox', color: 'text-yellow-400 border-yellow-400/50', icon: Globe },
    { id: 'fusion', label: 'Fusion View', color: 'text-purple-400 border-purple-400/50', icon: Globe },
  ];

  const navItems = [
    { id: 'worlds', icon: Globe, label: 'Worlds', color: 'text-cyan-400' },
    { id: 'feed', icon: Satellite, label: 'Mission Feed', color: 'text-blue-400' },
  ];

  // Count active beams and tracking stations
  const activeBeams = satelliteStatuses.filter(s => s.currentTarget).length;
  const trackingStations = groundStationStatuses.filter(g => g.status === 'tracking').length;

  if (isCollapsed) {
    return (
      <motion.div
        initial={false}
        animate={{ width: 64 }}
        className="fixed left-0 top-0 h-screen bg-slate-900/95 backdrop-blur-xl border-r border-slate-700/50 z-40 flex flex-col items-center py-4"
      >
        <button
          onClick={() => setIsCollapsed(false)}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 w-6 h-24 bg-slate-800/90 hover:bg-slate-700/90 border border-slate-600/50 hover:border-cyan-400/50 rounded-r-lg shadow-lg transition-all duration-200 flex items-center justify-center group touch-manipulation"
          aria-label="Expand panel"
        >
          <div className="flex flex-col gap-1">
            <div className="w-0.5 h-3 bg-slate-500 group-hover:bg-cyan-400 rounded transition-colors" />
            <div className="w-0.5 h-3 bg-slate-500 group-hover:bg-cyan-400 rounded transition-colors" />
            <div className="w-0.5 h-3 bg-slate-500 group-hover:bg-cyan-400 rounded transition-colors" />
          </div>
        </button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          className="mb-4 hover:bg-slate-800"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>

        {/* Nav icons */}
        <div className="flex flex-col gap-2 mb-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = mode === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setMode(item.id as PanelMode);
                  setIsCollapsed(false);
                }}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                  isActive
                    ? 'bg-slate-800 border border-cyan-400/50'
                    : 'bg-slate-800/50 border border-transparent hover:border-slate-600'
                }`}
                title={item.label}
              >
                <Icon className={`w-5 h-5 ${isActive ? item.color : 'text-slate-400'}`} />
              </button>
            );
          })}
        </div>

        <Separator className="bg-slate-700/50 w-8 my-2" />

        {/* World selection icons */}
        <div className="flex flex-col gap-2">
          {worlds.map((world) => {
            const Icon = world.icon;
            const isActive = currentWorld === world.id;
            return (
              <button
                key={world.id}
                onClick={() => onWorldChange(world.id)}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                  isActive
                    ? `bg-slate-800 border ${world.color}`
                    : 'bg-slate-800/50 border border-transparent hover:border-slate-600'
                }`}
                title={world.label}
              >
                <Icon className={`w-5 h-5 ${isActive ? world.color.split(' ')[0] : 'text-slate-400'}`} />
              </button>
            );
          })}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={false}
      animate={{ width: 300 }}
      className="fixed left-0 top-0 h-screen bg-slate-900/95 backdrop-blur-xl border-r border-slate-700/50 z-40 overflow-y-auto"
    >
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-cyan-400" />
            <h2 className="font-bold text-lg">SX9 Orbital</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(true)}
            className="hover:bg-slate-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 p-1 bg-slate-800/50 rounded-lg">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setMode(item.id as PanelMode)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  mode === item.id
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon size={14} />
                {item.label}
              </button>
            );
          })}
        </div>

        <Separator className="bg-slate-700/50" />

        {/* World Selection Mode */}
        {mode === 'worlds' && (
          <>
            <div>
              <h3 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">World Selection</h3>
              <div className="space-y-2">
                {worlds.map((world) => {
                  const Icon = world.icon;
                  const isActive = currentWorld === world.id;
                  return (
                    <Button
                      key={world.id}
                      variant={isActive ? 'default' : 'ghost'}
                      className={`w-full justify-start ${
                        isActive
                          ? `bg-slate-800 border ${world.color} hover:bg-slate-800/80`
                          : 'hover:bg-slate-800'
                      }`}
                      onClick={() => onWorldChange(world.id)}
                    >
                      <Icon className={`w-4 h-4 mr-2 ${isActive ? world.color.split(' ')[0] : 'text-slate-400'}`} />
                      {world.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <Separator className="bg-slate-700/50" />

            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-300">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-green-400" />
                    <span className="text-xs text-slate-400">Ground Stations</span>
                  </div>
                  <span className="font-bold text-green-400">{stats.groundStations}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Satellite className="w-4 h-4 text-blue-400" />
                    <span className="text-xs text-slate-400">Satellites</span>
                  </div>
                  <span className="font-bold text-blue-400">{stats.satellites}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs text-slate-400">Active Links</span>
                  </div>
                  <span className="font-bold text-cyan-400">{stats.activeLinks}</span>
                </div>
              </CardContent>
            </Card>

            <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">Current World</div>
              <div className="font-semibold">{worlds.find(w => w.id === currentWorld)?.label}</div>
            </div>
          </>
        )}

        {/* Mission Feed Mode */}
        {mode === 'feed' && (
          <>
            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-800/50 rounded-lg px-2 py-2">
                <div className="text-xl font-bold text-cyan-400">{activeBeams}</div>
                <div className="text-[9px] text-slate-500 uppercase">Beams</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg px-2 py-2">
                <div className="text-xl font-bold text-green-400">{trackingStations}</div>
                <div className="text-[9px] text-slate-500 uppercase">Tracking</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg px-2 py-2">
                <div className="text-xl font-bold text-blue-400">{satelliteStatuses.length || stats.satellites}</div>
                <div className="text-[9px] text-slate-500 uppercase">Birds</div>
              </div>
            </div>

            <Separator className="bg-slate-700/50" />

            {/* Constellation status */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Satellite className="w-4 h-4 text-blue-400" />
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Constellation</h3>
              </div>

              <div className="space-y-1.5">
                {(satelliteStatuses.length > 0 ? satelliteStatuses :
                  // Mock data if no real data
                  Array.from({ length: stats.satellites || 12 }, (_, i) => ({
                    id: `sat-${i + 1}`,
                    name: `MEO-${String(i + 1).padStart(3, '0')}`,
                    status: i < 4 ? 'active' : 'idle' as const,
                    currentTarget: i < 4 ? `GS-${i + 1}` : undefined,
                    currentTargetName: i < 4 ? ['Singapore', 'London', 'New York', 'Tokyo'][i] : undefined,
                    elevation: i < 4 ? 30 + Math.random() * 50 : undefined,
                    azimuth: i < 4 ? Math.random() * 360 : undefined,
                    marginDb: i < 4 ? 3 + Math.random() * 6 : undefined,
                  }))
                ).map((sat, idx) => {
                  const greek = GREEK[idx] || `#${idx + 1}`;
                  const isExpanded = expandedSat === sat.id;

                  return (
                    <div
                      key={sat.id}
                      className={`rounded-lg border transition-all overflow-hidden ${
                        sat.currentTarget
                          ? 'border-cyan-500/30 bg-cyan-950/20'
                          : 'border-slate-700/50 bg-slate-800/30'
                      }`}
                    >
                      <button
                        onClick={() => {
                          setExpandedSat(isExpanded ? null : sat.id);
                          onSatelliteSelect?.(sat.id);
                        }}
                        className="w-full flex items-center gap-2 p-2 text-left hover:bg-slate-800/50 transition-all"
                      >
                        {/* Greek letter badge */}
                        <div className={`w-7 h-7 rounded flex items-center justify-center text-sm font-bold ${
                          sat.currentTarget ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-700 text-slate-400'
                        }`}>
                          {greek}
                        </div>

                        {/* Satellite info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium truncate">{sat.name}</span>
                            {sat.currentTarget && (
                              <Zap size={10} className="text-cyan-400 animate-pulse flex-shrink-0" />
                            )}
                          </div>
                          <div className="text-[10px] truncate">
                            {sat.currentTarget ? (
                              <span className="text-cyan-300">
                                <Target size={9} className="inline mr-1" />
                                {sat.currentTargetName || sat.currentTarget}
                              </span>
                            ) : (
                              <span className="text-slate-500">idle</span>
                            )}
                          </div>
                        </div>

                        {/* Margin badge */}
                        {sat.marginDb !== undefined && (
                          <div className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            sat.marginDb >= 6 ? 'bg-green-900/40 text-green-400' :
                            sat.marginDb >= 3 ? 'bg-yellow-900/40 text-yellow-400' :
                            'bg-red-900/40 text-red-400'
                          }`}>
                            {sat.marginDb.toFixed(1)}dB
                          </div>
                        )}
                      </button>

                      {/* Expanded details */}
                      {isExpanded && sat.currentTarget && (
                        <div className="px-2 pb-2 pt-1 border-t border-slate-700/30">
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div className="bg-slate-800/50 rounded p-1.5">
                              <div className="text-slate-500">Elevation</div>
                              <div className="font-mono text-cyan-300">
                                {sat.elevation !== undefined ? `${sat.elevation.toFixed(1)}°` : '--'}
                              </div>
                            </div>
                            <div className="bg-slate-800/50 rounded p-1.5">
                              <div className="text-slate-500">Azimuth</div>
                              <div className="font-mono text-cyan-300">
                                {sat.azimuth !== undefined ? `${sat.azimuth.toFixed(1)}°` : '--'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ground stations tracking */}
            {groundStationStatuses.length > 0 && (
              <>
                <Separator className="bg-slate-700/50" />
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Radio className="w-4 h-4 text-green-400" />
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ground Tracking</h3>
                  </div>

                  <div className="space-y-1">
                    {groundStationStatuses.filter(gs => gs.status === 'tracking').map((gs) => (
                      <button
                        key={gs.id}
                        onClick={() => onStationSelect?.(gs.id)}
                        className="w-full flex items-center gap-2 p-2 rounded-lg bg-slate-800/30 border border-green-500/20 hover:bg-slate-800/50 text-left"
                      >
                        <Radio size={14} className="text-green-400" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{gs.name}</div>
                          <div className="text-[10px] text-green-300 truncate">
                            → {gs.trackingSatelliteName || gs.trackingSatellite}
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {gs.elevation.toFixed(0)}°/{gs.azimuth.toFixed(0)}°
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
