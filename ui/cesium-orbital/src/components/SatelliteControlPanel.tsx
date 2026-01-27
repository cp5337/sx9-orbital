import { useState, useEffect } from 'react';
import {
  X,
  Power,
  PowerOff,
  Satellite,
  Radio,
  Zap,
  Settings,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronDown,
  Hash
} from 'lucide-react';

// Hash response from orbital gateway /api/v1/memory/hash endpoint
interface GatewayHashResponse {
  hash: string;
  algorithm: string;
  format: string;
  compressed: boolean;
  satellite_unicode: string | null;
  processing_time_us: number;
  status: string;
}

// Service to hash data via orbital gateway (replaces HashingEngineConnector)
class OrbitalHashService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = import.meta.env.VITE_ORBITAL_GATEWAY_URL ||
      `${window.location.protocol}//${window.location.hostname}:18700`;
  }

  async hash(data: string, compress: boolean = true): Promise<GatewayHashResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/memory/hash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data,
        algorithm: 'murmur3',
        format: 'hex',
        compress
      })
    });

    if (!response.ok) {
      throw new Error(`Hash request failed: ${response.statusText}`);
    }

    return response.json();
  }

  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/memory/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export interface SatelliteControlState {
  id: string;
  name: string;
  power: boolean;
  laserMode: 'all' | 'earth-only' | 'sat-only' | 'off';
  pulseRate: number;
  beamTypes: {
    primaryFSO: boolean;
    backupRF: boolean;
    qkd: boolean;
    telemetry: boolean;
    emergency: boolean;
  };
  visible: boolean;
}

export interface SatelliteGroup {
  id: string;
  name: string;
  satelliteIds: string[];
  color: string;
}

interface SatelliteControlPanelProps {
  isOpen: boolean;
  onClose: () => void;
  satellites: Array<{ id: string; name: string; status: string }>;
  onSatelliteControlChange: (satelliteId: string, controls: Partial<SatelliteControlState>) => void;
}

// Duplicate removal function
const removeDuplicateSatellites = (satellites: Array<{ id: string; name: string; status: string }>) => {
  const seenNames: Record<string, boolean> = {};
  const uniqueSatellites: Array<{ id: string; name: string; status: string }> = [];

  for (const sat of satellites) {
    const baseName = sat.name?.split('-')[0] + '-' + sat.name?.split('-')[1]; // Get base name like "SAT-ALPHA"

    if (!seenNames[baseName]) {
      seenNames[baseName] = true;
      uniqueSatellites.push({
        ...sat,
        name: baseName
      });
      console.log(`✅ Keeping unique satellite: ${baseName}`);
    } else {
      console.log(`🗑️ Removed duplicate satellite: ${sat.name}`);
    }
  }

  console.log(`🛰️ SATELLITE CLEANUP: ${satellites.length} → ${uniqueSatellites.length} satellites`);
  return uniqueSatellites.slice(0, 12); // Ensure exactly 12
};

