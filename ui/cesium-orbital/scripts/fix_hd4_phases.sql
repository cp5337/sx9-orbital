-- ============================================================
-- HD4 Phase Fix Script - Run in Supabase SQL Editor
-- ============================================================
-- RFC-9300 Canonical HD4 Phases:
--   1. Hunt     (H)   - Active threat-seeking
--   2. Detect   (D¹)  - Positive identification
--   3. Disrupt  (D²)  - Active interference
--   4. Disable  (D³)  - Neutralization
--   5. Dominate (D⁴)  - Full control
--
-- ⚠️ There is NO "Defend" phase! The user confirmed:
--    "It Hunt, Detect, Disrupt, Disable, Dominate - there is not DEFEND"
-- ============================================================

-- Step 1: Check current phase distribution (diagnostic)
SELECT
  hd4_phase,
  COUNT(*) as count
FROM kali_tasks
GROUP BY hd4_phase
ORDER BY hd4_phase;

-- Step 2: Fix any "Defend" values → "Disable" (closest match)
UPDATE kali_tasks
SET hd4_phase = 'Disable'
WHERE hd4_phase = 'Defend';

-- Step 3: Drop old constraint and add correct one
ALTER TABLE kali_tasks DROP CONSTRAINT IF EXISTS kali_tasks_hd4_phase_check;
ALTER TABLE kali_tasks ADD CONSTRAINT kali_tasks_hd4_phase_check
  CHECK (hd4_phase IN ('Hunt', 'Detect', 'Disrupt', 'Disable', 'Dominate'));

-- Step 4: Distribute tasks by keyword matching (if all currently 'Hunt')
-- Hunt phase: reconnaissance, scanning
UPDATE kali_tasks SET hd4_phase = 'Hunt' WHERE
  (lower(task_name) ~ '(scan|recon|enum|discover|probe|fingerprint)' OR
   lower(tool_name) ~ '(nmap|nikto|dirb|gobuster|masscan)');

-- Detect phase: analysis, validation
UPDATE kali_tasks SET hd4_phase = 'Detect' WHERE
  hd4_phase = 'Hunt' AND
  (lower(task_name) ~ '(detect|analyze|validate|verify|monitor|inspect)' OR
   lower(tool_name) ~ '(wireshark|tcpdump|snort|zeek)');

-- Disrupt phase: interference, degradation
UPDATE kali_tasks SET hd4_phase = 'Disrupt' WHERE
  hd4_phase = 'Hunt' AND
  (lower(task_name) ~ '(disrupt|spoof|inject|intercept|mitm|jam|flood)' OR
   lower(tool_name) ~ '(ettercap|bettercap|arpspoof|responder)');

-- Disable phase: exploitation, credential access
UPDATE kali_tasks SET hd4_phase = 'Disable' WHERE
  hd4_phase = 'Hunt' AND
  (lower(task_name) ~ '(exploit|crack|brute|bypass|escalat|dump|pwn)' OR
   lower(tool_name) ~ '(metasploit|msfconsole|hashcat|john|hydra|sqlmap)');

-- Dominate phase: persistence, C2, exfiltration
UPDATE kali_tasks SET hd4_phase = 'Dominate' WHERE
  hd4_phase = 'Hunt' AND
  (lower(task_name) ~ '(persist|backdoor|exfil|c2|pivot|tunnel|lateral)' OR
   lower(tool_name) ~ '(cobalt|empire|covenant|sliver|chisel)');

-- Step 5: For remaining 'Hunt' tasks, distribute evenly across phases
-- (This handles tasks that didn't match any keyword pattern)
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY id) as rn
  FROM kali_tasks
  WHERE hd4_phase = 'Hunt'
),
phase_assignment AS (
  SELECT id,
    CASE (rn % 5)
      WHEN 0 THEN 'Hunt'
      WHEN 1 THEN 'Detect'
      WHEN 2 THEN 'Disrupt'
      WHEN 3 THEN 'Disable'
      WHEN 4 THEN 'Dominate'
    END as new_phase
  FROM numbered
)
UPDATE kali_tasks k
SET hd4_phase = p.new_phase
FROM phase_assignment p
WHERE k.id = p.id;

-- Step 6: Verify final distribution
SELECT
  hd4_phase,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as percentage
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
