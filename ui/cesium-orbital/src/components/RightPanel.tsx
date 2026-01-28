import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, Pause, RotateCcw } from 'lucide-react';
import { Slider } from './ui/slider';

export interface LayerConfig {
  id: string;
  label: string;
  visible: boolean;
  color: string;
  opacity: number;
}

export interface BeamTuning {
  pulseRate: number;
  color: string;
  highlight: boolean;
  highlightSatellite: boolean;
}

const DEFAULT_BEAM_TUNING: BeamTuning = {
  pulseRate: 10,
  color: '#0000ff',
  highlight: false,
  highlightSatellite: false,
};

interface RightPanelProps {
  layers: LayerConfig[];
  onLayerToggle: (layerId: string, visible: boolean) => void;
  onLayerOpacityChange: (layerId: string, opacity: number) => void;
  satellites?: Array<{ id: string; name: string; status?: string }>;
  onBeamTuningChange?: (satelliteId: string, tuning: BeamTuning) => void;
  timeControl: {
    isPlaying: boolean;
    speed: number;
  };
  onPlayPause: () => void;
  onSpeedChange: (speed: number) => void;
  onReset: () => void;
}

export function RightPanel({
  layers,
  onLayerToggle,
  onLayerOpacityChange: _onLayerOpacityChange,
  satellites,
  onBeamTuningChange,
  timeControl,
  onPlayPause,
  onSpeedChange,
  onReset,
}: RightPanelProps) {
  void _onLayerOpacityChange;
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedSatellites, setExpandedSatellites] = useState<Set<string>>(new Set());
  const [beamTunings, setBeamTunings] = useState<Map<string, BeamTuning>>(new Map());

  const satelliteList = useMemo(() => satellites ?? [], [satellites]);

  useEffect(() => {
    if (!satelliteList.length) return;
    setBeamTunings((prev) => {
      const next = new Map(prev);
      satelliteList.forEach((sat) => {
        if (!next.has(sat.id)) {
          next.set(sat.id, DEFAULT_BEAM_TUNING);
        }
      });
      Array.from(next.keys()).forEach((key) => {
        if (!satelliteList.find((sat) => sat.id === key)) {
          next.delete(key);
        }
      });
      return next;
    });
  }, [satelliteList]);

  const updateBeamTuning = (satelliteId: string, updates: Partial<BeamTuning>) => {
    setBeamTunings((prev) => {
      const next = new Map(prev);
      const current = next.get(satelliteId) ?? DEFAULT_BEAM_TUNING;
      const updated = { ...current, ...updates };
      next.set(satelliteId, updated);
      onBeamTuningChange?.(satelliteId, updated);
      return next;
    });
  };

  const toggleExpanded = (satelliteId: string) => {
    setExpandedSatellites((prev) => {
      const next = new Set(prev);
      if (next.has(satelliteId)) {
        next.delete(satelliteId);
      } else {
        next.add(satelliteId);
      }
      return next;
    });
  };

  const renderLayerItem = (layer: LayerConfig) => (
    <label key={layer.id} className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-gray-800 cursor-pointer">
      <input
        type="checkbox"
        checked={layer.visible}
        onChange={(e) => onLayerToggle(layer.id, e.target.checked)}
        className="w-3 h-3 rounded-sm border-gray-600 bg-gray-800 text-blue-500"
      />
      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: layer.color }} />
      {!isCollapsed && <span className="text-gray-300">{layer.label}</span>}
    </label>
  );

  return (
    <div className={`${isCollapsed ? 'w-12' : 'w-48'} h-full bg-gray-900 text-gray-300 fixed right-0 top-0 overflow-y-auto transition-all duration-300 border-l border-gray-800`}>
      {/* Collapse Toggle */}
      <div className="absolute top-2 right-2 z-50">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-gray-400 hover:text-white p-1 rounded-sm hover:bg-gray-800"
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {isCollapsed ? (
            <ChevronLeft size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
        </button>
      </div>

      <div className="p-3 pt-10" />

      {/* Layers */}
      <nav className="mt-1">
        {layers.map(renderLayerItem)}

        <div className="border-t border-gray-800 my-2 mx-2"></div>

        {/* Time Controls */}
        {!isCollapsed && (
          <div className="px-2">
            <div className="text-[10px] text-gray-500 mb-1">Time Control</div>
            <div className="flex items-center gap-2 mb-1.5">
              <button
                onClick={onPlayPause}
                className={`p-1 rounded-sm ${
                  timeControl.isPlaying
                    ? 'bg-green-900/30 text-green-500'
                    : 'text-gray-400 hover:bg-gray-800'
                }`}
              >
                {timeControl.isPlaying ? <Pause size={12} /> : <Play size={12} />}
              </button>
              <button
                onClick={onReset}
                className="p-1 rounded-sm text-gray-400 hover:bg-gray-800"
              >
                <RotateCcw size={12} />
              </button>
              <span className="text-xs text-gray-400 ml-auto">{timeControl.speed}x</span>
            </div>
            <Slider
              value={[timeControl.speed]}
              onValueChange={([value]) => onSpeedChange(value)}
              min={0.1}
              max={100}
              step={0.1}
              className="w-full"
            />
          </div>
        )}

        {/* Collapsed play button */}
        {isCollapsed && (
          <div className="flex justify-center mt-2">
            <button
              onClick={onPlayPause}
              className="p-2 hover:bg-gray-800 rounded-sm"
              title={timeControl.isPlaying ? 'Pause' : 'Play'}
            >
              {timeControl.isPlaying ? (
                <Pause size={14} className="text-green-500" />
              ) : (
                <Play size={14} className="text-gray-400" />
              )}
            </button>
          </div>
        )}

        {!isCollapsed && satelliteList.length > 0 && (
          <>
            <div className="border-t border-gray-800 my-2 mx-2"></div>
            <div className="px-2">
              <div className="text-[10px] text-gray-500 mb-2">Quick Bird Jump</div>
              <div className="grid grid-cols-3 gap-1 mb-2">
                {satelliteList.slice(0, 6).map((sat) => (
                  <button
                    key={`quick-${sat.id}`}
                    onClick={() => toggleExpanded(sat.id)}
                    className="px-1.5 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-sm text-[10px] text-gray-300 transition-colors"
                    title={`Jump to ${sat.name}`}
                  >
                    {sat.name?.slice(0, 3)}
                  </button>
                ))}
              </div>
              {satelliteList.length > 6 && (
                <div className="grid grid-cols-3 gap-1 mb-2">
                  {satelliteList.slice(6, 12).map((sat) => (
                    <button
                      key={`quick-${sat.id}`}
                      onClick={() => toggleExpanded(sat.id)}
                      className="px-1.5 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-sm text-[10px] text-gray-300 transition-colors"
                      title={`Jump to ${sat.name}`}
                    >
                      {sat.name?.slice(0, 3)}
                    </button>
                  ))}
                </div>
              )}

              <div className="text-[10px] text-gray-500 mb-2">Beam Tuning</div>
              <div className="space-y-2">
                {satelliteList.map((sat) => {
                  const tuning = beamTunings.get(sat.id) ?? DEFAULT_BEAM_TUNING;
                  const isExpanded = expandedSatellites.has(sat.id);
                  return (
                    <div key={sat.id} className="rounded-sm border border-gray-800 bg-gray-900/50">
                      <button
                        onClick={() => toggleExpanded(sat.id)}
                        onDoubleClick={() => updateBeamTuning(sat.id, { highlightSatellite: true, highlight: true })}
                        className="w-full flex items-center justify-between px-2 py-1 text-xs text-gray-300 hover:bg-gray-800/60"
                      >
                        <span className="truncate">{sat.name}</span>
                        <span className={`text-[10px] ${sat.status === 'active' ? 'text-green-400' : 'text-gray-500'}`}>
                          {sat.status ?? 'unknown'}
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="px-2 pb-2 space-y-2">
                          <div className="grid grid-cols-2 gap-1">
                            <button
                              onClick={() => updateBeamTuning(sat.id, { highlightSatellite: !tuning.highlightSatellite })}
                              className={`px-2 py-1 rounded-sm text-[10px] border ${
                                tuning.highlightSatellite
                                  ? 'bg-blue-600/20 text-blue-300 border-blue-500/30'
                                  : 'bg-gray-800 text-gray-400 border-gray-700'
                              }`}
                            >
                              Satellite
                            </button>
                            <button
                              onClick={() => updateBeamTuning(sat.id, { highlight: !tuning.highlight })}
                              className={`px-2 py-1 rounded-sm text-[10px] border ${
                                tuning.highlight
                                  ? 'bg-blue-600/20 text-blue-300 border-blue-500/30'
                                  : 'bg-gray-800 text-gray-400 border-gray-700'
                              }`}
                            >
                              Beam
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-gray-400">
                            <span>Pulse</span>
                            <span className="font-mono text-gray-200">{tuning.pulseRate} Hz</span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={100}
                            step={1}
                            value={tuning.pulseRate}
                            onChange={(e) => updateBeamTuning(sat.id, { pulseRate: Number(e.target.value) })}
                            className="w-full h-1 bg-gray-800 rounded-sm appearance-none cursor-pointer"
                          />
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] text-gray-400">Color</label>
                            <input
                              type="color"
                              value={tuning.color}
                              onChange={(e) => updateBeamTuning(sat.id, { color: e.target.value })}
                              className="h-6 w-10 bg-transparent border border-gray-700 rounded-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </nav>
    </div>
  );
}
