import { useState } from 'react';
import type { ViewType } from '@/store/beamSelectionStore';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Database,
  DollarSign,
  Globe,
  Radio,
  Satellite,
  Zap,
} from 'lucide-react';

interface CollapsibleNavProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  onDiagnosticsOpen?: () => void;
  onSatelliteControlOpen?: () => void;
  onCollapseChange?: (isCollapsed: boolean) => void;
}

export function CollapsibleNav({ currentView, onViewChange, onDiagnosticsOpen, onSatelliteControlOpen, onCollapseChange }: CollapsibleNavProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    onCollapseChange?.(newState);
  };

  const viewIds: ViewType[] = ['3d', 'map', 'dashboard', 'graph', 'data', 'financial', 'monitoring'];

  const iconMap: Record<string, React.ElementType> = {
    dashboard: Activity,
    '3d': Globe,
    map: Radio,
    graph: Activity,
    data: Database,
    satellites: Satellite,
    'ground-stations': Radio,
    'fso-links': Zap,
    financial: DollarSign,
    monitoring: BarChart3,
    diagnostics: AlertTriangle,
  };

  const shortLabelMap: Record<string, string> = {
    dashboard: 'DASH',
    '3d': '3D',
    map: 'MAP',
    graph: 'NET',
    data: 'DATA',
    financial: 'FIN',
    monitoring: 'SX9',
    satellites: 'SAT',
    'ground-stations': 'GND',
    'fso-links': 'FSO',
    diagnostics: 'DIAG',
  };

  const renderMenuItem = (item: { id: string; label: string; action?: () => void }) => {
    const isActive = currentView === item.id;
    const Icon = iconMap[item.id] || Activity;
    const shortLabel = shortLabelMap[item.id] || item.label;
    const handleClick = () => {
      if (item.action) {
        item.action();
      } else if (viewIds.includes(item.id as ViewType)) {
        onViewChange(item.id as ViewType);
      }
    };

    return (
      <div
        key={item.id}
        onClick={handleClick}
        className={`px-3 py-2 text-xs cursor-pointer flex gap-1 ${
          isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'
        } ${isCollapsed ? 'flex-col items-center' : 'items-center gap-2'}`}
      >
        <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-gray-400'}`} />
        {!isCollapsed && <span>{item.label}</span>}
        {isCollapsed && (
          <span className={`text-[9px] mt-0.5 ${isActive ? 'text-white' : 'text-gray-500'}`}>
            {shortLabel}
          </span>
        )}
      </div>
    );
  };

  const renderSectionHeader = (title: string) => (
    <div className="px-4 pt-3 pb-1 text-[10px] text-gray-500 uppercase tracking-wider">
      {!isCollapsed && title}
    </div>
  );

  // Views Section
  const viewsSection = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: '3d', label: '3D Globe' },
    { id: 'map', label: 'Flat Map' },
    { id: 'graph', label: 'Network Graph' },
    { id: 'data', label: 'Data Tables' },
    { id: 'financial', label: 'Fleet Finance' },
    { id: 'monitoring', label: 'SX9 Monitor' },
  ];

  // Constellation Section (includes diagnostics)
  const constellationSection = [
    { id: 'satellites', label: 'Satellites', action: onSatelliteControlOpen ?? (() => onViewChange('3d')) },
    { id: 'ground-stations', label: 'Ground Stations', action: () => onViewChange('data') },
    { id: 'fso-links', label: 'FSO Links', action: () => onViewChange('data') },
    { id: 'diagnostics', label: 'Diagnostics', action: onDiagnosticsOpen },
  ];

  return (
    <div className={`${isCollapsed ? 'w-12' : 'w-48'} h-full bg-gray-900 text-gray-300 fixed left-0 top-0 transition-all duration-300 border-r border-gray-800 flex flex-col`}>
      {/* Header */}
      <div className="px-4 pt-3 pb-2">
        {!isCollapsed && (
          <div>
            <span className="text-sm font-medium text-white">Orbital</span>
            <span className="text-[10px] text-gray-500 ml-1">v1.0</span>
          </div>
        )}
        <button
          onClick={handleCollapse}
          className={`mt-2 p-1 rounded hover:bg-gray-800 ${isCollapsed ? 'mx-auto' : ''}`}
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          )}
        </button>
      </div>

      <nav className="flex-1">
        {renderSectionHeader('Views')}
        {viewsSection.map(renderMenuItem)}

        {renderSectionHeader('Constellation')}
        {constellationSection.map(renderMenuItem)}
      </nav>

    </div>
  );
}
