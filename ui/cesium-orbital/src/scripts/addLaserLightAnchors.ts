/**
 * Add 5 LaserLight Anchor Stations to Supabase
 *
 * Adds the official LaserLight Communications anchor points:
 * - Fortaleza, Brazil
 * - Guam
 * - Hawaii
 * - Johannesburg, South Africa
 * - Melbourne, Australia
 *
 * Run with: npx tsx src/scripts/addLaserLightAnchors.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, "../../.env") });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const laserLightAnchors = [
  {
    station_code: "LL-FORTALEZA-ANCHOR",
    name: "LaserLight Anchor - Fortaleza",
    city: "Fortaleza",
    country: "BR",
    latitude: -3.7172,
    longitude: -38.5433,
    tier: 1 as const,
    zone: "Americas",
    source: "LaserLight",
    demand_gbps: 100,
    weather_score: 0.85,
    status: "active" as const,
  },
  {
    station_code: "LL-GUAM-ANCHOR",
    name: "LaserLight Anchor - Guam",
    city: "Guam",
    country: "US",
    latitude: 13.4443,
    longitude: 144.7937,
    tier: 1 as const,
    zone: "APAC",
    source: "LaserLight",
    demand_gbps: 100,
    weather_score: 0.78,
    status: "active" as const,
  },
  {
    station_code: "LL-HAWAII-ANCHOR",
    name: "LaserLight Anchor - Hawaii",
    city: "Honolulu",
    country: "US",
    latitude: 21.3099,
    longitude: -157.8581,
    tier: 1 as const,
    zone: "Americas",
    source: "LaserLight",
    demand_gbps: 100,
    weather_score: 0.88,
    status: "active" as const,
  },
  {
    station_code: "LL-JOHANNESBURG-ANCHOR",
    name: "LaserLight Anchor - Johannesburg",
    city: "Johannesburg",
    country: "ZA",
    latitude: -26.2041,
    longitude: 28.0473,
    tier: 1 as const,
    zone: "EMEA",
    source: "LaserLight",
    demand_gbps: 100,
    weather_score: 0.9,
    status: "active" as const,
  },
  {
    station_code: "LL-MELBOURNE-ANCHOR",
    name: "LaserLight Anchor - Melbourne",
    city: "Melbourne",
    country: "AU",
    latitude: -37.8136,
    longitude: 144.9631,
    tier: 1 as const,
    zone: "APAC",
    source: "LaserLight",
    demand_gbps: 100,
    weather_score: 0.72,
    status: "active" as const,
  },
];

async function addAnchors() {
  console.log("🛰️  Adding 5 LaserLight Anchor Stations to Supabase...\\n");

  // Check if anchors already exist
  const { data: existing } = await supabase
    .from("ground_nodes")
    .select("station_code")
    .in(
      "station_code",
      laserLightAnchors.map((a) => a.station_code),
    );

  if (existing && existing.length > 0) {
    console.log(`⚠️  Found ${existing.length} existing anchor(s):`);
    existing.forEach((e) => console.log(`   - ${e.station_code}`));
    console.log("\\n   Skipping insert to avoid duplicates.");
    console.log("   Delete these first if you want to re-add them.\\n");
    return;
  }

  // Insert anchors
  const { data, error } = await supabase
    .from("ground_nodes")
    .insert(laserLightAnchors)
    .select();

  if (error) {
    console.error("❌ Error inserting anchors:", error.message);
    process.exit(1);
  }

  console.log(
    `✅ Successfully added ${data?.length || 0} LaserLight anchor stations:\\n`,
  );

  laserLightAnchors.forEach((anchor) => {
    console.log(`   📍 ${anchor.name}`);
    console.log(`      Location: ${anchor.city}, ${anchor.country}`);
    console.log(
      `      Coordinates: ${anchor.latitude.toFixed(4)}°, ${anchor.longitude.toFixed(4)}°`,
    );
    console.log(
      `      FSO Score: ${(anchor.weather_score * 100).toFixed(0)}/100`,
    );
    console.log("");
  });

  // Verify total count
  const { count } = await supabase
    .from("ground_nodes")
    .select("*", { count: "exact", head: true });

  console.log(`🔢 Total ground stations in database: ${count}`);
  console.log("\\n✨ LaserLight anchor stations are now live in Orbital!");
}

addAnchors().catch(console.error);
