/**
 * Activity Feed - Unified real-time status of constellation operations
 *
 * Shows what each satellite and ground station is doing:
 * - Active beams/links
 * - Pass events (AOS/LOS)
 * - Slew commands
 * - Weather impacts
 * - Link margin changes
 */

import { useState, useMemo } from 'react';
import {
  Zap, ArrowUpRight, ArrowDownRight,
  Cloud, AlertTriangle, CheckCircle, Target,
  ChevronDown, ChevronUp, Clock
} from 'lucide-react';

// Activity types
type ActivityType =
  | 'beam_active'      // Satellite actively beaming to ground
  | 'beam_handoff'     // Beam switching from one station to another
  | 'pass_aos'         // Acquisition of signal - pass starting
  | 'pass_los'         // Loss of signal - pass ending
  | 'slew_start'       // Ground station starting slew
  | 'slew_complete'    // Ground station reached target
  | 'weather_degrade'  // Weather impacting link
  | 'weather_clear'    // Weather cleared
  | 'link_margin_low'  // Link margin dropped
  | 'link_established' // New link established
  | 'link_lost';       // Link lost

interface ActivityEvent {
  id: string;
  timestamp: number;
  type: ActivityType;
  satelliteId?: string;
  satelliteName?: string;
  stationId?: string;
  stationName?: string;
  details: {
    elevation?: number;
    azimuth?: number;
    marginDb?: number;
    weatherScore?: number;
    duration?: number;
    fromStation?: string;
    toStation?: string;
  };
}

interface SatelliteStatus {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'eclipse' | 'maneuvering';
  currentTarget?: string;
  currentTargetName?: string;
  elevation?: number;
  azimuth?: number;
  marginDb?: number;
  nextPass?: {
    station: string;
    stationName: string;
    aosTime: number;
    losTime: number;
  };
}

interface GroundStationStatus {
  id: string;
  name: string;
  status: 'tracking' | 'slewing' | 'idle' | 'maintenance';
  trackingSatellite?: string;
  trackingSatelliteName?: string;
  currentAzimuth: number;
  currentElevation: number;
  targetAzimuth?: number;
  targetElevation?: number;
  weatherScore: number;
  doorState: 'open' | 'closed' | 'opening' | 'closing';
}

interface ActivityFeedProps {
  satellites?: SatelliteStatus[];
  groundStations?: GroundStationStatus[];
  recentEvents?: ActivityEvent[];
  onSatelliteSelect?: (satId: string) => void;
  onStationSelect?: (stationId: string) => void;
}

// Activity type metadata
const ACTIVITY_META: Record<ActivityType, { icon: typeof Zap; color: string; label: string }> = {
  beam_active: { icon: Zap, color: 'text-cyan-400', label: 'BEAM' },
  beam_handoff: { icon: ArrowUpRight, color: 'text-yellow-400', label: 'HANDOFF' },
  pass_aos: { icon: ArrowUpRight, color: 'text-green-400', label: 'AOS' },
  pass_los: { icon: ArrowDownRight, color: 'text-orange-400', label: 'LOS' },
  slew_start: { icon: Target, color: 'text-blue-400', label: 'SLEW' },
  slew_complete: { icon: CheckCircle, color: 'text-green-400', label: 'LOCKED' },
  weather_degrade: { icon: Cloud, color: 'text-yellow-400', label: 'WX↓' },
  weather_clear: { icon: Cloud, color: 'text-green-400', label: 'WX↑' },
  link_margin_low: { icon: AlertTriangle, color: 'text-red-400', label: 'MARGIN' },
  link_established: { icon: CheckCircle, color: 'text-green-400', label: 'LINK' },
  link_lost: { icon: AlertTriangle, color: 'text-red-400', label: 'LOST' },
};

// Greek alphabet for satellite short names
const GREEK = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ'];

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatDegrees(deg: number): string {
  return `${deg.toFixed(1)}°`;
}

