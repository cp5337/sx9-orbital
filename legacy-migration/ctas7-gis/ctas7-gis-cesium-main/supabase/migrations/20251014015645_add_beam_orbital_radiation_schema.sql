/*
  # Beam Management and Orbital Mechanics Schema Extension

  ## Overview
  Extends SpaceWorld schema to support dynamic beam assignment, orbital mechanics,
  radiation belt modeling, and entropy harvesting for quantum key distribution.

  ## New Tables

  ### `orbital_elements`
  - `id` (uuid, primary key) - Unique identifier
  - `satellite_id` (uuid, foreign key) - Reference to satellites table
  - `epoch` (timestamptz) - TLE epoch timestamp
  - `mean_motion` (double precision) - Mean motion in revolutions per day
  - `eccentricity` (double precision) - Orbital eccentricity (0-1)
  - `inclination_deg` (double precision) - Orbital inclination in degrees
  - `raan_deg` (double precision) - Right ascension of ascending node (degrees)
  - `arg_perigee_deg` (double precision) - Argument of perigee (degrees)
  - `mean_anomaly_deg` (double precision) - Mean anomaly at epoch (degrees)
  - `bstar_drag` (double precision) - B* drag term for atmospheric drag
  - `semimajor_axis_km` (double precision) - Calculated semi-major axis
  - `orbital_period_min` (double precision) - Orbital period in minutes
  - `tle_line1` (text) - Full TLE line 1 for SGP4 propagation
  - `tle_line2` (text) - Full TLE line 2 for SGP4 propagation
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `radiation_parameters`
  - `id` (uuid, primary key) - Unique identifier
  - `satellite_id` (uuid, foreign key) - Reference to satellites table
  - `timestamp` (timestamptz) - Measurement timestamp
  - `l_shell` (double precision) - L-shell parameter (Earth radii)
  - `b_field_magnitude_nt` (double precision) - Magnetic field magnitude (nanoTesla)
  - `b_field_x_nt` (double precision) - Magnetic field X component (ECI frame)
  - `b_field_y_nt` (double precision) - Magnetic field Y component
  - `b_field_z_nt` (double precision) - Magnetic field Z component
  - `radiation_flux` (double precision) - Total radiation flux (particles/cm²/s)
  - `proton_flux_gt10mev` (double precision) - Proton flux >10 MeV
  - `electron_flux_gt1mev` (double precision) - Electron flux >1 MeV
  - `in_radiation_belt` (boolean) - Whether currently in Van Allen belts
  - `in_saa` (boolean) - Whether in South Atlantic Anomaly
  - `seu_probability` (double precision) - Single event upset probability (0-1)
  - `total_dose_rad` (double precision) - Cumulative radiation dose (rad)
  - `geomagnetic_latitude_deg` (double precision) - Geomagnetic latitude
  - `geomagnetic_longitude_deg` (double precision) - Geomagnetic longitude
  - `created_at` (timestamptz) - Record creation timestamp

  ### `beams`
  - `id` (uuid, primary key) - Unique identifier for beam
  - `beam_type` (text) - Type: 'space_to_ground' or 'satellite_to_satellite'
  - `source_node_id` (uuid) - Source satellite ID
  - `source_node_type` (text) - Always 'satellite' for current phase
  - `target_node_id` (uuid) - Target ground node or satellite ID
  - `target_node_type` (text) - 'ground_node' or 'satellite'
  - `beam_status` (text) - Status: 'active', 'standby', 'degraded', 'offline'
  - `link_quality_score` (double precision) - Composite quality metric (0-1)
  - `assignment_timestamp` (timestamptz) - When beam was assigned
  - `last_handoff_timestamp` (timestamptz) - Last target change time
  - `throughput_gbps` (double precision) - Current throughput in Gbps
  - `latency_ms` (double precision) - Round-trip latency in milliseconds
  - `jitter_ms` (double precision) - Latency variance in milliseconds
  - `packet_loss_percent` (double precision) - Packet loss percentage
  - `qber` (double precision) - Quantum bit error rate (0-100)
  - `optical_power_dbm` (double precision) - Optical power in dBm
  - `pointing_error_urad` (double precision) - Pointing error in microradians
  - `atmospheric_attenuation_db` (double precision) - Atmospheric loss (ground links)
  - `distance_km` (double precision) - Link distance in kilometers
  - `azimuth_deg` (double precision) - Azimuth angle in degrees
  - `elevation_deg` (double precision) - Elevation angle in degrees
  - `relative_velocity_km_s` (double precision) - Relative velocity (ISL only)
  - `doppler_shift_ghz` (double precision) - Doppler shift in GHz
  - `beam_divergence_urad` (double precision) - Beam divergence in microradians
  - `spot_size_m` (double precision) - Beam spot size at target in meters
  - `weather_score` (double precision) - Ground node weather quality (0-1)
  - `cloud_opacity_percent` (double precision) - Cloud opacity percentage
  - `rain_attenuation_db` (double precision) - Rain attenuation in dB
  - `scintillation_index` (double precision) - Atmospheric scintillation index
  - `radiation_flux_at_source` (double precision) - Radiation at source satellite
  - `in_radiation_belt` (boolean) - Source satellite in Van Allen belts
  - `saa_affected` (boolean) - Affected by South Atlantic Anomaly
  - `entropy_harvest_rate_kbps` (double precision) - Entropy generation rate (Phase 2)
  - `beam_edge_entropy_active` (boolean) - Beam edge entropy harvesting enabled
  - `qkd_key_generation_rate_kbps` (double precision) - QKD key rate
  - `key_buffer_bits` (bigint) - Available key buffer size
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `beam_telemetry_history`
  - `id` (uuid, primary key) - Unique identifier
  - `beam_id` (uuid, foreign key) - Reference to beams table
  - `timestamp` (timestamptz) - Measurement timestamp
  - `link_quality_snapshot` (double precision) - Quality score at time
  - `throughput_snapshot` (double precision) - Throughput at time (Gbps)
  - `qber_snapshot` (double precision) - QBER at time
  - `environmental_conditions` (jsonb) - Weather, radiation, geometry snapshot
  - `created_at` (timestamptz) - Record creation timestamp

  ### `beam_handoff_events`
  - `id` (uuid, primary key) - Unique identifier
  - `beam_id` (uuid, foreign key) - Reference to beams table
  - `old_target_id` (uuid) - Previous target node ID
  - `new_target_id` (uuid) - New target node ID
  - `handoff_reason` (text) - Reason: 'weather_degradation', 'radiation_avoidance', 'optimization', 'node_failure'
  - `handoff_latency_ms` (double precision) - Time to complete handoff
  - `old_quality_score` (double precision) - Quality before handoff
  - `new_quality_score` (double precision) - Quality after handoff
  - `timestamp` (timestamptz) - Handoff completion timestamp
  - `created_at` (timestamptz) - Record creation timestamp

  ### `beam_routing_decisions`
  - `id` (uuid, primary key) - Unique identifier
  - `timestamp` (timestamptz) - Decision timestamp
  - `satellite_id` (uuid) - Satellite making decision
  - `candidate_targets` (jsonb) - Array of {node_id, score, factors}
  - `selected_target_id` (uuid) - Chosen target node
  - `decision_algorithm` (text) - Algorithm used: 'trading_engine', 'rule_based', 'manual'
  - `execution_time_us` (double precision) - Decision time in microseconds
  - `created_at` (timestamptz) - Record creation timestamp

  ### `belt_transit_events`
  - `id` (uuid, primary key) - Unique identifier
  - `satellite_id` (uuid, foreign key) - Reference to satellites table
  - `entry_timestamp` (timestamptz) - Belt entry time
  - `exit_timestamp` (timestamptz) - Belt exit time (null if still inside)
  - `belt_type` (text) - Type: 'inner_belt', 'outer_belt', 'saa'
  - `peak_flux` (double precision) - Maximum flux encountered
  - `peak_l_shell` (double precision) - L-shell at peak flux
  - `mitigation_applied` (boolean) - Whether automatic mitigation triggered
  - `entropy_harvested_mb` (double precision) - Total entropy collected (Phase 2)
  - `created_at` (timestamptz) - Record creation timestamp

  ### `entropy_signals`
  - `id` (uuid, primary key) - Unique identifier
  - `satellite_id` (uuid, foreign key) - Reference to satellites table
  - `timestamp` (timestamptz) - Measurement timestamp
  - `coil_voltage_mv` (double precision) - Induction voltage in millivolts
  - `magnetic_field_rate_nt_s` (double precision) - dB/dt in nT/s
  - `entropy_rate_kbps` (double precision) - Raw entropy generation rate
  - `shannon_entropy` (double precision) - Shannon entropy estimate (bits)
  - `min_entropy` (double precision) - Min-entropy estimate (conservative)
  - `nist_tests_passed` (integer) - Number of NIST randomness tests passed
  - `quality_score` (double precision) - Entropy quality metric (0-1)
  - `l_shell` (double precision) - L-shell at measurement
  - `created_at` (timestamptz) - Record creation timestamp

  ### `qkd_mapping`
  - `id` (uuid, primary key) - Unique identifier
  - `beam_id` (uuid, foreign key) - Reference to beams table
  - `timestamp` (timestamptz) - Mapping timestamp
  - `entropy_source` (text) - Source: 'beam_edge', 'radiation_belt', 'hybrid'
  - `basis_reconciliation_rate` (double precision) - BB84 basis agreement rate
  - `raw_key_bits` (bigint) - Raw key bits before correction
  - `sifted_key_bits` (bigint) - Bits after basis reconciliation
  - `corrected_key_bits` (bigint) - Bits after error correction
  - `final_secure_bits` (bigint) - Bits after privacy amplification
  - `key_generation_efficiency` (double precision) - Final/raw ratio
  - `created_at` (timestamptz) - Record creation timestamp

  ## Security
  - Enable RLS on all tables
  - Public read access for authenticated users (monitoring)
  - Insert/Update restricted to service role for integrity

  ## Indexes
  - Time-series indexes on all timestamp columns
  - Composite indexes for beam quality sorting
  - Foreign key indexes for join performance
  - Partial indexes for active beams

  ## Important Notes
  1. Radiation modeling uses IGRF-13 magnetic field model
  2. L-shell calculations use McIlwain approximation
  3. Beam quality uses multi-factor composite scoring
  4. Entropy harvesting Phase 2 fields ready but not active
  5. Trading engine integration via beam_routing_decisions table
*/

