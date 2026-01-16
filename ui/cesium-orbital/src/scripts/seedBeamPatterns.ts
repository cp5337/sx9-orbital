// Seed script for beam pattern declination presets
// Script: seedBeamPatterns.ts | Lines: ~150 | Tier: Simple (<200)

import 'dotenv/config';
import { supabase } from '../lib/supabase';

interface PresetData {
  name: string;
  description: string;
  angles_deg: number[];
  use_case: string;
}

const DECLINATION_PRESETS: PresetData[] = [
  {
    name: 'Basic',
    description: 'Minimum viable set for basic operations',
    angles_deg: [10.0, 20.0, 45.0, 70.0, 90.0],
    use_case: 'Basic operations with minimal complexity. Suitable for low-traffic ground stations.',
  },
  {
    name: 'Operational',
    description: 'Standard operational configuration',
    angles_deg: [5.0, 10.0, 15.0, 30.0, 45.0, 60.0, 75.0, 90.0],
    use_case: 'Full operational capability with good elevation coverage. Recommended for most stations.',
  },
  {
    name: 'Precision',
    description: 'High-resolution tracking and analysis',
    angles_deg: [
      5.0, 7.5, 10.0, 12.5, 15.0, 20.0, 25.0, 30.0,
      40.0, 50.0, 60.0, 70.0, 80.0, 85.0, 90.0
    ],
    use_case: 'Research-grade tracking or high-precision link optimization. Maximum atmospheric modeling fidelity.',
  },
  {
    name: 'Low Elevation Focus',
    description: 'Optimized for low-elevation passes',
    angles_deg: [5.0, 7.5, 10.0, 12.5, 15.0, 20.0, 25.0, 30.0],
    use_case: 'Stations near the horizon with frequent low-elevation passes. Enhanced atmospheric compensation.',
  },
  {
    name: 'High Elevation Focus',
    description: 'Optimized for near-zenith passes',
    angles_deg: [45.0, 60.0, 70.0, 75.0, 80.0, 85.0, 90.0],
    use_case: 'Stations with predominantly high-elevation satellite visibility. Minimal atmospheric impact.',
  },
];

async function seedDeclinationPresets() {
  console.log('🌱 Seeding declination angle presets...');

  for (const preset of DECLINATION_PRESETS) {
    const { error } = await supabase
      .from('declination_angle_presets')
      .upsert(
        {
          name: preset.name,
          description: preset.description,
          angles_deg: preset.angles_deg,
          use_case: preset.use_case,
        },
        { onConflict: 'name' }
      )
      .select()
      .single();

    if (error) {
      console.error(`❌ Failed to seed preset "${preset.name}":`, error.message);
    } else {
      console.log(`✅ Seeded preset: ${preset.name} (${preset.angles_deg.length} angles)`);
    }
  }
}

async function initializeDefaultConfigs() {
  console.log('\n📊 Initializing default configurations for ground stations...');

  const { data: stations, error: stationsError } = await supabase
    .from('ground_nodes')
    .select('id, name, tier')
    .limit(10);

  if (stationsError) {
    console.error('❌ Failed to fetch ground stations:', stationsError.message);
    return;
  }

  if (!stations || stations.length === 0) {
    console.log('⚠️  No ground stations found. Skipping default config initialization.');
    return;
  }

  for (const station of stations) {
    const preset = station.tier === 1 ? 'Precision' : 'Operational';
    const presetData = DECLINATION_PRESETS.find(p => p.name === preset);

    if (!presetData) continue;

    const { error } = await supabase
      .from('ground_station_declination_config')
      .upsert(
        {
          ground_node_id: station.id,
          preset_type: preset.toLowerCase(),
          angles_deg: presetData.angles_deg,
          is_custom: false,
        },
        { onConflict: 'ground_node_id' }
      );

    if (error) {
      console.error(`❌ Failed to initialize config for ${station.name}:`, error.message);
    } else {
      console.log(`✅ Initialized ${preset} config for: ${station.name}`);
    }
  }
}

async function main() {
  console.log('🚀 Starting beam pattern data seeding...\n');

  try {
    await seedDeclinationPresets();
    await initializeDefaultConfigs();

    console.log('\n✨ Seeding completed successfully!');
  } catch (error) {
    console.error('\n💥 Seeding failed:', error);
    process.exit(1);
  }
}

main();
