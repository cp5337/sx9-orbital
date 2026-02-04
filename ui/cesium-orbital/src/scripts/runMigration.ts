/**
 * Run SQL migration to add new columns to ground_nodes
 *
 * Run with: npx tsx src/scripts/runMigration.ts
 *
 * Requires service role key in vault or SUPABASE_SERVICE_ROLE_KEY env var
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

// Try to load service role key from vault
function getServiceRoleKey(): string | undefined {
  // First try env var
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  // Try vault - Supabase is under database_connections.supabase
  const vaultPath = resolve(homedir(), 'Desktop/ABE-DropZone/secrets/SX9_UNIFIED_VAULT.json');
  try {
    const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf-8'));
    return vault.database_connections?.supabase?.service_role_key;
  } catch {
    return undefined;
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kxabqezjpglbbrjdpdmv.supabase.co';
const supabaseServiceKey = getServiceRoleKey();

if (!supabaseServiceKey) {
  console.error('❌ Missing Supabase service role key');
  console.error('   Set SUPABASE_SERVICE_ROLE_KEY or add to vault');
  process.exit(1);
}

console.log('🔑 Using service role key from vault');
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('🔄 Running migration to add ground_nodes columns...\n');

  // First, let's check if the columns already exist by doing a query
  const { error: checkError } = await supabase
    .from('ground_nodes')
    .select('station_code')
    .limit(1);

  if (!checkError) {
    console.log('✅ Columns already exist! No migration needed.');
    return;
  }

  console.log('Columns do not exist yet. Adding them via SQL...\n');

  // Use the Supabase REST API to execute SQL via the query endpoint
  // The service role key allows us to use the pg_query function
  const migrationSql = `
    ALTER TABLE ground_nodes
      ADD COLUMN IF NOT EXISTS station_code text,
      ADD COLUMN IF NOT EXISTS city text,
      ADD COLUMN IF NOT EXISTS country text,
      ADD COLUMN IF NOT EXISTS zone text,
      ADD COLUMN IF NOT EXISTS source text;
  `;

  // Execute via rpc - need to create a function first or use direct SQL endpoint
  // Using the direct postgres connection would be ideal but let's try REST
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': supabaseServiceKey!,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql: migrationSql }),
  });

  if (!response.ok) {
    // RPC function doesn't exist - show manual instructions
    console.log('⚠️  Cannot execute SQL directly (RPC function not available)');
    console.log('\n📋 Run this SQL in Supabase Dashboard > SQL Editor:\n');
    console.log('---');
    console.log(`
ALTER TABLE ground_nodes
  ADD COLUMN IF NOT EXISTS station_code text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS zone text,
  ADD COLUMN IF NOT EXISTS source text;

CREATE INDEX IF NOT EXISTS idx_ground_nodes_station_code ON ground_nodes(station_code);
CREATE INDEX IF NOT EXISTS idx_ground_nodes_zone ON ground_nodes(zone);
CREATE INDEX IF NOT EXISTS idx_ground_nodes_source ON ground_nodes(source);
`);
    console.log('---');
    return;
  }

  console.log('✅ Migration successful! Columns added.');

  // Verify
  const { error: verifyError } = await supabase
    .from('ground_nodes')
    .select('station_code, city, country, zone, source')
    .limit(1);

  if (verifyError) {
    console.log('⚠️  Verification failed:', verifyError.message);
  } else {
    console.log('✅ Verified: New columns are accessible');
  }
}

runMigration().catch(console.error);
