import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const seedMEONetwork = async () => {
  console.log('🛰️  Seeding MEO Satellite Network Data...\n');

  const groundNodes = [
    { name: 'GN-NA-001', latitude: 37.7749, longitude: -122.4194, tier: 1, demand_gbps: 12.5, weather_score: 0.89 },
    { name: 'GN-NA-002', latitude: 40.7128, longitude: -74.0060, tier: 1, demand_gbps: 15.2, weather_score: 0.82 },
    { name: 'GN-NA-003', latitude: 32.7767, longitude: -96.7970, tier: 2, demand_gbps: 8.3, weather_score: 0.91 },
    { name: 'GN-EU-001', latitude: 51.5074, longitude: -0.1278, tier: 1, demand_gbps: 14.8, weather_score: 0.72 },
    { name: 'GN-EU-002', latitude: 48.8566, longitude: 2.3522, tier: 1, demand_gbps: 13.1, weather_score: 0.78 },
    { name: 'GN-EU-003', latitude: 52.5200, longitude: 13.4050, tier: 2, demand_gbps: 9.7, weather_score: 0.75 },
    { name: 'GN-AS-001', latitude: 35.6762, longitude: 139.6503, tier: 1, demand_gbps: 18.3, weather_score: 0.94 },
    { name: 'GN-AS-002', latitude: 1.3521, longitude: 103.8198, tier: 1, demand_gbps: 16.4, weather_score: 0.88 },
    { name: 'GN-AS-003', latitude: 31.2304, longitude: 121.4737, tier: 2, demand_gbps: 11.2, weather_score: 0.83 },
    { name: 'GN-OC-001', latitude: -33.8688, longitude: 151.2093, tier: 2, demand_gbps: 7.8, weather_score: 0.90 },
    { name: 'GN-SA-001', latitude: -23.5505, longitude: -46.6333, tier: 2, demand_gbps: 6.9, weather_score: 0.85 },
    { name: 'GN-AF-001', latitude: -26.2041, longitude: 28.0473, tier: 3, demand_gbps: 4.5, weather_score: 0.92 },
  ];

  console.log('📡 Creating ground nodes...');
  const { data: insertedNodes, error: nodesError } = await supabase
    .from('ground_nodes')
    .insert(groundNodes)
    .select();

  if (nodesError) {
    console.error('Error inserting ground nodes:', nodesError);
    return;
  }
  console.log(`✅ Created ${insertedNodes?.length} ground nodes\n`);

  const meoSatellites = [
    { name: 'MEO-A1', latitude: 23.5, longitude: -45.2, altitude: 15000, inclination: 55.0, qber: 2.8, note: 'Outer Van Allen belt' },
    { name: 'MEO-A2', latitude: -18.3, longitude: 88.7, altitude: 16500, inclination: 55.0, qber: 3.2, note: 'Outer belt, high radiation' },
    { name: 'MEO-A3', latitude: 42.1, longitude: 165.4, altitude: 15800, inclination: 55.0, qber: 2.5, note: 'Moderate radiation' },
    { name: 'MEO-B1', latitude: -35.7, longitude: -120.3, altitude: 12000, inclination: 63.4, qber: 4.1, note: 'Inner belt transition' },
    { name: 'MEO-B2', latitude: 8.2, longitude: 15.6, altitude: 11500, inclination: 63.4, qber: 4.8, note: 'High radiation zone' },
    { name: 'MEO-B3', latitude: 51.4, longitude: -178.2, altitude: 12500, inclination: 63.4, qber: 3.9, note: 'Inner belt edge' },
    { name: 'MEO-C1', latitude: -12.8, longitude: 45.3, altitude: 18000, inclination: 47.0, qber: 2.1, note: 'High altitude, low radiation' },
    { name: 'MEO-C2', latitude: 28.9, longitude: -95.4, altitude: 17500, inclination: 47.0, qber: 2.4, note: 'Stable orbit' },
    { name: 'MEO-D1', latitude: -28.5, longitude: 125.7, altitude: 14000, inclination: 70.0, qber: 3.5, note: 'Polar-inclined MEO' },
    { name: 'MEO-D2', latitude: 65.3, longitude: -32.1, altitude: 14500, inclination: 70.0, qber: 3.3, note: 'High latitude coverage' },
  ];

  console.log('🛰️  Deploying MEO satellites...');
  const { data: insertedSatellites, error: satellitesError } = await supabase
    .from('satellites')
    .insert(meoSatellites.map(sat => ({
      name: sat.name,
      latitude: sat.latitude,
      longitude: sat.longitude,
      altitude: sat.altitude,
      jammed: false,
      qber: sat.qber,
      status: 'active' as const,
    })))
    .select();

  if (satellitesError) {
    console.error('Error inserting satellites:', satellitesError);
    return;
  }
  console.log(`✅ Deployed ${insertedSatellites?.length} MEO satellites\n`);

  console.log('🌌 Adding orbital elements for MEO satellites...');
  const orbitalElements = insertedSatellites?.map((sat, idx) => {
    const satData = meoSatellites[idx];
    const semiMajorAxis = 6371 + satData.altitude;
    const meanMotion = Math.sqrt(398600.4418 / Math.pow(semiMajorAxis, 3)) * 86400 / (2 * Math.PI);
    const orbitalPeriod = 1440 / meanMotion;

    return {
      satellite_id: sat.id,
      epoch: new Date().toISOString(),
      mean_motion: meanMotion,
      eccentricity: 0.001 + Math.random() * 0.002,
      inclination_deg: satData.inclination,
      raan_deg: Math.random() * 360,
      arg_perigee_deg: Math.random() * 360,
      mean_anomaly_deg: Math.random() * 360,
      bstar_drag: 0.00001,
      semimajor_axis_km: semiMajorAxis,
      orbital_period_min: orbitalPeriod,
    };
  });

  if (orbitalElements && orbitalElements.length > 0) {
    const { error: orbitalError } = await supabase
      .from('orbital_elements')
      .insert(orbitalElements);

    if (orbitalError) {
      console.error('Error inserting orbital elements:', orbitalError);
    } else {
      console.log(`✅ Added orbital parameters for ${orbitalElements.length} satellites\n`);
    }
  }

  console.log('☢️  Initializing radiation parameters...');
  const radiationParams = insertedSatellites?.map(sat => {
    const altitude = meoSatellites.find(s => s.name === sat.name)?.altitude || 15000;
    const lShell = (6371 + altitude) / 6371;
    const inInnerBelt = altitude >= 1000 && altitude <= 6000;
    const inOuterBelt = altitude >= 13000 && altitude <= 25000;
    const inRadiationBelt = inInnerBelt || inOuterBelt;

    const baseFlux = inOuterBelt ? 1e8 : inInnerBelt ? 5e7 : 1e6;
    const radiationFlux = baseFlux * (0.8 + Math.random() * 0.4);

    return {
      satellite_id: sat.id,
      timestamp: new Date().toISOString(),
      l_shell: lShell,
      b_field_magnitude_nt: 35000 / Math.pow(lShell, 3),
      b_field_x_nt: 20000 / Math.pow(lShell, 3),
      b_field_y_nt: 15000 / Math.pow(lShell, 3),
      b_field_z_nt: 25000 / Math.pow(lShell, 3),
      radiation_flux: radiationFlux,
      proton_flux_gt10mev: radiationFlux * 0.3,
      electron_flux_gt1mev: radiationFlux * 0.7,
      in_radiation_belt: inRadiationBelt,
      in_saa: sat.latitude < 0 && sat.latitude > -40 && sat.longitude > -90 && sat.longitude < 40,
      seu_probability: inRadiationBelt ? 0.001 + Math.random() * 0.004 : 0.0001,
      total_dose_rad: Math.random() * 50,
      geomagnetic_latitude_deg: sat.latitude * 0.9,
      geomagnetic_longitude_deg: sat.longitude,
    };
  });

  if (radiationParams && radiationParams.length > 0) {
    const { error: radiationError } = await supabase
      .from('radiation_parameters')
      .insert(radiationParams);

    if (radiationError) {
      console.error('Error inserting radiation parameters:', radiationError);
    } else {
      console.log(`✅ Initialized radiation parameters for ${radiationParams.length} satellites\n`);
    }
  }

  console.log('📶 Establishing beam connections...');
  const beams: any[] = [];

  insertedSatellites?.forEach((sat, idx) => {
    const nearbyNodes = insertedNodes
      ?.map(node => {
        const distance = Math.sqrt(
          Math.pow(sat.latitude - node.latitude, 2) +
          Math.pow(sat.longitude - node.longitude, 2)
        );
        return { node, distance };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2);

    nearbyNodes?.forEach(({ node, distance }) => {
      const radParams = radiationParams?.[idx];
      const linkQuality = 0.7 + (Math.random() * 0.25) - (radParams?.in_radiation_belt ? 0.1 : 0);

      beams.push({
        beam_type: 'space_to_ground',
        source_node_id: sat.id,
        source_node_type: 'satellite',
        target_node_id: node.id,
        target_node_type: 'ground_node',
        beam_status: 'active',
        link_quality_score: Math.max(0.5, linkQuality),
        assignment_timestamp: new Date().toISOString(),
        throughput_gbps: 5 + Math.random() * 10,
        latency_ms: 80 + Math.random() * 40,
        jitter_ms: 2 + Math.random() * 3,
        packet_loss_percent: Math.random() * 0.5,
        qber: sat.qber,
        optical_power_dbm: -15 - Math.random() * 10,
        pointing_error_urad: 5 + Math.random() * 10,
        atmospheric_attenuation_db: 2 + Math.random() * 3,
        distance_km: distance * 111 + meoSatellites[idx].altitude,
        azimuth_deg: Math.random() * 360,
        elevation_deg: 20 + Math.random() * 50,
        beam_divergence_urad: 100 + Math.random() * 50,
        spot_size_m: 50 + Math.random() * 100,
        weather_score: node.weather_score,
        cloud_opacity_percent: (1 - node.weather_score) * 100,
        rain_attenuation_db: (1 - node.weather_score) * 5,
        scintillation_index: Math.random() * 0.3,
        radiation_flux_at_source: radParams?.radiation_flux || 0,
        in_radiation_belt: radParams?.in_radiation_belt || false,
        saa_affected: radParams?.in_saa || false,
        entropy_harvest_rate_kbps: radParams?.in_radiation_belt ? 50 + Math.random() * 100 : 0,
        beam_edge_entropy_active: false,
        qkd_key_generation_rate_kbps: 10 + Math.random() * 40,
        key_buffer_bits: Math.floor(Math.random() * 1000000),
      });
    });
  });

  if (beams.length > 0) {
    const { error: beamsError } = await supabase
      .from('beams')
      .insert(beams);

    if (beamsError) {
      console.error('Error inserting beams:', beamsError);
    } else {
      console.log(`✅ Established ${beams.length} active beam connections\n`);
    }
  }

  console.log('📊 Adding telemetry data...');
  const telemetryRecords: any[] = [];

  insertedNodes?.forEach(node => {
    telemetryRecords.push(
      {
        node_id: node.id,
        node_type: 'ground_node',
        metric_type: 'demand_gbps',
        value: node.demand_gbps,
        metadata: { location: node.name },
      },
      {
        node_id: node.id,
        node_type: 'ground_node',
        metric_type: 'weather_score',
        value: node.weather_score,
        metadata: { location: node.name },
      }
    );
  });

  insertedSatellites?.forEach(sat => {
    telemetryRecords.push(
      {
        node_id: sat.id,
        node_type: 'satellite',
        metric_type: 'qber',
        value: sat.qber,
        metadata: { satellite: sat.name },
      },
      {
        node_id: sat.id,
        node_type: 'satellite',
        metric_type: 'altitude',
        value: sat.altitude,
        metadata: { satellite: sat.name },
      }
    );
  });

  if (telemetryRecords.length > 0) {
    const { error: telemetryError } = await supabase
      .from('telemetry_archive')
      .insert(telemetryRecords);

    if (telemetryError) {
      console.error('Error inserting telemetry:', telemetryError);
    } else {
      console.log(`✅ Added ${telemetryRecords.length} telemetry records\n`);
    }
  }

  console.log('🌤️  Generating weather data...');
  const weatherRecords = insertedNodes?.map(node => ({
    location_id: node.id,
    timestamp: new Date().toISOString(),
    conditions: node.weather_score > 0.85 ? 'clear' : node.weather_score > 0.7 ? 'partly_cloudy' : 'cloudy',
    cloud_cover: (1 - node.weather_score) * 100,
    visibility: 10 + node.weather_score * 40,
    wind_speed: 5 + Math.random() * 30,
    precipitation: node.weather_score < 0.7 ? Math.random() * 2 : 0,
    temperature: 15 + Math.random() * 15,
    raw_data: { source: 'seed_data' },
  }));

  if (weatherRecords && weatherRecords.length > 0) {
    const { error: weatherError } = await supabase
      .from('weather_data')
      .insert(weatherRecords);

    if (weatherError) {
      console.error('Error inserting weather data:', weatherError);
    } else {
      console.log(`✅ Generated weather data for ${weatherRecords.length} ground nodes\n`);
    }
  }

  console.log('🔐 Initializing QKD metrics...');
  const qkdRecords = insertedSatellites?.map(sat => ({
    satellite_id: sat.id,
    timestamp: new Date().toISOString(),
    qber: sat.qber,
    key_rate_kbps: 10 + Math.random() * 30,
    sifted_bits: Math.floor(100000 + Math.random() * 500000),
    pa_ratio: 0.5 + Math.random() * 0.3,
    link_quality: 0.7 + Math.random() * 0.25,
  }));

  if (qkdRecords && qkdRecords.length > 0) {
    const { error: qkdError } = await supabase
      .from('qkd_metrics')
      .insert(qkdRecords);

    if (qkdError) {
      console.error('Error inserting QKD metrics:', qkdError);
    } else {
      console.log(`✅ Initialized QKD metrics for ${qkdRecords.length} satellites\n`);
    }
  }

  console.log('✨ MEO Network seeding complete!\n');
  console.log('📈 Summary:');
  console.log(`   - ${insertedNodes?.length || 0} Ground Nodes`);
  console.log(`   - ${insertedSatellites?.length || 0} MEO Satellites (Van Allen belt)`);
  console.log(`   - ${beams.length} Active Beam Connections`);
  console.log(`   - ${telemetryRecords.length} Telemetry Records`);
  console.log(`   - Full radiation and orbital parameters initialized\n`);
};

seedMEONetwork().catch(console.error);
