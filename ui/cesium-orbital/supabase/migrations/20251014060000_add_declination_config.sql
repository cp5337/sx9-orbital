/*
  # Ground Station Declination Configuration Schema

  ## New Tables

  ### `ground_station_declination_config`
  - `id` (uuid, primary key)
  - `ground_node_id` (uuid, foreign key) - Reference to ground_nodes
  - `preset_type` (text) - Preset type: basic, operational, precision, custom
  - `angles_deg` (double precision array) - Declination angles in degrees
  - `is_custom` (boolean) - Whether custom angles are used
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `declination_angle_presets`
  - `id` (uuid, primary key)
  - `name` (text, unique) - Preset name
  - `description` (text) - Description
  - `angles_deg` (double precision array) - Preset angle values
  - `use_case` (text) - Use case description
  - `created_at` (timestamptz) - Creation timestamp

  ### `station_link_performance`
  - `id` (uuid, primary key)
  - `ground_node_id` (uuid, foreign key)
  - `elevation_deg` (double precision) - Elevation angle
  - `quality_score` (double precision) - Link quality score (0-1)
  - `atmospheric_transmission` (double precision) - Transmission factor
  - `link_budget_margin_db` (double precision) - Link margin in dB
  - `weather_conditions` (jsonb) - Weather condition snapshot
  - `timestamp` (timestamptz) - Measurement timestamp
  - `created_at` (timestamptz) - Record creation

  ## Security
  - Enable RLS on all tables
  - Public read access for monitoring
*/

-- Ground station declination configuration
CREATE TABLE IF NOT EXISTS ground_station_declination_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ground_node_id uuid NOT NULL REFERENCES ground_nodes(id) ON DELETE CASCADE,
  preset_type text NOT NULL CHECK (preset_type IN ('basic', 'operational', 'precision', 'custom')),
  angles_deg double precision[] NOT NULL,
  is_custom boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(ground_node_id)
);

-- Declination angle presets
CREATE TABLE IF NOT EXISTS declination_angle_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  angles_deg double precision[] NOT NULL,
  use_case text,
  created_at timestamptz DEFAULT now()
);

-- Link performance tracking
CREATE TABLE IF NOT EXISTS station_link_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ground_node_id uuid NOT NULL REFERENCES ground_nodes(id) ON DELETE CASCADE,
  elevation_deg double precision NOT NULL,
  quality_score double precision CHECK (quality_score >= 0 AND quality_score <= 1),
  atmospheric_transmission double precision,
  link_budget_margin_db double precision,
  weather_conditions jsonb DEFAULT '{}'::jsonb,
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_declination_config_node
  ON ground_station_declination_config(ground_node_id);

CREATE INDEX IF NOT EXISTS idx_link_performance_node_time
  ON station_link_performance(ground_node_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_link_performance_elevation
  ON station_link_performance(elevation_deg);

-- Enable RLS
ALTER TABLE ground_station_declination_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE declination_angle_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_link_performance ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow public read declination config"
  ON ground_station_declination_config FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read presets"
  ON declination_angle_presets FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read link performance"
  ON station_link_performance FOR SELECT
  TO anon, authenticated
  USING (true);

-- Insert standard presets
INSERT INTO declination_angle_presets (name, description, angles_deg, use_case) VALUES
  ('Basic', 'Minimum viable set for basic operations',
   ARRAY[10.0, 20.0, 45.0, 70.0, 90.0],
   'Basic operations with minimal complexity'),
  ('Operational', 'Standard operational configuration',
   ARRAY[5.0, 10.0, 15.0, 30.0, 45.0, 60.0, 75.0, 90.0],
   'Full operational capability'),
  ('Precision', 'High-resolution tracking and analysis',
   ARRAY[5.0, 7.5, 10.0, 12.5, 15.0, 20.0, 25.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 85.0, 90.0],
   'Research or high-precision tracking')
ON CONFLICT (name) DO NOTHING;
