import { useState, useEffect, useRef } from 'react';
import type { Satellite, GroundNode, FsoLink } from '@/types';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:18700';
const POSITION_POLL_INTERVAL = 5000;

// Gateway response shapes
interface GatewaySatelliteInfo {
  id: string;
  name: string;
  norad_id: number;
  plane: number;
  slot: number;
  status: string;
  tle_line1: string;
  tle_line2: string;
}

interface GatewayPosition {
  id: string;
  norad_id: number;
  latitude: number;
  longitude: number;
  altitude_km: number;
  velocity_km_s: number;
  timestamp: string;
}

interface GatewayGroundStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: string;
  weather_score: number;
}

interface StrategicStation {
  config: {
    id: string;
    name: string;
    latitude_deg: number;
    longitude_deg: number;
    altitude_m: number;
    min_elevation_deg: number;
    max_slew_rate_deg_s: number;
    fov_deg: number;
  };
  station_type: string;
  country_code: string | null;
  equinix_code: string | null;
  cable_systems: string[];
  weather_zone: string | null;
  fiber_score: number;
}

export interface ConstellationState {
  satellites: Satellite[];
  groundStations: GroundNode[];
  fsoLinks: FsoLink[];
  loading: boolean;
  error: Error | null;
}

type ConstellationListener = (state: ConstellationState) => void;

class ConstellationStore {
  private state: ConstellationState = {
    satellites: [],
    groundStations: [],
    fsoLinks: [],
    loading: true,
    error: null,
  };

  private listeners: Set<ConstellationListener> = new Set();
  private pollTimer: number | null = null;
  private initialized = false;

  getState(): ConstellationState {
    return this.state;
  }

  subscribe(listener: ConstellationListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((listener) => listener(this.state));
  }

