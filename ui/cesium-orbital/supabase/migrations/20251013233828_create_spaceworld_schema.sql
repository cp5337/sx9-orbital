/*
  # SpaceWorld Network Infrastructure Schema

  ## Overview
  Creates the complete database schema for SpaceWorld satellite communication network,
  including ground nodes, satellites, telemetry archival, weather data, and QKD metrics.

  ## New Tables

  ### `ground_nodes`
  - `id` (uuid, primary key) - Unique identifier for each ground node
  - `name` (text) - Human-readable name (e.g., "GN-001")
  - `latitude` (double precision) - Geographic latitude (-90 to 90)
  - `longitude` (double precision) - Geographic longitude (-180 to 180)
  - `tier` (smallint) - Node tier level (1, 2, or 3)
  - `demand_gbps` (double precision) - Current bandwidth demand in Gbps
  - `weather_score` (double precision) - Weather quality metric (0.0 = poor, 1.0 = excellent)
  - `status` (text) - Current operational status (active, degraded, offline)
  - `created_at` (timestamptz) - Record creation timestamp
  - `last_updated` (timestamptz) - Last telemetry update timestamp

  ### `satellites`
  - `id` (uuid, primary key) - Unique identifier for each satellite
  - `name` (text) - Satellite identifier (e.g., "SAT-1")
  - `latitude` (double precision) - Current orbital latitude
  - `longitude` (double precision) - Current orbital longitude
  - `altitude` (double precision) - Altitude in kilometers
  - `jammed` (boolean) - Whether satellite is experiencing jamming
  - `qber` (double precision) - Quantum bit error rate percentage
  - `status` (text) - Operational status
  - `created_at` (timestamptz) - Record creation timestamp
  - `last_updated` (timestamptz) - Last telemetry update timestamp

  ### `telemetry_archive`
  - `id` (uuid, primary key) - Unique identifier for telemetry record
  - `timestamp` (timestamptz) - Measurement timestamp
  - `node_id` (uuid) - Reference to ground_nodes or satellites
  - `node_type` (text) - Type of node (ground_node, satellite)
  - `metric_type` (text) - Type of metric (route_eff, latency, qber, entropy)
  - `value` (double precision) - Metric value
  - `metadata` (jsonb) - Additional metadata and context
  - `created_at` (timestamptz) - Record creation timestamp

  ### `weather_data`
  - `id` (uuid, primary key) - Unique identifier
  - `location_id` (uuid) - Reference to ground node
  - `timestamp` (timestamptz) - Weather observation timestamp
  - `conditions` (text) - Weather condition description
  - `cloud_cover` (double precision) - Cloud coverage percentage (0-100)
  - `visibility` (double precision) - Visibility in kilometers
  - `wind_speed` (double precision) - Wind speed in km/h
  - `precipitation` (double precision) - Precipitation in mm/h
  - `temperature` (double precision) - Temperature in Celsius
  - `raw_data` (jsonb) - Raw API response data
  - `created_at` (timestamptz) - Record creation timestamp

  ### `qkd_metrics`
  - `id` (uuid, primary key) - Unique identifier
  - `satellite_id` (uuid) - Reference to satellites table
  - `timestamp` (timestamptz) - Measurement timestamp
  - `qber` (double precision) - Quantum bit error rate percentage
  - `key_rate_kbps` (double precision) - Key generation rate in kbps
  - `sifted_bits` (integer) - Number of sifted bits
  - `pa_ratio` (double precision) - Privacy amplification ratio
  - `link_quality` (double precision) - Overall link quality score (0-1)
  - `created_at` (timestamptz) - Record creation timestamp

  ## Security
  - Enable Row Level Security (RLS) on all tables
  - Public read access for authenticated users (monitoring use case)
  - Insert/Update restricted to service role

  ## Indexes
  - Time-series indexes on timestamp columns for efficient querying
  - Foreign key indexes for join performance
  - Partial indexes for active records

  ## Data Retention
  - Telemetry archive: 7 days raw, 30 days aggregated
  - Weather data: 24 hours detailed, 7 days summary
  - QKD metrics: 24 hours full resolution
*/