export function ActivityFeed({
  satellites = [],
  groundStations = [],
  recentEvents = [],
  onSatelliteSelect,
  onStationSelect: _onStationSelect,
}: ActivityFeedProps) {
  void _onStationSelect;
  const [filter, setFilter] = useState<'all' | 'satellites' | 'stations' | 'alerts'>('all');
  const [expandedSat, setExpandedSat] = useState<string | null>(null);
  const [showEvents, setShowEvents] = useState(true);

  // Generate mock events if none provided (for demo)
  const events = useMemo(() => {
    if (recentEvents.length > 0) return recentEvents;

    // Generate sample events based on current satellite/station status
    const mockEvents: ActivityEvent[] = [];
    const now = Date.now();

    satellites.forEach((sat, idx) => {
      if (sat.currentTarget) {
        mockEvents.push({
          id: `beam-${sat.id}`,
          timestamp: now - (idx * 5000),
          type: 'beam_active',
          satelliteId: sat.id,
          satelliteName: sat.name,
          stationId: sat.currentTarget,
          stationName: sat.currentTargetName || sat.currentTarget,
          details: {
            elevation: sat.elevation,
            marginDb: sat.marginDb,
          },
        });
      }
    });

    groundStations.forEach((gs, idx) => {
      if (gs.status === 'tracking' && gs.trackingSatellite) {
        mockEvents.push({
          id: `track-${gs.id}`,
          timestamp: now - (idx * 3000),
          type: 'slew_complete',
          stationId: gs.id,
          stationName: gs.name,
          satelliteId: gs.trackingSatellite,
          satelliteName: gs.trackingSatelliteName,
          details: {
            azimuth: gs.currentAzimuth,
            elevation: gs.currentElevation,
          },
        });
      }
    });

    return mockEvents.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
  }, [satellites, groundStations, recentEvents]);

  // Filter events
  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events;
    if (filter === 'satellites') return events.filter(e => e.satelliteId);
    if (filter === 'stations') return events.filter(e => e.stationId && !e.satelliteId);
    if (filter === 'alerts') return events.filter(e =>
      e.type === 'link_margin_low' || e.type === 'link_lost' || e.type === 'weather_degrade'
    );
    return events;
  }, [events, filter]);

  // Active links count
  const activeLinks = satellites.filter(s => s.currentTarget).length;
  const trackingStations = groundStations.filter(g => g.status === 'tracking').length;

  return (
    <div className="h-full flex flex-col bg-slate-900/95 text-slate-200">
      {/* Header with stats */}
      <div className="p-3 border-b border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm font-semibold">Mission Feed</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">
            {new Date().toISOString().slice(11, 19)}Z
          </span>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-800/50 rounded px-2 py-1">
            <div className="text-lg font-bold text-cyan-400">{activeLinks}</div>
            <div className="text-[9px] text-slate-500 uppercase">Active Beams</div>
          </div>
          <div className="bg-slate-800/50 rounded px-2 py-1">
            <div className="text-lg font-bold text-green-400">{trackingStations}</div>
            <div className="text-[9px] text-slate-500 uppercase">Tracking</div>
          </div>
          <div className="bg-slate-800/50 rounded px-2 py-1">
            <div className="text-lg font-bold text-blue-400">{satellites.length}</div>
            <div className="text-[9px] text-slate-500 uppercase">Birds</div>
          </div>
        </div>
      </div>

      {/* Satellite status cards */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Constellation Status</span>
          </div>

          <div className="space-y-1">
            {satellites.map((sat, idx) => {
              const isExpanded = expandedSat === sat.id;
              const greek = GREEK[idx] || `#${idx + 1}`;

              return (
                <div
                  key={sat.id}
                  className={`rounded-lg border transition-all ${
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
                    className="w-full flex items-center gap-2 p-2 text-left"
                  >
                    {/* Greek letter badge */}
                    <div className={`w-6 h-6 rounded flex items-center justify-center text-sm font-bold ${
                      sat.currentTarget ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {greek}
                    </div>

                    {/* Satellite name and status */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate">{sat.name}</span>
                        {sat.currentTarget && (
                          <Zap size={10} className="text-cyan-400 animate-pulse" />
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {sat.currentTarget ? (
                          <span className="text-cyan-300">→ {sat.currentTargetName || sat.currentTarget}</span>
                        ) : (
                          <span>idle</span>
                        )}
                      </div>
                    </div>

                    {/* Link margin indicator */}
                    {sat.marginDb !== undefined && (
                      <div className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        sat.marginDb >= 6 ? 'bg-green-900/40 text-green-400' :
                        sat.marginDb >= 3 ? 'bg-yellow-900/40 text-yellow-400' :
                        'bg-red-900/40 text-red-400'
                      }`}>
                        {sat.marginDb.toFixed(1)}dB
                      </div>
                    )}

                    {isExpanded ? (
                      <ChevronUp size={14} className="text-slate-500" />
                    ) : (
                      <ChevronDown size={14} className="text-slate-500" />
                    )}
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-2 pb-2 pt-1 border-t border-slate-700/30 space-y-2">
                      {sat.currentTarget && (
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div className="bg-slate-800/50 rounded p-1.5">
                            <div className="text-slate-500">Elevation</div>
                            <div className="font-mono text-cyan-300">
                              {sat.elevation !== undefined ? formatDegrees(sat.elevation) : '--'}
                            </div>
                          </div>
                          <div className="bg-slate-800/50 rounded p-1.5">
                            <div className="text-slate-500">Azimuth</div>
                            <div className="font-mono text-cyan-300">
                              {sat.azimuth !== undefined ? formatDegrees(sat.azimuth) : '--'}
                            </div>
                          </div>
                        </div>
                      )}

                      {sat.nextPass && (
                        <div className="bg-slate-800/50 rounded p-1.5 text-[10px]">
                          <div className="flex items-center gap-1 text-slate-500 mb-1">
                            <Clock size={10} />
                            Next Pass
                          </div>
                          <div className="text-slate-300">
                            {sat.nextPass.stationName} @ {formatTime(sat.nextPass.aosTime)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Event log */}
        <div className="p-2 border-t border-slate-700/50">
          <button
            onClick={() => setShowEvents(!showEvents)}
            className="flex items-center justify-between w-full mb-2"
          >
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Event Log</span>
            {showEvents ? (
              <ChevronUp size={12} className="text-slate-500" />
            ) : (
              <ChevronDown size={12} className="text-slate-500" />
            )}
          </button>

          {showEvents && (
            <>
              {/* Filter tabs */}
              <div className="flex gap-1 mb-2">
                {(['all', 'satellites', 'stations', 'alerts'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2 py-1 text-[9px] rounded transition-all ${
                      filter === f
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Events list */}
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {filteredEvents.slice(0, 15).map((event) => {
                  const meta = ACTIVITY_META[event.type];
                  const Icon = meta.icon;

                  return (
                    <div
                      key={event.id}
                      className="flex items-start gap-2 p-1.5 rounded bg-slate-800/30 text-[10px]"
                    >
                      <Icon size={12} className={meta.color} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className={`font-mono ${meta.color}`}>{meta.label}</span>
                          {event.satelliteName && (
                            <span className="text-blue-300">{event.satelliteName}</span>
                          )}
                          {event.stationName && (
                            <>
                              <span className="text-slate-600">→</span>
                              <span className="text-green-300">{event.stationName}</span>
                            </>
                          )}
                        </div>
                        {event.details.elevation !== undefined && (
                          <div className="text-slate-500">
                            EL {formatDegrees(event.details.elevation)}
                            {event.details.marginDb !== undefined && (
                              <span className="ml-2">{event.details.marginDb.toFixed(1)}dB</span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-slate-600 font-mono">
                        {formatTime(event.timestamp).slice(0, 5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ActivityFeed;
