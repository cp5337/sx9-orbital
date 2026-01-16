/*
  # Add inclination column to satellites table

  1. Changes
    - Add `inclination` column to satellites table (double precision, default 53 degrees for typical LEO constellation)
    - This column is required for orbital mechanics calculations
    - Default value represents a common inclination for LEO satellites

  2. Notes
    - Existing satellites will get the default inclination value
    - Future satellites should specify their actual inclination when inserted
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'satellites' AND column_name = 'inclination'
  ) THEN
    ALTER TABLE satellites ADD COLUMN inclination double precision DEFAULT 53.0;
  END IF;
END $$;