-- Create ground_nodes table
CREATE TABLE IF NOT EXISTS ground_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  latitude double precision NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude double precision NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  tier smallint NOT NULL CHECK (tier IN (1, 2, 3)),
  demand_gbps double precision NOT NULL DEFAULT 0 CHECK (demand_gbps >= 0),
  weather_score double precision NOT NULL DEFAULT 1.0 CHECK (weather_score >= 0 AND weather_score <= 1.0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'degraded', 'offline')),
  created_at timestamptz DEFAULT now(),
  last_updated timestamptz DEFAULT now()
);

-- Create satellites table
CREATE TABLE IF NOT EXISTS satellites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  latitude double precision NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude double precision NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  altitude double precision NOT NULL CHECK (altitude > 0),
  jammed boolean NOT NULL DEFAULT false,
  qber double precision NOT NULL DEFAULT 0 CHECK (qber >= 0 AND qber <= 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'degraded', 'offline')),
  created_at timestamptz DEFAULT now(),
  last_updated timestamptz DEFAULT now()
);

-- Create telemetry_archive table
CREATE TABLE IF NOT EXISTS telemetry_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  node_id uuid NOT NULL,
  node_type text NOT NULL CHECK (node_type IN ('ground_node', 'satellite')),
  metric_type text NOT NULL,
  value double precision NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create weather_data table
CREATE TABLE IF NOT EXISTS weather_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES ground_nodes(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL DEFAULT now(),
  conditions text NOT NULL DEFAULT 'unknown',
  cloud_cover double precision CHECK (cloud_cover >= 0 AND cloud_cover <= 100),
  visibility double precision CHECK (visibility >= 0),
  wind_speed double precision CHECK (wind_speed >= 0),
  precipitation double precision CHECK (precipitation >= 0),
  temperature double precision,
  raw_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create qkd_metrics table
CREATE TABLE IF NOT EXISTS qkd_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  satellite_id uuid NOT NULL REFERENCES satellites(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL DEFAULT now(),
  qber double precision NOT NULL CHECK (qber >= 0 AND qber <= 100),
  key_rate_kbps double precision NOT NULL CHECK (key_rate_kbps >= 0),
  sifted_bits integer NOT NULL DEFAULT 0 CHECK (sifted_bits >= 0),
  pa_ratio double precision NOT NULL DEFAULT 0.5 CHECK (pa_ratio >= 0 AND pa_ratio <= 1),
  link_quality double precision NOT NULL DEFAULT 1.0 CHECK (link_quality >= 0 AND link_quality <= 1),
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ground_nodes_status ON ground_nodes(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_satellites_status ON satellites(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_archive(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_node ON telemetry_archive(node_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_weather_location ON weather_data(location_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_weather_timestamp ON weather_data(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_qkd_satellite ON qkd_metrics(satellite_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_qkd_timestamp ON qkd_metrics(timestamp DESC);

-- Enable Row Level Security
ALTER TABLE ground_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE satellites ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE qkd_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Public read access for monitoring
CREATE POLICY "Allow public read access to ground_nodes"
  ON ground_nodes FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to satellites"
  ON satellites FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to telemetry_archive"
  ON telemetry_archive FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to weather_data"
  ON weather_data FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to qkd_metrics"
  ON qkd_metrics FOR SELECT
  TO anon, authenticated
  USING (true);

-- Insert sample ground nodes
INSERT INTO ground_nodes (name, latitude, longitude, tier, demand_gbps, weather_score)
VALUES
  ('GN-001', 37.7749, -122.4194, 1, 8.5, 0.92),
  ('GN-002', 51.5074, -0.1278, 2, 5.3, 0.78),
  ('GN-003', 35.6762, 139.6503, 1, 9.2, 0.95),
  ('GN-004', -33.8688, 151.2093, 3, 3.7, 0.88),
  ('GN-005', 40.7128, -74.0060, 1, 7.8, 0.85)
ON CONFLICT DO NOTHING;

-- Insert sample satellites
INSERT INTO satellites (name, latitude, longitude, altitude, jammed, qber)
VALUES
  ('SAT-1', 45.2, -120.5, 7500, false, 3.2),
  ('SAT-2', -12.8, 78.3, 7200, false, 2.8),
  ('SAT-3', 62.1, -45.7, 7800, false, 4.1),
  ('SAT-4', -28.5, 145.2, 7350, false, 3.5)
ON CONFLICT DO NOTHING;
