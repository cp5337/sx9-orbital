/*
  # Add metadata columns to ground_nodes

  Adds columns for human-readable station identification and geographic context:
  - station_code: Human-readable ID like "NYSE-MAHWAH"
  - city: City name
  - country: Country name
  - zone: Geographic zone (Americas, EMEA, APAC)
  - source: Data source (CableLanding, FinancialInfra, Equinix, etc.)
*/

-- Add new columns to ground_nodes
ALTER TABLE ground_nodes
  ADD COLUMN IF NOT EXISTS station_code text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS zone text,
  ADD COLUMN IF NOT EXISTS source text;

-- Create index on station_code for lookups
CREATE INDEX IF NOT EXISTS idx_ground_nodes_station_code ON ground_nodes(station_code);

-- Create index on zone for filtering
CREATE INDEX IF NOT EXISTS idx_ground_nodes_zone ON ground_nodes(zone);

-- Create index on source for filtering
CREATE INDEX IF NOT EXISTS idx_ground_nodes_source ON ground_nodes(source);
