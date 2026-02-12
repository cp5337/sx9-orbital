import { supabase } from '@/lib/supabase';
import { GroundStationData, SatelliteData, NetworkLinkData } from './cesiumWorldManager';

export interface InitialDataPayload {
  ground_stations: GroundStationData[];
  satellites: SatelliteData[];
  network_links: NetworkLinkData[];
}

export async function loadInitialData(): Promise<InitialDataPayload> {
  try {
    const [groundStations, satellites, links] = await Promise.all([
      supabase.from('ground_nodes').select('*'),
      supabase.from('satellites').select('*'),
      supabase.from('beams').select('*')
    ]);

    return {
      ground_stations: (groundStations.data || []).map(station => ({
        id: station.id,
        name: station.name,
        latitude: station.latitude,
        longitude: station.longitude,
        altitude: station.altitude || 0,
        status: station.status || 'operational',
        type: station.type || 'ground_station'
      })),
      satellites: (satellites.data || []).map(sat => ({
        id: sat.id,
        name: sat.name,
        norad_id: sat.norad_id,
        latitude: sat.latitude || 0,
        longitude: sat.longitude || 0,
        altitude: sat.altitude || 400000,
        velocity: sat.velocity || 7660,
        inclination: sat.inclination || 51.6,
        status: sat.status || 'operational'
      })),
      network_links: (links.data || []).map(link => ({
        id: link.id,
        source_id: link.source_node_id,
        target_id: link.target_node_id,
        type: link.beam_type || 'active',
        bandwidth: link.throughput_gbps || 0,
        latency: link.latency_ms || 0,
        status: link.beam_status || 'active'
      }))
    };
  } catch (error) {
    console.error('Failed to load initial data:', error);
    return {
      ground_stations: [],
      satellites: [],
      network_links: []
    };
  }
}

export function generateSatellitePosition(satellite: SatelliteData, time: Date = new Date()) {
  const now = time.getTime();
  const orbitalPeriod = 5400000;
  const phase = (now % orbitalPeriod) / orbitalPeriod * 2 * Math.PI;

  const inclination = satellite.inclination || 51.6;
  const altitude = satellite.altitude || 400000;

  return {
    latitude: Math.sin(phase) * inclination,
    longitude: (phase * 180 / Math.PI) % 360 - 180,
    altitude: altitude
  };
}