-- Create orbital_elements table
CREATE TABLE IF NOT EXISTS orbital_elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  satellite_id uuid NOT NULL REFERENCES satellites(id) ON DELETE CASCADE,
  epoch timestamptz NOT NULL,
  mean_motion double precision NOT NULL CHECK (mean_motion > 0),
  eccentricity double precision NOT NULL CHECK (eccentricity >= 0 AND eccentricity < 1),
  inclination_deg double precision NOT NULL CHECK (inclination_deg >= 0 AND inclination_deg <= 180),
  raan_deg double precision NOT NULL CHECK (raan_deg >= 0 AND raan_deg < 360),
  arg_perigee_deg double precision NOT NULL CHECK (arg_perigee_deg >= 0 AND arg_perigee_deg < 360),
  mean_anomaly_deg double precision NOT NULL CHECK (mean_anomaly_deg >= 0 AND mean_anomaly_deg < 360),
  bstar_drag double precision NOT NULL DEFAULT 0,
  semimajor_axis_km double precision,
  orbital_period_min double precision,
  tle_line1 text,
  tle_line2 text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create radiation_parameters table
CREATE TABLE IF NOT EXISTS radiation_parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  satellite_id uuid NOT NULL REFERENCES satellites(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL DEFAULT now(),
  l_shell double precision CHECK (l_shell > 0),
  b_field_magnitude_nt double precision CHECK (b_field_magnitude_nt >= 0),
  b_field_x_nt double precision,
  b_field_y_nt double precision,
  b_field_z_nt double precision,
  radiation_flux double precision DEFAULT 0 CHECK (radiation_flux >= 0),
  proton_flux_gt10mev double precision DEFAULT 0 CHECK (proton_flux_gt10mev >= 0),
  electron_flux_gt1mev double precision DEFAULT 0 CHECK (electron_flux_gt1mev >= 0),
  in_radiation_belt boolean DEFAULT false,
  in_saa boolean DEFAULT false,
  seu_probability double precision DEFAULT 0 CHECK (seu_probability >= 0 AND seu_probability <= 1),
  total_dose_rad double precision DEFAULT 0 CHECK (total_dose_rad >= 0),
  geomagnetic_latitude_deg double precision,
  geomagnetic_longitude_deg double precision,
  created_at timestamptz DEFAULT now()
);

