/*
  # Fix kali_tasks HD4 Phases

  ## RFC-9300 Canonical HD4 Phases (NORMATIVE ORDER)

  1. Hunt     - Active threat-seeking; persistent reconnaissance
  2. Detect   - Positive identification; confirmation of threat indicators
  3. Disrupt  - Active interference; degradation of adversary capability
  4. Disable  - Neutralization of threat capability
  5. Dominate - Full control assertion; exploitation

  NOTE: There is NO "Defend" phase. The correct sequence is:
  HUNT → DETECT → DISRUPT → DISABLE → DOMINATE

  This migration:
  1. Creates the kali_tasks table if it doesn't exist with correct HD4 constraint
  2. Updates any existing invalid hd4_phase values
  3. Distributes tasks across proper HD4 phases based on task characteristics
*/

-- Create kali_tasks table if it doesn't exist
CREATE TABLE IF NOT EXISTS kali_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_name text NOT NULL,
  command text,
  description text,
  category text,
  tool_name text,
  hd4_phase text NOT NULL DEFAULT 'Hunt' CHECK (hd4_phase IN ('Hunt', 'Detect', 'Disrupt', 'Disable', 'Dominate')),
  mitre_tactics text[],
  severity text DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  domain text DEFAULT 'cyber' CHECK (domain IN ('cyber', 'kinetic', 'cognitive', 'hybrid')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Drop existing constraint if it has wrong values (like 'Defend')
ALTER TABLE kali_tasks DROP CONSTRAINT IF EXISTS kali_tasks_hd4_phase_check;

-- Add correct HD4 phase constraint per RFC-9300
ALTER TABLE kali_tasks ADD CONSTRAINT kali_tasks_hd4_phase_check
  CHECK (hd4_phase IN ('Hunt', 'Detect', 'Disrupt', 'Disable', 'Dominate'));

-- Fix any invalid phase values (e.g., 'Defend' → 'Disable')
UPDATE kali_tasks SET hd4_phase = 'Disable' WHERE hd4_phase = 'Defend';

-- Distribute tasks across HD4 phases based on task characteristics
-- Hunt: Reconnaissance, scanning, enumeration tasks
UPDATE kali_tasks
SET hd4_phase = 'Hunt', updated_at = now()
WHERE (
  lower(task_name) LIKE '%scan%' OR
  lower(task_name) LIKE '%recon%' OR
  lower(task_name) LIKE '%enum%' OR
  lower(task_name) LIKE '%discover%' OR
  lower(task_name) LIKE '%probe%' OR
  lower(task_name) LIKE '%fingerprint%' OR
  lower(task_name) LIKE '%identify%' OR
  lower(command) LIKE '%nmap%' OR
  lower(command) LIKE '%enum4linux%' OR
  lower(command) LIKE '%dirb%' OR
  lower(command) LIKE '%nikto%' OR
  lower(category) LIKE '%reconnaissance%' OR
  lower(category) LIKE '%scanning%'
);

-- Detect: Analysis, validation, confirmation tasks
UPDATE kali_tasks
SET hd4_phase = 'Detect', updated_at = now()
WHERE (
  lower(task_name) LIKE '%detect%' OR
  lower(task_name) LIKE '%analyze%' OR
  lower(task_name) LIKE '%validate%' OR
  lower(task_name) LIKE '%verify%' OR
  lower(task_name) LIKE '%confirm%' OR
  lower(task_name) LIKE '%inspect%' OR
  lower(command) LIKE '%wireshark%' OR
  lower(command) LIKE '%tcpdump%' OR
  lower(command) LIKE '%snort%' OR
  lower(category) LIKE '%analysis%' OR
  lower(category) LIKE '%detection%'
) AND hd4_phase = 'Hunt';  -- Only update if not already categorized

-- Disrupt: Interference, degradation, disruption tasks
UPDATE kali_tasks
SET hd4_phase = 'Disrupt', updated_at = now()
WHERE (
  lower(task_name) LIKE '%disrupt%' OR
  lower(task_name) LIKE '%interfere%' OR
  lower(task_name) LIKE '%jam%' OR
  lower(task_name) LIKE '%spoof%' OR
  lower(task_name) LIKE '%inject%' OR
  lower(task_name) LIKE '%intercept%' OR
  lower(task_name) LIKE '%mitm%' OR
  lower(task_name) LIKE '%dos%' OR
  lower(task_name) LIKE '%flood%' OR
  lower(command) LIKE '%ettercap%' OR
  lower(command) LIKE '%bettercap%' OR
  lower(command) LIKE '%arpspoof%' OR
  lower(command) LIKE '%dnsspoof%' OR
  lower(category) LIKE '%disruption%' OR
  lower(category) LIKE '%interference%'
) AND hd4_phase = 'Hunt';

-- Disable: Exploitation, credential access, system compromise
UPDATE kali_tasks
SET hd4_phase = 'Disable', updated_at = now()
WHERE (
  lower(task_name) LIKE '%exploit%' OR
  lower(task_name) LIKE '%crack%' OR
  lower(task_name) LIKE '%brute%' OR
  lower(task_name) LIKE '%bypass%' OR
  lower(task_name) LIKE '%escalat%' OR
  lower(task_name) LIKE '%dump%' OR
  lower(task_name) LIKE '%extract%' OR
  lower(task_name) LIKE '%pwn%' OR
  lower(command) LIKE '%metasploit%' OR
  lower(command) LIKE '%msfconsole%' OR
  lower(command) LIKE '%hashcat%' OR
  lower(command) LIKE '%john%' OR
  lower(command) LIKE '%hydra%' OR
  lower(command) LIKE '%sqlmap%' OR
  lower(category) LIKE '%exploitation%' OR
  lower(category) LIKE '%password%'
) AND hd4_phase = 'Hunt';

-- Dominate: Control, persistence, exfiltration tasks
UPDATE kali_tasks
SET hd4_phase = 'Dominate', updated_at = now()
WHERE (
  lower(task_name) LIKE '%persist%' OR
  lower(task_name) LIKE '%backdoor%' OR
  lower(task_name) LIKE '%exfil%' OR
  lower(task_name) LIKE '%control%' OR
  lower(task_name) LIKE '%c2%' OR
  lower(task_name) LIKE '%command%' OR
  lower(task_name) LIKE '%pivot%' OR
  lower(task_name) LIKE '%tunnel%' OR
  lower(task_name) LIKE '%lateral%' OR
  lower(command) LIKE '%cobalt%' OR
  lower(command) LIKE '%empire%' OR
  lower(command) LIKE '%covenant%' OR
  lower(command) LIKE '%sliver%' OR
  lower(category) LIKE '%post-exploit%' OR
  lower(category) LIKE '%persistence%' OR
  lower(category) LIKE '%c2%'
) AND hd4_phase = 'Hunt';

-- Create index for HD4 phase queries
CREATE INDEX IF NOT EXISTS idx_kali_tasks_hd4_phase ON kali_tasks(hd4_phase);

-- Enable RLS
ALTER TABLE kali_tasks ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY IF NOT EXISTS "Allow public read access to kali_tasks"
  ON kali_tasks FOR SELECT
  TO anon, authenticated
  USING (true);

-- Create a view showing HD4 phase distribution
CREATE OR REPLACE VIEW kali_tasks_hd4_summary AS
SELECT
  hd4_phase,
  COUNT(*) as task_count,
  ARRAY_AGG(task_name ORDER BY task_name LIMIT 5) as sample_tasks
FROM kali_tasks
GROUP BY hd4_phase
ORDER BY
  CASE hd4_phase
    WHEN 'Hunt' THEN 1
    WHEN 'Detect' THEN 2
    WHEN 'Disrupt' THEN 3
    WHEN 'Disable' THEN 4
    WHEN 'Dominate' THEN 5
  END;

-- Comment explaining HD4 framework
COMMENT ON TABLE kali_tasks IS 'Kali security tasks mapped to HD4 operational phases (RFC-9300). Phases: Hunt→Detect→Disrupt→Disable→Dominate. NO "Defend" phase exists.';
COMMENT ON COLUMN kali_tasks.hd4_phase IS 'HD4 operational phase per RFC-9300: Hunt, Detect, Disrupt, Disable, Dominate (in that order)';