export const SatelliteControlPanel: React.FC<SatelliteControlPanelProps> = ({
  isOpen,
  onClose,
  satellites,
  onSatelliteControlChange
}) => {
  // Satellites are now automatically deduplicated by the useSatellites hook
  const cleanedSatellites = satellites; // No manual cleaning needed anymore!
  console.log('📡 SatelliteControlPanel received satellites:', satellites.length, satellites);
  const [expandedSatellites, setExpandedSatellites] = useState<Set<string>>(new Set());
  const [hashService, setHashService] = useState<OrbitalHashService | null>(null);
  const [satelliteHashes, setSatelliteHashes] = useState<Map<string, string>>(new Map());

  // Function to convert satellite name to clean slot format
  const formatSatelliteName = (originalName: string) => {
    const baseName = originalName.replace(/^SAT-/, '').replace(/^MEO-/, '');
    const orbitalSlots: Record<string, string> = {
      'ALPHA': '75° E',
      'BETA': '85° E',
      'DELTA': '95° E',
      'GAMMA': '105° E',
      'EPSILON': '45° W',
      'ETA': '55° W',
      'LAMBDA': '65° W',
      'ZETA': '115° W'
    };
    return `${baseName} ${orbitalSlots[baseName] || '0° E'}`;
  };

  const [satelliteControls, setSatelliteControls] = useState<Map<string, SatelliteControlState>>(new Map());

  // Initialize satellite controls when satellites change
  useEffect(() => {
    console.log('🔧 Initializing controls for', cleanedSatellites.length, 'satellites');
    const newControls = new Map(cleanedSatellites.map(sat => [sat.id, {
      id: sat.id,
      name: formatSatelliteName(sat.name),
      power: true,
      laserMode: 'all' as const,
      pulseRate: 50,
      beamTypes: {
        primaryFSO: true,
        backupRF: false,
        qkd: false,
        telemetry: true,
        emergency: false
      },
      visible: true
    }]));
    setSatelliteControls(newControls);
    console.log('✅ Controls initialized:', newControls.size, 'controls created');
  }, [cleanedSatellites]);

  // Note: Duplicate fixing is now automatic in the useSatellites hook!
  // No manual duplicate fixing needed anymore.

  // Function to toggle satellite drawer
  const toggleSatelliteDrawer = (satelliteId: string) => {
    setExpandedSatellites(prev => {
      const newSet = new Set(prev);
      if (newSet.has(satelliteId)) {
        newSet.delete(satelliteId);
      } else {
        newSet.add(satelliteId);
      }
      return newSet;
    });
  };

  // Function to expand all drawers
  const expandAllDrawers = () => {
    setExpandedSatellites(new Set(cleanedSatellites.map(sat => sat.id)));
  };

  // Function to collapse all drawers
  const collapseAllDrawers = () => {
    setExpandedSatellites(new Set());
  };

  // Initialize orbital gateway hash service and generate satellite hashes
  useEffect(() => {
    const initializeHashService = async () => {
      console.log('🔐 Initializing Orbital Gateway Hash Service (murmur3)...');
      const service = new OrbitalHashService();
      const connected = await service.checkConnection();

      if (connected) {
        setHashService(service);
        console.log('✅ Orbital gateway connected, generating satellite hashes...');
        await generateSatelliteHashes(service);
      } else {
        console.warn('⚠️ Orbital gateway not available, using fallback Unicode generation');
        generateFallbackHashes();
      }
    };

    initializeHashService();
  }, [cleanedSatellites]);

  // Generate trivariate hashes for satellites with LISP operators
  const generateSatelliteHashes = async (service: OrbitalHashService) => {
    const hashes = new Map<string, string>();

    for (const satellite of cleanedSatellites) {
      const orbitalSlot = formatSatelliteName(satellite.name).split(' ')[1]; // e.g., "75° E"

      // Generate LISP operator for satellite context
      const lispOperator = `(satellite "${satellite.name}" orbital-slot "${orbitalSlot}" mission geostationary laser-enabled true)`;

      // Combine satellite data with LISP operator
      const satelliteData = `${lispOperator}|id:${satellite.id}|name:${satellite.name}|status:${satellite.status}`;

      try {
        // Generate hash using orbital gateway
        const hashResult = await service.hash(satelliteData, true);

        if (hashResult.status === 'success' && hashResult.satellite_unicode) {
          // Use the pre-computed satellite unicode from gateway
          hashes.set(satellite.id, hashResult.satellite_unicode);
          console.log(`🛰️ Generated hash for ${satellite.name}: ${hashResult.satellite_unicode} (${hashResult.hash.substring(0, 16)}...)`);
        } else {
          // Fallback to local compression if gateway didn't return unicode
          const unicodeChar = compressToSatelliteUnicode(hashResult.hash);
          hashes.set(satellite.id, unicodeChar);
          console.log(`🛰️ Generated hash for ${satellite.name}: ${unicodeChar} (local compression)`);
        }
      } catch (error) {
        console.error(`Failed to generate hash for ${satellite.name}:`, error);
        // Fallback to deterministic Unicode for this satellite
        hashes.set(satellite.id, generateFallbackSatelliteUnicode(satellite.name, orbitalSlot));
      }
    }

    setSatelliteHashes(hashes);
  };

  // Fallback hash generation when engine is not available
  const generateFallbackHashes = () => {
    const hashes = new Map<string, string>();

    cleanedSatellites.forEach(satellite => {
      const orbitalSlot = formatSatelliteName(satellite.name).split(' ')[1];
      const unicodeChar = generateFallbackSatelliteUnicode(satellite.name, orbitalSlot);
      hashes.set(satellite.id, unicodeChar);
    });

    setSatelliteHashes(hashes);
  };

  // Compress hash to satellite Unicode range U+E600-E6FF (256 characters)
  const compressToSatelliteUnicode = (hash: string): string => {
    let hashSum = 0;
    for (let i = 0; i < hash.length; i++) {
      hashSum += hash.charCodeAt(i);
    }
    const satelliteRangeStart = 0xE600;
    const satelliteRangeSize = 0x100; // 256 characters
    const unicodeOffset = hashSum % satelliteRangeSize;
    return String.fromCharCode(satelliteRangeStart + unicodeOffset);
  };

  // Fallback Unicode generation for satellites
  const generateFallbackSatelliteUnicode = (name: string, slot: string): string => {
    const combined = `${name}${slot}`;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      hash = ((hash << 5) - hash) + combined.charCodeAt(i);
      hash = hash & hash;
    }
    const satelliteRangeStart = 0xE600;
    const satelliteRangeSize = 0x100;
    const unicodeOffset = Math.abs(hash) % satelliteRangeSize;
    return String.fromCharCode(satelliteRangeStart + unicodeOffset);
  };

  const [selectedGroup, setSelectedGroup] = useState<string>('all');

  // Scroll to specific satellite when selected
  const scrollToSatellite = (satelliteId: string) => {
    console.log('🎯 Scrolling to satellite:', satelliteId);
    const element = document.getElementById(`satellite-${satelliteId}`);
    console.log('🔍 Found element:', element);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Auto-expand the satellite drawer
      setExpandedSatellites(prev => new Set([...prev, satelliteId]));
      console.log('✅ Scrolled and expanded satellite:', satelliteId);
    } else {
      console.error('❌ Could not find element with ID:', `satellite-${satelliteId}`);
      console.log('🔍 Available elements:', document.querySelectorAll('[id^="satellite-"]'));
    }
  };
  const [customGroups] = useState<SatelliteGroup[]>([
    {
      id: 'meo-plane-a',
      name: 'MEO Plane A',
      satelliteIds: ['sat-1', 'sat-2', 'sat-3', 'sat-4'],
      color: '#22c55e'
    },
    {
      id: 'meo-plane-b',
      name: 'MEO Plane B',
      satelliteIds: ['sat-5', 'sat-6'],
      color: '#3b82f6'
    }
  ]);

  const updateSatelliteControl = (satelliteId: string, updates: Partial<SatelliteControlState>) => {
    setSatelliteControls(prev => {
      const newControls = new Map(prev);
      const current = newControls.get(satelliteId);
      if (current) {
        const updated = { ...current, ...updates };
        newControls.set(satelliteId, updated);
        onSatelliteControlChange(satelliteId, updates);
      }
      return newControls;
    });
  };

  const applyToGroup = (groupId: string, updates: Partial<SatelliteControlState>) => {
    if (groupId === 'all') {
      cleanedSatellites.forEach(sat => updateSatelliteControl(sat.id, updates));
    } else if (groupId.startsWith('sat-')) {
      // Individual satellite selected
      const satId = groupId.replace('sat-', '');
      updateSatelliteControl(satId, updates);
    } else {
      const group = customGroups.find(g => g.id === groupId);
      if (group) {
        group.satelliteIds.forEach(satId => updateSatelliteControl(satId, updates));
      }
    }
  };

  const getLaserModeColor = (mode: string) => {
    switch (mode) {
      case 'all': return 'bg-green-500';
      case 'earth-only': return 'bg-blue-500';
      case 'sat-only': return 'bg-purple-500';
      case 'off': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getBeamTypeColor = (type: string) => {
    switch (type) {
      case 'ground-to-sat': return '#22c55e'; // Green
      case 'sat-to-sat': return '#3b82f6';    // Blue
      case 'qkd': return '#fbbf24';           // Yellow
      case 'emergency': return '#ef4444';     // Red
      case 'backup-rf': return '#9ca3af';     // Gray
      default: return '#6b7280';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-gray-900/95 backdrop-blur-sm border-l border-gray-700 z-50 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <Satellite className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Satellite Control</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Overall Diagnostics */}
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Network Status</h3>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div className="text-center">
            <div className="text-xl font-bold text-green-400">{cleanedSatellites.length}</div>
            <div className="text-xs text-gray-400">Satellites</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-green-400">
              0
            </div>
            <div className="text-xs text-gray-400">Auto-Clean</div>
          </div>
          <div className="text-center">
            <div className={`text-xl font-bold ${hashService ? 'text-blue-400' : 'text-yellow-400'}`}>
              {satelliteHashes.size}
            </div>
            <div className="text-xs text-gray-400">Hashed</div>
          </div>
          <div className="text-center">
            <div className={`text-xs font-mono ${hashService ? 'text-green-400' : 'text-red-400'}`}>
              {hashService ? '⚡GW' : '❌OFF'}
            </div>
            <div className="text-xs text-gray-400">Hash Svc</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button className="flex items-center justify-center space-x-1 bg-green-600/20 border border-green-500/30 rounded px-3 py-2 text-green-400 text-xs transition-colors">
            <Settings className="w-3 h-3" />
            <span>Auto-Clean ✓</span>
          </button>
          <button className="flex items-center justify-center space-x-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded px-3 py-2 text-blue-400 text-xs transition-colors">
            <Zap className="w-3 h-3" />
            <span>Reroute All</span>
          </button>
        </div>

        {/* Quick Bird Navigation */}
        <div className="mt-3 p-2 bg-blue-900/20 border border-blue-500/30 rounded">
          <h4 className="text-xs font-medium text-blue-300 mb-2">🛰️ Quick Bird Jump</h4>
          <div className="grid grid-cols-3 gap-1">
            {cleanedSatellites.slice(0, 6).map(sat => {
              console.log('🚀 Quick Jump Button for:', sat.id, sat.name);
              return (
                <button
                  key={`quick-${sat.id}`}
                  onClick={() => {
                    console.log('🎯 Quick jump clicked for satellite:', sat.id);
                    scrollToSatellite(sat.id);
                  }}
                  className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 rounded text-xs text-blue-300 transition-colors"
                  title={`Jump to ${formatSatelliteName(sat.name)} (ID: ${sat.id})`}
                >
                  {sat.name?.split('-')[1] || sat.name?.substring(0, 3)}
                </button>
              );
            })}
          </div>
          {cleanedSatellites.length > 6 && (
            <div className="grid grid-cols-3 gap-1 mt-1">
              {cleanedSatellites.slice(6, 12).map(sat => (
                <button
                  key={`quick-${sat.id}`}
                  onClick={() => scrollToSatellite(sat.id)}
                  className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 rounded text-xs text-blue-300 transition-colors"
                  title={`Jump to ${formatSatelliteName(sat.name)}`}
                >
                  {sat.name?.split('-')[1] || sat.name?.substring(0, 3)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            onClick={expandAllDrawers}
            className="flex items-center justify-center space-x-1 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded px-3 py-2 text-purple-400 text-xs transition-colors"
          >
            <Eye className="w-3 h-3" />
            <span>Expand All</span>
          </button>
          <button
            onClick={collapseAllDrawers}
            className="flex items-center justify-center space-x-1 bg-gray-600/20 hover:bg-gray-600/30 border border-gray-500/30 rounded px-3 py-2 text-gray-400 text-xs transition-colors"
          >
            <EyeOff className="w-3 h-3" />
            <span>Collapse All</span>
          </button>
        </div>
      </div>

      {/* Group Controls */}
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Satellite Selection & Operations</h3>
        <div className="space-y-3">
          <select
            value={selectedGroup}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedGroup(value);
              // If individual satellite selected, scroll to it
              if (value.startsWith('sat-')) {
                const satId = value.replace('sat-', '');
                scrollToSatellite(satId);
              }
            }}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="all">All Satellites</option>
            <optgroup label="Individual Satellites">
              {cleanedSatellites.map(sat => (
                <option key={`sat-${sat.id}`} value={`sat-${sat.id}`}>
                  {formatSatelliteName(sat.name)} - #{sat.id}
                </option>
              ))}
            </optgroup>
            <optgroup label="Satellite Groups">
              {customGroups.map(group => (
                <option key={group.id} value={group.id}>
                  {group.name} ({group.satelliteIds.length} sats)
                </option>
              ))}
            </optgroup>
          </select>

          {/* Group Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => applyToGroup(selectedGroup, { power: true })}
              className="flex items-center justify-center space-x-1 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 rounded-lg px-3 py-2 text-green-400 text-sm transition-colors"
            >
              <Power className="w-4 h-4" />
              <span>Power On</span>
            </button>
            <button
              onClick={() => applyToGroup(selectedGroup, { power: false })}
              className="flex items-center justify-center space-x-1 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm transition-colors"
            >
              <PowerOff className="w-4 h-4" />
              <span>Power Off</span>
            </button>
          </div>
        </div>
      </div>

      {/* Individual Satellite Controls - Drawer Style */}
      <div className="p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Individual Controls</h3>
        <div className="text-xs text-gray-400 mb-2">
          Debug: {cleanedSatellites.length} satellites, {satelliteControls.size} controls
        </div>
        <div className="space-y-2">
          {cleanedSatellites.map(satellite => {
            console.log('🛰️ Rendering satellite:', satellite.id, satellite.name);
            const controls = satelliteControls.get(satellite.id);
            console.log('🎮 Controls for', satellite.id, ':', controls);
            if (!controls) {
              console.warn('❌ No controls found for satellite:', satellite.id);
              return null;
            }

            const isExpanded = expandedSatellites.has(satellite.id);

            return (
              <div
                key={satellite.id}
                id={`satellite-${satellite.id}`}
                className="bg-gray-800/50 rounded-lg border border-gray-700"
              >
                {/* Satellite Header - Always Visible */}
                <div
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-700/30 transition-colors"
                  onClick={() => toggleSatelliteDrawer(satellite.id)}
                >
                  <div className="flex items-center space-x-2">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                    <Satellite className="w-4 h-4 text-blue-400" />
                    <span className="text-white font-medium text-sm">{formatSatelliteName(satellite.name)}</span>
                    <div className={`w-2 h-2 rounded-full ${controls.power ? 'bg-green-400' : 'bg-red-400'}`}></div>
                    <div className="flex items-center space-x-1">
                      <Hash className="w-3 h-3 text-blue-400" />
                      <span
                        className="text-lg font-mono text-blue-300 bg-gray-800 px-1 rounded cursor-pointer hover:bg-gray-700"
                        title={`Assembly Language Unicode: ${satelliteHashes.get(satellite.id) || '⏳'}\nSatellite ID: ${satellite.id}\nTrivariate Hash with LISP operator`}
                      >
                        {satelliteHashes.get(satellite.id) || '⏳'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-400">{satellite.status}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateSatelliteControl(satellite.id, { visible: !controls.visible });
                      }}
                      className="p-1 hover:bg-gray-700 rounded transition-colors"
                    >
                      {controls.visible ?
                        <Eye className="w-4 h-4 text-gray-400" /> :
                        <EyeOff className="w-4 h-4 text-gray-500" />
                      }
                    </button>
                  </div>
                </div>

                {/* Satellite Controls - Collapsible */}
                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-gray-700/50">
                    <div className="pt-3 space-y-3">
                      {/* Power Toggle */}
                      <div className="flex items-center justify-between">
                        <span className="text-gray-300 text-sm">Power</span>
                        <button
                          onClick={() => updateSatelliteControl(satellite.id, { power: !controls.power })}
                          className={`w-12 h-6 rounded-full transition-colors ${
                            controls.power ? 'bg-green-500' : 'bg-gray-600'
                          }`}
                        >
                          <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                            controls.power ? 'translate-x-6' : 'translate-x-0.5'
                          }`}></div>
                        </button>
                      </div>

                      {/* Laser Mode */}
                      <div>
                        <span className="text-gray-300 text-sm block mb-2">Laser Mode</span>
                        <div className="grid grid-cols-2 gap-1">
                          {[
                            { value: 'all', label: 'All Active', icon: Zap },
                            { value: 'earth-only', label: 'Earth Only', icon: Radio },
                            { value: 'sat-only', label: 'Sat Only', icon: Satellite },
                            { value: 'off', label: 'Off', icon: PowerOff }
                          ].map(mode => (
                            <button
                              key={mode.value}
                              onClick={() => updateSatelliteControl(satellite.id, { laserMode: mode.value as any })}
                              className={`flex items-center justify-center space-x-1 px-2 py-1 rounded text-xs transition-colors ${
                                controls.laserMode === mode.value
                                  ? `${getLaserModeColor(mode.value)} text-white`
                                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              }`}
                            >
                              <mode.icon className="w-3 h-3" />
                              <span>{mode.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Advanced Pulse Rate Controls */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-gray-300 text-sm">Pulse Control</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-blue-400 text-xs font-mono">
                              {controls.pulseRate}Hz
                            </span>
                            <span className="text-green-400 text-xs">
                              {(1000 / controls.pulseRate).toFixed(1)}ms
                            </span>
                          </div>
                        </div>

                        {/* Preset Buttons */}
                        <div className="grid grid-cols-4 gap-1 mb-2">
                          {[
                            { label: 'Low', value: 1, color: 'bg-green-600' },
                            { label: 'Std', value: 10, color: 'bg-blue-600' },
                            { label: 'Fast', value: 50, color: 'bg-yellow-600' },
                            { label: 'Max', value: 100, color: 'bg-red-600' }
                          ].map(preset => (
                            <button
                              key={preset.label}
                              onClick={() => updateSatelliteControl(satellite.id, { pulseRate: preset.value })}
                              disabled={!controls.power}
                              className={`px-2 py-1 ${preset.color} hover:opacity-80 disabled:opacity-30 rounded text-xs text-white transition-opacity`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>

                        {/* Fine Control Slider */}
                        <div className="space-y-2">
                          <input
                            type="range"
                            min="1"
                            max="100"
                            step="1"
                            value={controls.pulseRate}
                            onChange={(e) => updateSatelliteControl(satellite.id, { pulseRate: parseInt(e.target.value) })}
                            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            disabled={!controls.power}
                          />

                          {/* Precision Input */}
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={controls.pulseRate}
                              onChange={(e) => updateSatelliteControl(satellite.id, { pulseRate: parseInt(e.target.value) || 1 })}
                              disabled={!controls.power}
                              className="w-16 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                            />
                            <span className="text-xs text-gray-400">Hz</span>

                            {/* Step Buttons */}
                            <div className="flex space-x-1">
                              <button
                                onClick={() => updateSatelliteControl(satellite.id, { pulseRate: Math.max(1, controls.pulseRate - 1) })}
                                disabled={!controls.power || controls.pulseRate <= 1}
                                className="w-6 h-6 bg-gray-600 hover:bg-gray-500 disabled:opacity-30 rounded text-xs text-white flex items-center justify-center"
                              >
                                -
                              </button>
                              <button
                                onClick={() => updateSatelliteControl(satellite.id, { pulseRate: Math.min(100, controls.pulseRate + 1) })}
                                disabled={!controls.power || controls.pulseRate >= 100}
                                className="w-6 h-6 bg-gray-600 hover:bg-gray-500 disabled:opacity-30 rounded text-xs text-white flex items-center justify-center"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Performance Warning */}
                        {controls.pulseRate > 80 && (
                          <div className="mt-1 p-1 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-400">
                            ⚠️ High frequency may cause thermal stress
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SatelliteControlPanel;