-- Create beams table
CREATE TABLE IF NOT EXISTS beams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beam_type text NOT NULL CHECK (beam_type IN ('space_to_ground', 'satellite_to_satellite')),
  source_node_id uuid NOT NULL,
  source_node_type text NOT NULL DEFAULT 'satellite' CHECK (source_node_type IN ('satellite', 'ground_node')),
  target_node_id uuid NOT NULL,
  target_node_type text NOT NULL CHECK (target_node_type IN ('satellite', 'ground_node')),
  beam_status text NOT NULL DEFAULT 'standby' CHECK (beam_status IN ('active', 'standby', 'degraded', 'offline')),
  link_quality_score double precision DEFAULT 0 CHECK (link_quality_score >= 0 AND link_quality_score <= 1),
  assignment_timestamp timestamptz,
  last_handoff_timestamp timestamptz,
  throughput_gbps double precision DEFAULT 0 CHECK (throughput_gbps >= 0),
  latency_ms double precision DEFAULT 0 CHECK (latency_ms >= 0),
  jitter_ms double precision DEFAULT 0 CHECK (jitter_ms >= 0),
  packet_loss_percent double precision DEFAULT 0 CHECK (packet_loss_percent >= 0 AND packet_loss_percent <= 100),
  qber double precision DEFAULT 0 CHECK (qber >= 0 AND qber <= 100),
  optical_power_dbm double precision,
  pointing_error_urad double precision DEFAULT 0 CHECK (pointing_error_urad >= 0),
  atmospheric_attenuation_db double precision DEFAULT 0 CHECK (atmospheric_attenuation_db >= 0),
  distance_km double precision CHECK (distance_km > 0),
  azimuth_deg double precision CHECK (azimuth_deg >= 0 AND azimuth_deg < 360),
  elevation_deg double precision CHECK (elevation_deg >= -90 AND elevation_deg <= 90),
  relative_velocity_km_s double precision,
  doppler_shift_ghz double precision,
  beam_divergence_urad double precision CHECK (beam_divergence_urad > 0),
  spot_size_m double precision CHECK (spot_size_m > 0),
  weather_score double precision DEFAULT 1.0 CHECK (weather_score >= 0 AND weather_score <= 1),
  cloud_opacity_percent double precision DEFAULT 0 CHECK (cloud_opacity_percent >= 0 AND cloud_opacity_percent <= 100),
  rain_attenuation_db double precision DEFAULT 0 CHECK (rain_attenuation_db >= 0),
  scintillation_index double precision DEFAULT 0 CHECK (scintillation_index >= 0),
  radiation_flux_at_source double precision DEFAULT 0 CHECK (radiation_flux_at_source >= 0),
  in_radiation_belt boolean DEFAULT false,
  saa_affected boolean DEFAULT false,
  entropy_harvest_rate_kbps double precision DEFAULT 0 CHECK (entropy_harvest_rate_kbps >= 0),
  beam_edge_entropy_active boolean DEFAULT false,
  qkd_key_generation_rate_kbps double precision DEFAULT 0 CHECK (qkd_key_generation_rate_kbps >= 0),
  key_buffer_bits bigint DEFAULT 0 CHECK (key_buffer_bits >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create beam_telemetry_history table
CREATE TABLE IF NOT EXISTS beam_telemetry_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beam_id uuid NOT NULL REFERENCES beams(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL DEFAULT now(),
  link_quality_snapshot double precision CHECK (link_quality_snapshot >= 0 AND link_quality_snapshot <= 1),
  throughput_snapshot double precision CHECK (throughput_snapshot >= 0),
  qber_snapshot double precision CHECK (qber_snapshot >= 0 AND qber_snapshot <= 100),
  environmental_conditions jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create beam_handoff_events table
CREATE TABLE IF NOT EXISTS beam_handoff_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beam_id uuid NOT NULL REFERENCES beams(id) ON DELETE CASCADE,
  old_target_id uuid NOT NULL,
  new_target_id uuid NOT NULL,
  handoff_reason text NOT NULL CHECK (handoff_reason IN ('weather_degradation', 'radiation_avoidance', 'optimization', 'node_failure')),
  handoff_latency_ms double precision CHECK (handoff_latency_ms >= 0),
  old_quality_score double precision CHECK (old_quality_score >= 0 AND old_quality_score <= 1),
  new_quality_score double precision CHECK (new_quality_score >= 0 AND new_quality_score <= 1),
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create beam_routing_decisions table
CREATE TABLE IF NOT EXISTS beam_routing_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  satellite_id uuid NOT NULL REFERENCES satellites(id) ON DELETE CASCADE,
  candidate_targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_target_id uuid,
  decision_algorithm text NOT NULL DEFAULT 'rule_based' CHECK (decision_algorithm IN ('trading_engine', 'rule_based', 'manual')),
  execution_time_us double precision CHECK (execution_time_us >= 0),
  created_at timestamptz DEFAULT now()
);

-- Create belt_transit_events table
CREATE TABLE IF NOT EXISTS belt_transit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  satellite_id uuid NOT NULL REFERENCES satellites(id) ON DELETE CASCADE,
  entry_timestamp timestamptz NOT NULL,
  exit_timestamp timestamptz,
  belt_type text NOT NULL CHECK (belt_type IN ('inner_belt', 'outer_belt', 'saa')),
  peak_flux double precision CHECK (peak_flux >= 0),
  peak_l_shell double precision CHECK (peak_l_shell > 0),
  mitigation_applied boolean DEFAULT false,
  entropy_harvested_mb double precision DEFAULT 0 CHECK (entropy_harvested_mb >= 0),
  created_at timestamptz DEFAULT now()
);

