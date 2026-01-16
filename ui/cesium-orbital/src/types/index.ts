export type GroundNode = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  tier: 1 | 2 | 3;
  demand_gbps: number;
  weather_score: number;
  status: 'active' | 'degraded' | 'offline';
  created_at: string;
  last_updated: string;
};

export type Satellite = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number;
  inclination: number;
  jammed: boolean;
  qber: number;
  status: 'active' | 'degraded' | 'offline';
  created_at: string;
  last_updated: string;
};

export type TelemetryRecord = {
  id: string;
  timestamp: string;
  node_id: string;
  node_type: 'ground_node' | 'satellite';
  metric_type: string;
  value: number;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type WeatherData = {
  id: string;
  location_id: string;
  timestamp: string;
  conditions: string;
  cloud_cover: number;
  visibility: number;
  wind_speed: number;
  precipitation: number;
  temperature: number;
  raw_data: Record<string, unknown>;
  created_at: string;
};

export type QKDMetric = {
  id: string;
  satellite_id: string;
  timestamp: string;
  qber: number;
  key_rate_kbps: number;
  sifted_bits: number;
  pa_ratio: number;
  link_quality: number;
  created_at: string;
};

export type WeatherCondition = {
  score: number;
  conditions: string;
  cloudCover: number;
  visibility: number;
  windSpeed: number;
  precipitation: number;
  temperature: number;
};

export type TelemetryStream = {
  routeEfficiency: number;
  latency: number;
  qber: number;
  entropy: number;
};
