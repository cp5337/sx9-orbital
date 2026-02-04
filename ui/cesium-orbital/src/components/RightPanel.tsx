import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownFromLine,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Layers,
  Orbit,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Satellite,
  Shield,
  Zap,
} from 'lucide-react';
import { Slider } from './ui/slider';
import { beamSelectionStore } from '@/store/beamSelectionStore';

export interface LayerConfig {
  id: string;
  label: string;
  visible: boolean;
  color: string;
  opacity: number;
  children?: LayerConfig[];
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
  const [satelliteSectionOpen, setSatelliteSectionOpen] = useState(false);

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

  const handleSatelliteClick = (satelliteId: string) => {
    beamSelectionStore.selectSatellite(satelliteId);
  };

  // Layer icons and short labels — mirrors left nav pattern
  const LAYER_ICONS: Record<string, React.ElementType> = {
    groundStations: Radio,
    satellites: Satellite,
    orbits: Orbit,
    radiationBelts: Shield,
    orbitalZones: Layers,
    fsoSatSat: Zap,
    fsoSatGround: ArrowDownFromLine,
  };

  const LAYER_SHORT: Record<string, string> = {
    groundStations: 'GND',
    satellites: 'SAT',
    orbits: 'ORB',
    radiationBelts: 'RAD',
    orbitalZones: 'ZNE',
    fsoSatSat: 'ISL',
    fsoSatGround: 'DL',
  };

  const renderLayerItem = (layer: LayerConfig) => {
    const Icon = LAYER_ICONS[layer.id] || Radio;
    const shortLabel = LAYER_SHORT[layer.id] || layer.label;

    if (isCollapsed) {
      return (
        <div
          key={layer.id}
          onClick={() => onLayerToggle(layer.id, !layer.visible)}
          className="px-3 py-2 text-xs cursor-pointer flex flex-col items-center"
          title={`${layer.label} ${layer.visible ? '(on)' : '(off)'}`}
        >
          <Icon
            className="w-3.5 h-3.5"
            style={{
              color: layer.color,
              opacity: layer.visible ? 1 : 0.25,
            }}
          />
          <span
            className={`text-[9px] mt-0.5 ${layer.visible ? 'text-gray-400' : 'text-gray-600'}`}
          >
            {shortLabel}
          </span>
        </div>
      );
    }

    return (
      <label key={layer.id} className="px-3 py-2 text-xs cursor-pointer flex items-center gap-2 hover:bg-gray-800">
        <Icon className="w-3.5 h-3.5" style={{ color: layer.color, opacity: layer.visible ? 1 : 0.4 }} />
        <input
          type="checkbox"
          checked={layer.visible}
          onChange={(e) => onLayerToggle(layer.id, e.target.checked)}
          className="w-3 h-3 rounded-sm border-gray-600 bg-gray-800 text-blue-500"
        />
        <span className={layer.visible ? 'text-gray-300' : 'text-gray-500'}>{layer.label}</span>
      </label>
    );
  };

  return (
    <div className={`${isCollapsed ? 'w-12' : 'w-48'} h-full bg-gray-900 text-gray-300 fixed right-0 top-0 overflow-y-auto transition-all duration-300 border-l border-gray-800 flex flex-col`}>
      {/* Header — mirrors left nav structure */}
      <div className="px-4 pt-3 pb-2">
        {!isCollapsed && (
          <div>
            <span className="text-sm font-medium text-white">Controls</span>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`mt-2 p-1 rounded hover:bg-gray-800 ${isCollapsed ? 'mx-auto' : ''}`}
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {isCollapsed ? (
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </button>
      </div>

      {/* Layers */}
      <nav className="flex-1">
        <div className="px-4 pt-3 pb-1 text-[10px] text-gray-500 uppercase tracking-wider">
          {!isCollapsed && 'Layers'}
        </div>
        {layers.map(renderLayerItem)}

        {/* Time Controls */}
        <div className="px-4 pt-3 pb-1 text-[10px] text-gray-500 uppercase tracking-wider">
          {!isCollapsed && 'Time'}
        </div>
        {!isCollapsed && (
          <div className="px-3">
            <div className="flex items-center gap-1 mb-1.5">
              <button
                onClick={onPlayPause}
                className={`p-1.5 rounded-sm ${
                  timeControl.isPlaying
                    ? 'bg-green-900/30 text-green-500'
                    : 'text-gray-400 hover:bg-gray-800'
                }`}
                title={timeControl.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {timeControl.isPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                onClick={onReset}
                className="px-2 py-1 rounded-sm text-gray-400 hover:bg-gray-800 flex items-center gap-1 text-[10px] border border-gray-700"
                title="Reset view to home (H)"
              >
                <RotateCcw size={10} />
                Home
              </button>
              <span className="text-xs text-gray-400 ml-auto">{timeControl.speed}x</span>
            </div>
            <Slider
              value={[timeControl.speed]}
              onValueChange={([value]) => onSpeedChange(value)}
              min={1}
              max={3600}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-[9px] text-gray-500 mt-1">
              <span>1x</span>
              <span>60x = 1hr/min</span>
              <span>3600x</span>
            </div>
          </div>
        )}

        {/* Collapsed play button + satellite count */}
        {isCollapsed && (
          <div className="flex flex-col items-center gap-2 mt-2">
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
            <button
              onClick={onReset}
              className="p-1 hover:bg-gray-800 rounded-sm"
              title="Reset view (Home)"
            >
              <RotateCcw size={12} className="text-gray-400" />
            </button>
            {satelliteList.length > 0 && (
              <div
                className="text-[9px] text-cyan-400 font-mono mt-1"
                title={`${satelliteList.length} satellites`}
              >
                {satelliteList.length}
              </div>
            )}
          </div>
        )}

        {/* Satellites section — collapsed by default */}
        {!isCollapsed && satelliteList.length > 0 && (
          <>
            <div className="px-4 pt-3 pb-1 text-[10px] text-gray-500 uppercase tracking-wider">
              Satellites
            </div>
            <div className="px-3">
              <button
                onClick={() => setSatelliteSectionOpen(!satelliteSectionOpen)}
                className="w-full flex items-center justify-between text-[10px] text-gray-400 py-1 hover:text-gray-200"
              >
                <span>{satelliteList.length} active</span>
                {satelliteSectionOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>

              {satelliteSectionOpen && (
                <div className="space-y-1.5 mt-1">
                  {satelliteList.map((sat) => {
                    const tuning = beamTunings.get(sat.id) ?? DEFAULT_BEAM_TUNING;
                    const isExpanded = expandedSatellites.has(sat.id);
                    return (
                      <div key={sat.id} className="rounded-sm border border-gray-800 bg-gray-900/50">
                        <button
                          onClick={() => toggleExpanded(sat.id)}
                          onDoubleClick={() => updateBeamTuning(sat.id, { highlightSatellite: true, highlight: true })}
                          className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-gray-300 hover:bg-gray-800/60"
                        >
                          <span
                            className="truncate cursor-pointer hover:text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSatelliteClick(sat.id);
                            }}
                          >
                            {sat.name}
                          </span>
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
              )}
            </div>
          </>
        )}
      </nav>
    </div>
  );
}