-- Create entropy_signals table
CREATE TABLE IF NOT EXISTS entropy_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  satellite_id uuid NOT NULL REFERENCES satellites(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL DEFAULT now(),
  coil_voltage_mv double precision,
  magnetic_field_rate_nt_s double precision,
  entropy_rate_kbps double precision DEFAULT 0 CHECK (entropy_rate_kbps >= 0),
  shannon_entropy double precision CHECK (shannon_entropy >= 0),
  min_entropy double precision CHECK (min_entropy >= 0),
  nist_tests_passed integer DEFAULT 0 CHECK (nist_tests_passed >= 0 AND nist_tests_passed <= 15),
  quality_score double precision DEFAULT 0 CHECK (quality_score >= 0 AND quality_score <= 1),
  l_shell double precision CHECK (l_shell > 0),
  created_at timestamptz DEFAULT now()
);

-- Create qkd_mapping table
CREATE TABLE IF NOT EXISTS qkd_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beam_id uuid NOT NULL REFERENCES beams(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL DEFAULT now(),
  entropy_source text NOT NULL CHECK (entropy_source IN ('beam_edge', 'radiation_belt', 'hybrid')),
  basis_reconciliation_rate double precision CHECK (basis_reconciliation_rate >= 0 AND basis_reconciliation_rate <= 1),
  raw_key_bits bigint DEFAULT 0 CHECK (raw_key_bits >= 0),
  sifted_key_bits bigint DEFAULT 0 CHECK (sifted_key_bits >= 0),
  corrected_key_bits bigint DEFAULT 0 CHECK (corrected_key_bits >= 0),
  final_secure_bits bigint DEFAULT 0 CHECK (final_secure_bits >= 0),
  key_generation_efficiency double precision CHECK (key_generation_efficiency >= 0 AND key_generation_efficiency <= 1),
  created_at timestamptz DEFAULT now()
);

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_orbital_elements_satellite ON orbital_elements(satellite_id);
CREATE INDEX IF NOT EXISTS idx_orbital_elements_epoch ON orbital_elements(epoch DESC);

