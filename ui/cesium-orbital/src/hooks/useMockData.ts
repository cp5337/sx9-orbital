// Temporary mock data hook - uses real MEO network data from Rust tests
// Bypasses Supabase until RLS policies are fixed

import { useState, useEffect } from 'react';
import type { GroundNode, Satellite } from '@/types';

const MOCK_GROUND_NODES: Omit<GroundNode, 'id' | 'created_at' | 'last_updated'>[] = [
  { name: 'GN-1', latitude: 6.5244, longitude: 3.3792, tier: 1, demand_gbps: 100.0, weather_score: 0.80, status: 'active' },
  { name: 'GN-2', latitude: 51.5074, longitude: -0.1278, tier: 1, demand_gbps: 100.0, weather_score: 0.85, status: 'active' },
  { name: 'GN-3', latitude: 1.3521, longitude: 103.8198, tier: 1, demand_gbps: 100.0, weather_score: 0.90, status: 'active' },
  { name: 'GN-4', latitude: -33.8688, longitude: 151.2093, tier: 1, demand_gbps: 100.0, weather_score: 0.88, status: 'active' },
  { name: 'GN-5', latitude: 33.9206, longitude: -118.3276, tier: 2, demand_gbps: 50.0, weather_score: 0.92, status: 'active' },
  { name: 'GN-6', latitude: 47.6740, longitude: -122.1215, tier: 2, demand_gbps: 50.0, weather_score: 0.78, status: 'active' },
  { name: 'GN-7', latitude: 25.9018, longitude: -97.4970, tier: 2, demand_gbps: 50.0, weather_score: 0.94, status: 'active' },
];

const MOCK_SATELLITES: Omit<Satellite, 'id' | 'created_at' | 'last_updated'>[] = [
  { name: 'ALPHA', latitude: 0.0, longitude: 0.0, altitude: 15000.0, inclination: 55.0, jammed: false, qber: 2.5, status: 'active' },
  { name: 'BETA', latitude: 30.0, longitude: 45.0, altitude: 15000.0, inclination: 55.0, jammed: false, qber: 2.8, status: 'active' },
  { name: 'GAMMA', latitude: -30.0, longitude: 90.0, altitude: 15000.0, inclination: 55.0, jammed: false, qber: 2.6, status: 'active' },
  { name: 'DELTA', latitude: 45.0, longitude: 135.0, altitude: 15000.0, inclination: 55.0, jammed: false, qber: 3.0, status: 'active' },
  { name: 'EPSILON', latitude: 0.0, longitude: 180.0, altitude: 15000.0, inclination: 55.0, jammed: false, qber: 2.4, status: 'active' },
  { name: 'ZETA', latitude: -45.0, longitude: -135.0, altitude: 15000.0, inclination: 55.0, jammed: false, qber: 2.9, status: 'active' },
  { name: 'ETA', latitude: 30.0, longitude: -90.0, altitude: 15000.0, inclination: 55.0, jammed: false, qber: 2.7, status: 'active' },
  { name: 'THETA', latitude: -30.0, longitude: -45.0, altitude: 15000.0, inclination: 55.0, jammed: false, qber: 2.5, status: 'active' },
  { name: 'IOTA', latitude: 60.0, longitude: 0.0, altitude: 12000.0, inclination: 70.0, jammed: false, qber: 3.8, status: 'active' },
  { name: 'KAPPA', latitude: -60.0, longitude: 0.0, altitude: 12000.0, inclination: 70.0, jammed: false, qber: 3.9, status: 'active' },
  { name: 'LAMBDA', latitude: 15.0, longitude: 60.0, altitude: 18000.0, inclination: 47.0, jammed: false, qber: 2.2, status: 'active' },
  { name: 'MU', latitude: -15.0, longitude: 120.0, altitude: 18000.0, inclination: 47.0, jammed: false, qber: 2.3, status: 'active' },
];

export function useMockGroundNodes() {
  const [nodes, setNodes] = useState<GroundNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => {
      setNodes(MOCK_GROUND_NODES.map((node, i) => ({
        ...node,
        id: `gn-${i + 1}`,
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      })));
      setLoading(false);
    }, 100);
  }, []);

  return { nodes, loading, error: null };
}

export function useMockSatellites() {
  const [satellites, setSatellites] = useState<Satellite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => {
      setSatellites(MOCK_SATELLITES.map((sat, i) => ({
        ...sat,
        id: `sat-${i + 1}`,
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      })));
      setLoading(false);
    }, 100);
  }, []);

  return { satellites, loading, error: null };
}

