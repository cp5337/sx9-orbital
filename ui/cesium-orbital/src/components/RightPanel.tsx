import { useState } from 'react';
import { ChevronLeft, Layers, Play, Pause, RotateCcw } from 'lucide-react';
import { Slider } from './ui/slider';

export interface LayerConfig {
  id: string;
  label: string;
  visible: boolean;
  color: string;
  opacity: number;
}

interface RightPanelProps {
  layers: LayerConfig[];
  onLayerToggle: (layerId: string, visible: boolean) => void;
  onLayerOpacityChange: (layerId: string, opacity: number) => void;
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
  timeControl,
  onPlayPause,
  onSpeedChange,
  onReset,
}: RightPanelProps) {
  void _onLayerOpacityChange;
  const [isCollapsed, setIsCollapsed] = useState(false);

  const renderLayerItem = (layer: LayerConfig) => (
    <label key={layer.id} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-700 cursor-pointer">
      <input
        type="checkbox"
        checked={layer.visible}
        onChange={(e) => onLayerToggle(layer.id, e.target.checked)}
        className="w-3 h-3 rounded border-gray-600 bg-gray-700 text-blue-500"
      />
      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: layer.color }} />
      {!isCollapsed && <span className="text-gray-300">{layer.label}</span>}
    </label>
  );

  return (
    <div className={`${isCollapsed ? 'w-12' : 'w-36'} h-full bg-gray-800 text-gray-300 fixed right-0 top-0 overflow-y-auto transition-all duration-300 border-l border-gray-700`}>
      {/* Collapse Toggle */}
      <div className="absolute top-2 right-2 z-50">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700"
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          <ChevronLeft
            size={14}
            className={`transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      <div className="p-4 pt-10">
        {!isCollapsed ? (
          <h2 className="text-base font-bold">Layers</h2>
        ) : (
          <div className="flex justify-center">
            <Layers size={14} className="text-gray-400" />
          </div>
        )}
      </div>

      {/* Layers */}
      <nav className="mt-2">
        {layers.map(renderLayerItem)}

        <div className="border-t border-gray-600 my-2 mx-3"></div>

        {/* Time Controls */}
        {!isCollapsed && (
          <div className="px-3">
            <div className="text-xs text-gray-500 mb-2">Time Control</div>
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={onPlayPause}
                className={`p-1.5 rounded ${
                  timeControl.isPlaying
                    ? 'bg-green-900/30 text-green-500'
                    : 'text-gray-400 hover:bg-gray-700'
                }`}
              >
                {timeControl.isPlaying ? <Pause size={12} /> : <Play size={12} />}
              </button>
              <button
                onClick={onReset}
                className="p-1.5 rounded text-gray-400 hover:bg-gray-700"
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
              className="p-2 hover:bg-gray-700 rounded"
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
      </nav>
    </div>
  );
}