CREATE INDEX IF NOT EXISTS idx_radiation_parameters_satellite ON radiation_parameters(satellite_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_radiation_parameters_belt ON radiation_parameters(in_radiation_belt) WHERE in_radiation_belt = true;
CREATE INDEX IF NOT EXISTS idx_radiation_parameters_saa ON radiation_parameters(in_saa) WHERE in_saa = true;
CREATE INDEX IF NOT EXISTS idx_radiation_parameters_timestamp ON radiation_parameters(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_beams_status ON beams(beam_status) WHERE beam_status = 'active';
CREATE INDEX IF NOT EXISTS idx_beams_quality ON beams(beam_type, beam_status, link_quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_beams_source ON beams(source_node_id);
CREATE INDEX IF NOT EXISTS idx_beams_target ON beams(target_node_id);
CREATE INDEX IF NOT EXISTS idx_beams_radiation ON beams(in_radiation_belt) WHERE in_radiation_belt = true;

CREATE INDEX IF NOT EXISTS idx_beam_telemetry_beam ON beam_telemetry_history(beam_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_beam_telemetry_timestamp ON beam_telemetry_history(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_beam_handoff_beam ON beam_handoff_events(beam_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_beam_handoff_timestamp ON beam_handoff_events(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_beam_routing_satellite ON beam_routing_decisions(satellite_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_beam_routing_timestamp ON beam_routing_decisions(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_belt_transit_satellite ON belt_transit_events(satellite_id, entry_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_belt_transit_active ON belt_transit_events(satellite_id) WHERE exit_timestamp IS NULL;

CREATE INDEX IF NOT EXISTS idx_entropy_signals_satellite ON entropy_signals(satellite_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_entropy_signals_timestamp ON entropy_signals(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_qkd_mapping_beam ON qkd_mapping(beam_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_qkd_mapping_timestamp ON qkd_mapping(timestamp DESC);

-- Enable Row Level Security on all tables
ALTER TABLE orbital_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE radiation_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE beams ENABLE ROW LEVEL SECURITY;
ALTER TABLE beam_telemetry_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE beam_handoff_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE beam_routing_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE belt_transit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE entropy_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE qkd_mapping ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Public read access for monitoring
CREATE POLICY "Allow public read access to orbital_elements"
  ON orbital_elements FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to radiation_parameters"
  ON radiation_parameters FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to beams"
  ON beams FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to beam_telemetry_history"
  ON beam_telemetry_history FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to beam_handoff_events"
  ON beam_handoff_events FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to beam_routing_decisions"
  ON beam_routing_decisions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to belt_transit_events"
  ON belt_transit_events FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to entropy_signals"
  ON entropy_signals FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to qkd_mapping"
  ON qkd_mapping FOR SELECT
  TO anon, authenticated
  USING (true);
