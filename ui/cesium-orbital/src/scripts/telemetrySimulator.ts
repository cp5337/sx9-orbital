/**
 * Telemetry Simulator - Generates live orbital data
 *
 * Simulates:
 * - Satellite position updates (orbital motion)
 * - Beam activations/deactivations
 * - Weather score fluctuations
 * - QBER (Quantum Bit Error Rate) variations
 *
 * Run with: npx tsx src/scripts/telemetrySimulator.ts
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

// Load service key from vault for full write access
function getServiceRoleKey(): string | undefined {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
  const vaultPath = resolve(homedir(), 'Desktop/ABE-DropZone/secrets/SX9_UNIFIED_VAULT.json');
  try {
    const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf-8'));
    return vault.database_connections?.supabase?.service_role_key;
  } catch {
    return undefined;
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kxabqezjpglbbrjdpdmv.supabase.co';
const supabaseKey = getServiceRoleKey() || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('❌ Missing Supabase key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Orbital parameters for simulation
const ORBITAL_PERIOD_MS = 4 * 60 * 60 * 1000; // 4 hours for MEO
const UPDATE_INTERVAL_MS = 2000; // Update every 2 seconds

interface SatelliteState {
  id: string;
  name: string;
  baseLatitude: number;
  baseLongitude: number;
  altitude: number;
  inclination: number;
  phaseOffset: number; // 0-1 for orbital phase
  jammed: boolean;
  qber: number;
}

// Initialize satellite states
let satellites: SatelliteState[] = [];

async function initializeSatellites() {
  console.log('🛰️  Loading satellites from Supabase...');

  const { data, error } = await supabase
    .from('satellites')
    .select('*');

  if (error || !data || data.length === 0) {
    console.log('   No satellites found, using mock data');
    // Create 12 MEO satellites if none exist
    satellites = Array.from({ length: 12 }, (_, i) => ({
      id: `sat-${i + 1}`,
      name: `HALO-${String(i + 1).padStart(2, '0')}`,
      baseLatitude: 0,
      baseLongitude: (i * 30) % 360 - 180, // Distributed around globe
      altitude: 7500 + (i % 3) * 100,
      inclination: 45 + (i % 4) * 5,
      phaseOffset: i / 12,
      jammed: false,
      qber: 2.5 + Math.random() * 2,
    }));
  } else {
    satellites = data.map((sat, i) => ({
      id: sat.id,
      name: sat.name,
      baseLatitude: sat.latitude,
      baseLongitude: sat.longitude,
      altitude: sat.altitude,
      inclination: sat.inclination || 45,
      phaseOffset: i / data.length,
      jammed: sat.jammed,
      qber: sat.qber,
    }));
  }

  console.log(`   Tracking ${satellites.length} satellites`);
}

// Calculate satellite position based on time
function calculatePosition(sat: SatelliteState, timeMs: number): { lat: number; lon: number } {
  const orbitPhase = ((timeMs / ORBITAL_PERIOD_MS) + sat.phaseOffset) % 1;
  const angle = orbitPhase * 2 * Math.PI;

  // Simplified ground track calculation
  // Real orbital mechanics would use SGP4/SDP4
  const lat = sat.inclination * Math.sin(angle);
  const lon = ((sat.baseLongitude + (orbitPhase * 360)) % 360) - 180;

  return { lat, lon };
}

// Simulate QBER fluctuation (quantum channel quality)
function simulateQber(currentQber: number): number {
  const drift = (Math.random() - 0.5) * 0.5;
  const newQber = currentQber + drift;
  return Math.max(0.5, Math.min(10, newQber));
}

// Simulate weather score fluctuation
function simulateWeather(currentScore: number): number {
  const drift = (Math.random() - 0.5) * 0.05;
  const newScore = currentScore + drift;
  return Math.max(0.3, Math.min(1.0, newScore));
}

// Main simulation loop
async function runSimulation() {
  const startTime = Date.now();
  let tickCount = 0;

  console.log('\n📡 Starting telemetry simulation...');
  console.log('   Press Ctrl+C to stop\n');

  const tick = async () => {
    const now = Date.now();
    tickCount++;

    // Update satellite positions
    const updates = satellites.map(sat => {
      const pos = calculatePosition(sat, now);
      sat.qber = simulateQber(sat.qber);

      // Random jamming events (rare)
      if (Math.random() < 0.001) {
        sat.jammed = !sat.jammed;
        console.log(`   ⚡ ${sat.name} ${sat.jammed ? 'JAMMED' : 'CLEARED'}`);
      }

      return {
        id: sat.id,
        latitude: pos.lat,
        longitude: pos.lon,
        qber: sat.qber,
        jammed: sat.jammed,
        last_updated: new Date().toISOString(),
      };
    });

    // Batch update satellites
    for (const update of updates) {
      const { error } = await supabase
        .from('satellites')
        .update({
          latitude: update.latitude,
          longitude: update.longitude,
          qber: update.qber,
          jammed: update.jammed,
          last_updated: update.last_updated,
        })
        .eq('id', update.id);

      if (error && !error.message.includes('row count')) {
        // Satellite might not exist, try insert
        await supabase.from('satellites').insert({
          id: update.id,
          name: satellites.find(s => s.id === update.id)?.name || `SAT-${update.id}`,
          latitude: update.latitude,
          longitude: update.longitude,
          altitude: satellites.find(s => s.id === update.id)?.altitude || 7500,
          inclination: satellites.find(s => s.id === update.id)?.inclination || 45,
          qber: update.qber,
          jammed: update.jammed,
        });
      }
    }

    // Update random ground station weather scores (10% each tick)
    const { data: groundNodes } = await supabase
      .from('ground_nodes')
      .select('id, weather_score')
      .limit(25);

    if (groundNodes) {
      for (const node of groundNodes) {
        if (Math.random() < 0.1) {
          const newScore = simulateWeather(node.weather_score);
          await supabase
            .from('ground_nodes')
            .update({
              weather_score: newScore,
              last_updated: new Date().toISOString(),
            })
            .eq('id', node.id);
        }
      }
    }

    // Status output
    if (tickCount % 5 === 0) {
      const runtime = Math.floor((now - startTime) / 1000);
      process.stdout.write(`\r  Tick ${tickCount} | Runtime: ${runtime}s | Satellites: ${satellites.length}`);
    }
  };

  // Run tick loop
  setInterval(tick, UPDATE_INTERVAL_MS);
}

// Entry point
async function main() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║     SX9 ORBITAL TELEMETRY SIMULATOR          ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  await initializeSatellites();
  await runSimulation();
}

main().catch(console.error);
