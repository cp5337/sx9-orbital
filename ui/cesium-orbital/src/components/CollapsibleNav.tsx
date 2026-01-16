import { useState } from 'react';
import {
  Globe, Map, Layout, Bug, Settings, Satellite, Radio, Zap, Eye,
  ChevronRight, BarChart3, Cpu
} from 'lucide-react';

interface CollapsibleNavProps {
  currentView: string;
  onViewChange: (view: '3d' | 'map' | 'dashboard') => void;
  onDiagnosticsOpen?: () => void;
}

export function CollapsibleNav({ currentView, onViewChange, onDiagnosticsOpen }: CollapsibleNavProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const renderMenuItem = (item: { id: string; icon: any; label: string; action?: () => void }) => {
    const Icon = item.icon;
    const isActive = currentView === item.id;
    const handleClick = () => {
      if (item.action) {
        item.action();
      } else if (['3d', 'map', 'dashboard'].includes(item.id)) {
        onViewChange(item.id as '3d' | 'map' | 'dashboard');
      }
    };

    return (
      <button
        key={item.id}
        onClick={handleClick}
        className={`flex items-center w-full px-3 py-1.5 text-xs ${
          isActive ? 'bg-gray-700 text-white' : 'hover:bg-gray-700'
        }`}
        title={isCollapsed ? item.label : undefined}
      >
        <span className="w-4"><Icon size={14} /></span>
        {!isCollapsed && <span className="ml-2">{item.label}</span>}
      </button>
    );
  };

  const renderSeparator = () => (
    <div className="border-t border-gray-600 my-2 mx-3"></div>
  );

  // Views Section
  const viewsSection = [
    { id: 'dashboard', icon: Layout, label: 'Dashboard' },
    { id: '3d', icon: Globe, label: '3D Globe' },
    { id: 'map', icon: Map, label: 'Flat Map' },
  ];

  // Constellation Section
  const constellationSection = [
    { id: 'satellites', icon: Satellite, label: 'Satellites' },
    { id: 'ground-stations', icon: Radio, label: 'Ground Stations' },
    { id: 'fso-links', icon: Zap, label: 'FSO Links' },
    { id: 'coverage', icon: Eye, label: 'Coverage' },
  ];

  // System Section
  const systemSection = [
    { id: 'wasm', icon: Cpu, label: 'WASM Test' },
    { id: 'telemetry', icon: BarChart3, label: 'Telemetry' },
    { id: 'diagnostics', icon: Bug, label: 'Diagnostics', action: onDiagnosticsOpen },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className={`${isCollapsed ? 'w-12' : 'w-36'} h-full bg-gray-800 text-gray-300 fixed left-0 top-0 overflow-y-auto transition-all duration-300 border-r border-gray-700`}>
      {/* Collapse Toggle */}
      <div className="absolute top-2 left-2 z-50">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700"
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          <ChevronRight
            size={14}
            className={`transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`}
          />
        </button>
      </div>

      <div className="p-4 pt-10">
        {!isCollapsed && (
          <div>
            <h2 className="text-base font-bold">Orbital</h2>
            <p className="text-xs text-gray-400">v1.0.0</p>
          </div>
        )}
      </div>

      <nav className="mt-2">
        {/* Views */}
        {viewsSection.map(renderMenuItem)}

        {renderSeparator()}

        {/* Constellation */}
        {constellationSection.map(renderMenuItem)}

        {renderSeparator()}

        {/* System */}
        {systemSection.map(renderMenuItem)}
      </nav>
    </div>
  );
}
