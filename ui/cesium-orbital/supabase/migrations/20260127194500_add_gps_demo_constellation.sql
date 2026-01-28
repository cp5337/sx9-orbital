/*
  # GPS-style demo constellation (12 satellites)

  - 3 planes x 4 sats
  - MEO ~20,200 km altitude
  - 55° inclination
  - RAAN spacing 120°
  - Mean anomaly spacing 90°
*/

-- Optional config table for tuning/demo iteration
CREATE TABLE IF NOT EXISTS constellation_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pattern text NOT NULL,
  planes smallint NOT NULL CHECK (planes > 0),
  sats_per_plane smallint NOT NULL CHECK (sats_per_plane > 0),
  altitude_km double precision NOT NULL CHECK (altitude_km > 0),
  inclination_deg double precision NOT NULL CHECK (inclination_deg >= 0 AND inclination_deg <= 180),
  raan_spacing_deg double precision NOT NULL CHECK (raan_spacing_deg > 0),
  slot_spacing_deg double precision NOT NULL CHECK (slot_spacing_deg > 0),
  mean_motion_rev_per_day double precision NOT NULL CHECK (mean_motion_rev_per_day > 0),
  orbital_period_min double precision NOT NULL CHECK (orbital_period_min > 0),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE constellation_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access to constellation_config"
  ON constellation_config FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO constellation_config (
  name,
  pattern,
  planes,
  sats_per_plane,
  altitude_km,
  inclination_deg,
  raan_spacing_deg,
  slot_spacing_deg,
  mean_motion_rev_per_day,
  orbital_period_min
)
VALUES (
  'gps-demo-12',
  'gps-style',
  3,
  4,
  20200,
  55,
  120,
  90,
  2.005,
  717.98
)
ON CONFLICT DO NOTHING;

WITH sat_specs AS (
  SELECT *
  FROM (VALUES
    ('GPS-A1', 0, 1, 0, 0),
    ('GPS-A2', 0, 2, 0, 90),
    ('GPS-A3', 0, 3, 0, 180),
    ('GPS-A4', 0, 4, 0, 270),
    ('GPS-B1', 1, 1, 120, 0),
    ('GPS-B2', 1, 2, 120, 90),
    ('GPS-B3', 1, 3, 120, 180),
    ('GPS-B4', 1, 4, 120, 270),
    ('GPS-C1', 2, 1, 240, 0),
    ('GPS-C2', 2, 2, 240, 90),
    ('GPS-C3', 2, 3, 240, 180),
    ('GPS-C4', 2, 4, 240, 270)
  ) AS t(name, plane_index, slot_index, raan_deg, mean_anomaly_deg)
),
inserted_sats AS (
  INSERT INTO satellites (name, latitude, longitude, altitude, jammed, qber, status)
  SELECT
    name,
    0.0 AS latitude,
    CASE
      WHEN mean_anomaly_deg > 180 THEN mean_anomaly_deg - 360
      ELSE mean_anomaly_deg
    END AS longitude,
    20200 AS altitude,
    false AS jammed,
    0 AS qber,
    'active' AS status
  FROM sat_specs
  ON CONFLICT DO NOTHING
  RETURNING id, name
)
INSERT INTO orbital_elements (
  satellite_id,
  epoch,
  mean_motion,
  eccentricity,
  inclination_deg,
  raan_deg,
  arg_perigee_deg,
  mean_anomaly_deg,
  bstar_drag,
  semimajor_axis_km,
  orbital_period_min
)
SELECT
  s.id,
  now() AS epoch,
  2.005 AS mean_motion,
  0.01 AS eccentricity,
  55 AS inclination_deg,
  spec.raan_deg,
  0 AS arg_perigee_deg,
  spec.mean_anomaly_deg,
  0 AS bstar_drag,
  26571 AS semimajor_axis_km,
  717.98 AS orbital_period_min
FROM inserted_sats s
JOIN sat_specs spec ON spec.name = s.name
ON CONFLICT DO NOTHING;