  private setState(partial: Partial<ConstellationState>) {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      this.setState({ loading: true, error: null });

      const [satInfoRes, satPosRes, gsRes, strategicRes] = await Promise.all([
        fetch(`${GATEWAY_URL}/api/v1/satellites`),
        fetch(`${GATEWAY_URL}/api/v1/satellites/positions`),
        fetch(`${GATEWAY_URL}/api/v1/ground-stations`),
        fetch(`${GATEWAY_URL}/api/v1/strategic-stations`).catch(() => null),
      ]);

      if (!satInfoRes.ok) throw new Error(`Satellites fetch failed: ${satInfoRes.status}`);
      if (!satPosRes.ok) throw new Error(`Positions fetch failed: ${satPosRes.status}`);
      if (!gsRes.ok) throw new Error(`Ground stations fetch failed: ${gsRes.status}`);

      const satInfos: GatewaySatelliteInfo[] = await satInfoRes.json();
      const satPosData: { satellites: GatewayPosition[] } = await satPosRes.json();
      const basicStations: GatewayGroundStation[] = await gsRes.json();

      let strategicStations: StrategicStation[] = [];
      if (strategicRes && strategicRes.ok) {
        const data = await strategicRes.json();
        strategicStations = data.stations || [];
      }

      const satellites = this.mergeSatellites(satInfos, satPosData.satellites);
      const groundStations = this.mergeStations(basicStations, strategicStations);
      const fsoLinks = this.computeFsoLinks(satellites, groundStations);

      this.setState({ satellites, groundStations, fsoLinks, loading: false });
      this.startPositionPolling();
    } catch (err) {
      console.error('ConstellationStore initialization error:', err);
      this.setState({ loading: false, error: err as Error });
    }
  }

  private mergeSatellites(
    infos: GatewaySatelliteInfo[],
    positions: GatewayPosition[]
  ): Satellite[] {
    const posMap = new Map(positions.map((p) => [p.id, p]));
    const now = new Date().toISOString();

    return infos.map((info) => {
      const pos = posMap.get(info.id);
      return {
        id: info.id,
        name: info.name,
        latitude: pos?.latitude ?? 0,
        longitude: pos?.longitude ?? 0,
        altitude: pos?.altitude_km ?? 10500,
        inclination: 55,
        plane: info.plane,
        slot: info.slot,
        jammed: false,
        qber: 0,
        status:
          info.status === 'active' || info.status === 'operational'
            ? ('active' as const)
            : ('degraded' as const),
        created_at: now,
        last_updated: pos?.timestamp ?? now,
      };
    });
  }

  private mergeStations(
    basic: GatewayGroundStation[],
    strategic: StrategicStation[]
  ): GroundNode[] {
    const seen = new Set<string>();
    const now = new Date().toISOString();
    const result: GroundNode[] = [];

    // Basic stations first (launch sites from StationRegistry)
    for (const s of basic) {
      seen.add(s.id);
      result.push({
        id: s.id,
        name: s.name,
        station_code: s.id,
        latitude: s.latitude,
        longitude: s.longitude,
        tier: 1,
        demand_gbps: 10,
        weather_score: s.weather_score,
        source: 'GroundNode',
        status:
          s.status === 'operational'
            ? ('active' as const)
            : s.status === 'degraded'
              ? ('degraded' as const)
              : ('offline' as const),
        created_at: now,
        last_updated: now,
      });
    }

    // Strategic stations — deduplicate by id
    for (const s of strategic) {
      if (seen.has(s.config.id)) continue;
      seen.add(s.config.id);

      const tier = this.inferTier(s.station_type);
      const zone = this.inferZone(s.config.longitude_deg);

      result.push({
        id: s.config.id,
        name: s.config.name,
        station_code: s.equinix_code || s.config.id,
        city: undefined,
        country: s.country_code || undefined,
        zone,
        source: this.normalizeSource(s.station_type),
        latitude: s.config.latitude_deg,
        longitude: s.config.longitude_deg,
        tier,
        demand_gbps: tier === 1 ? 10 : tier === 2 ? 5 : 1,
        weather_score: s.fiber_score > 0 ? s.fiber_score : 0.8,
        status: 'active',
        created_at: now,
        last_updated: now,
      });
    }

    return result;
  }

  private inferTier(stationType: string): 1 | 2 | 3 {
    switch (stationType) {
      case 'EquinixIBX':
      case 'FSOTerminal':
        return 1;
      case 'CableLanding':
      case 'Teleport':
        return 2;
      default:
        return 3;
    }
  }

  private inferZone(longitude: number): string {
    if (longitude >= -130 && longitude <= -30) return 'Americas';
    if (longitude >= -30 && longitude <= 60) return 'EMEA';
    return 'APAC';
  }

  private normalizeSource(stationType: string): string {
    switch (stationType) {
      case 'EquinixIBX':
        return 'Equinix';
      case 'CableLanding':
        return 'CableLanding';
      case 'FSOTerminal':
        return 'LaserLight';
      case 'Teleport':
        return 'FinancialInfra';
      case 'Research':
        return 'Research';
      default:
        return stationType;
    }
  }

  computeFsoLinks(satellites: Satellite[], groundStations: GroundNode[]): FsoLink[] {
    const links: FsoLink[] = [];

    // ISL links — intra-plane (adjacent satellites in same plane, Walker 53:12/3/1 → 4/plane)
    const satsPerPlane = 4;
    const numPlanes = Math.ceil(satellites.length / satsPerPlane);

    for (let plane = 0; plane < numPlanes; plane++) {
      const start = plane * satsPerPlane;
      const end = Math.min(start + satsPerPlane, satellites.length);
      for (let i = start; i < end; i++) {
        const next = i + 1 < end ? i + 1 : start;
        if (next === i) continue;
        const sat = satellites[i];
        const nextSat = satellites[next];
        links.push({
          id: `isl-intra-${sat.id}-${nextSat.id}`,
          source_id: sat.id,
          target_id: nextSat.id,
          link_type: 'sat-sat',
          margin_db: 6.0 + Math.random() * 3,
          throughput_gbps: 10.0,
          active: sat.status === 'active' && nextSat.status === 'active',
          weather_score: 1.0,
        });
      }
    }

    // ISL links — inter-plane (same slot across adjacent planes)
    for (let plane = 0; plane < numPlanes - 1; plane++) {
      for (let slot = 0; slot < satsPerPlane; slot++) {
        const idx1 = plane * satsPerPlane + slot;
        const idx2 = (plane + 1) * satsPerPlane + slot;
        if (idx1 >= satellites.length || idx2 >= satellites.length) continue;
        const sat1 = satellites[idx1];
        const sat2 = satellites[idx2];
        links.push({
          id: `isl-inter-${sat1.id}-${sat2.id}`,
          source_id: sat1.id,
          target_id: sat2.id,
          link_type: 'sat-sat',
          margin_db: 4.0 + Math.random() * 4,
          throughput_gbps: 10.0,
          active: sat1.status === 'active' && sat2.status === 'active',
          weather_score: 1.0,
        });
      }
    }

    // Sat-to-ground: each satellite connects to single nearest visible ground station
    for (const sat of satellites) {
      const nearest = groundStations
        .map((gs) => {
          const latDiff = Math.abs(sat.latitude - gs.latitude);
          const lonDiff = Math.abs(sat.longitude - gs.longitude);
          const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
          return { gs, distance, visible: distance < 30 };
        })
        .filter((item) => item.visible)
        .sort((a, b) => a.distance - b.distance)[0];

      if (nearest) {
        links.push({
          id: `sg-${sat.id}-${nearest.gs.id}`,
          source_id: sat.id,
          target_id: nearest.gs.id,
          link_type: 'sat-ground',
          margin_db: 3.0 + nearest.gs.weather_score * 5,
          throughput_gbps: 1.0 * nearest.gs.weather_score,
          active: sat.status === 'active' && nearest.gs.status === 'active',
          weather_score: nearest.gs.weather_score,
        });
      }
    }

    return links;
  }

  private startPositionPolling() {
    if (this.pollTimer !== null) return;

    this.pollTimer = window.setInterval(async () => {
      try {
        const res = await fetch(`${GATEWAY_URL}/api/v1/satellites/positions`);
        if (!res.ok) return;
        const data: { satellites: GatewayPosition[] } = await res.json();
        const posMap = new Map(data.satellites.map((p) => [p.id, p]));

        const updatedSats = this.state.satellites.map((sat) => {
          const pos = posMap.get(sat.id);
          if (!pos) return sat;
          return {
            ...sat,
            latitude: pos.latitude,
            longitude: pos.longitude,
            altitude: pos.altitude_km,
            last_updated: pos.timestamp,
          };
        });

        const fsoLinks = this.computeFsoLinks(updatedSats, this.state.groundStations);
        this.setState({ satellites: updatedSats, fsoLinks });
      } catch {
        // Gateway unreachable — keep last known state
      }
    }, POSITION_POLL_INTERVAL);
  }

  destroy() {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.listeners.clear();
    this.initialized = false;
  }
}

export const constellationStore = new ConstellationStore();

export function useConstellationStore(): ConstellationState {
  const [state, setState] = useState(constellationStore.getState());
  const initCalled = useRef(false);

  useEffect(() => {
    const unsubscribe = constellationStore.subscribe(setState);

    if (!initCalled.current) {
      initCalled.current = true;
      constellationStore.initialize();
    }

    return () => {
      unsubscribe();
    };
  }, []);

  return state;
}
