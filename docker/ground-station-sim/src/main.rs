// Ground Station Simulation
// Simulates one ground station tracking the Walker 12/3/1 constellation

use anyhow::Result;
use chrono::Utc;
use orbital_mechanics::walker::WalkerDelta;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::time;
use tracing::{info, warn};

const EARTH_RADIUS_KM: f64 = 6378.137;
const DEG_TO_RAD: f64 = std::f64::consts::PI / 180.0;
const RAD_TO_DEG: f64 = 180.0 / std::f64::consts::PI;

/// Ground station configuration
#[derive(Debug, Clone)]
struct GroundStationConfig {
    id: String,
    name: String,
    latitude_deg: f64,
    longitude_deg: f64,
    altitude_m: f64,
    min_elevation_deg: f64,
}

/// Pointing angles from ground station to satellite
#[derive(Debug, Clone, Copy)]
struct PointingAngles {
    azimuth_deg: f64,
    elevation_deg: f64,
    range_km: f64,
}

/// Telemetry packet (integer-only for CTAS compatibility)
#[derive(Debug, Clone, Serialize, Deserialize)]
struct GroundStationTelemetry {
    // Station identity
    station_id: String,
    station_lat_mdeg: i32,      // millidegrees
    station_lon_mdeg: i32,      // millidegrees
    station_alt_m: u16,         // meters
    
    // Antenna/Mount (millidegrees, mdeg/s)
    antenna_azimuth_mdeg: u32,          // 0-360000
    antenna_elevation_mdeg: u32,        // 0-90000
    antenna_azimuth_rate_mdeg_s: i32,   // mdeg/s
    antenna_elevation_rate_mdeg_s: i32, // mdeg/s
    tracking_mode: u8,                  // 0=IDLE, 1=SLEWING, 2=TRACKING, 3=STOWED
    
    // Optical Link
    link_ber_e9: u32,           // Bit error rate × 10^9
    link_signal_dbm10: i16,     // Signal strength in decidBm (dBm × 10)
    link_lock_status: u8,       // 0=unlocked, 1=locked
    link_data_rate_mbps: u16,   // Mbps
    link_packet_count: u32,     // Total packets received
    
    // Fine Tracking (centipixels, centiarcseconds)
    tracking_centroid_x_cpx: u32,  // centipixels
    tracking_centroid_y_cpx: u32,  // centipixels
    tracking_fwhm_cas: u16,        // centiarcseconds
    tracking_guide_error_cas: u16, // centiarcseconds
    
    // System Health
    system_temperature_dc: i16,  // decicelsius (°C × 10)
    system_uptime_s: u32,        // seconds
    system_status: u8,           // 0=NOMINAL, 1=DEGRADED, 2=FAULT
    
    // Tracking target
    tracking_satellite_id: Option<String>,
    tracking_satellite_norad: Option<u32>,
    
    // Timestamp
    timestamp_unix: i64,
}

impl GroundStationTelemetry {
    fn idle(config: &GroundStationConfig) -> Self {
        Self {
            station_id: config.id.clone(),
            station_lat_mdeg: (config.latitude_deg * 1000.0) as i32,
            station_lon_mdeg: (config.longitude_deg * 1000.0) as i32,
            station_alt_m: config.altitude_m as u16,
            antenna_azimuth_mdeg: 0,
            antenna_elevation_mdeg: 90000, // Parked pointing up
            antenna_azimuth_rate_mdeg_s: 0,
            antenna_elevation_rate_mdeg_s: 0,
            tracking_mode: 0, // IDLE
            link_ber_e9: 0,
            link_signal_dbm10: -999,
            link_lock_status: 0,
            link_data_rate_mbps: 0,
            link_packet_count: 0,
            tracking_centroid_x_cpx: 0,
            tracking_centroid_y_cpx: 0,
            tracking_fwhm_cas: 0,
            tracking_guide_error_cas: 0,
            system_temperature_dc: 250, // 25.0°C
            system_uptime_s: 0,
            system_status: 0, // NOMINAL
            tracking_satellite_id: None,
            tracking_satellite_norad: None,
            timestamp_unix: Utc::now().timestamp(),
        }
    }
}

/// Calculate look angles (azimuth/elevation) from ground station to satellite
fn calculate_look_angles(
    gs_lat_deg: f64,
    gs_lon_deg: f64,
    gs_alt_km: f64,
    sat_lat_deg: f64,
    sat_lon_deg: f64,
    sat_alt_km: f64,
) -> PointingAngles {
    let gs_lat = gs_lat_deg * DEG_TO_RAD;
    let gs_lon = gs_lon_deg * DEG_TO_RAD;
    let sat_lat = sat_lat_deg * DEG_TO_RAD;
    let sat_lon = sat_lon_deg * DEG_TO_RAD;

    // Ground station ECEF
    let gs_r = EARTH_RADIUS_KM + gs_alt_km;
    let gs_x = gs_r * gs_lat.cos() * gs_lon.cos();
    let gs_y = gs_r * gs_lat.cos() * gs_lon.sin();
    let gs_z = gs_r * gs_lat.sin();

    // Satellite ECEF
    let sat_r = EARTH_RADIUS_KM + sat_alt_km;
    let sat_x = sat_r * sat_lat.cos() * sat_lon.cos();
    let sat_y = sat_r * sat_lat.cos() * sat_lon.sin();
    let sat_z = sat_r * sat_lat.sin();

    // Range vector
    let dx = sat_x - gs_x;
    let dy = sat_y - gs_y;
    let dz = sat_z - gs_z;
    let range_km = (dx * dx + dy * dy + dz * dz).sqrt();

    // Convert to topocentric (ENU) coordinates
    let sin_lat = gs_lat.sin();
    let cos_lat = gs_lat.cos();
    let sin_lon = gs_lon.sin();
    let cos_lon = gs_lon.cos();

    // East-North-Up rotation
    let east = -sin_lon * dx + cos_lon * dy;
    let north = -sin_lat * cos_lon * dx - sin_lat * sin_lon * dy + cos_lat * dz;
    let up = cos_lat * cos_lon * dx + cos_lat * sin_lon * dy + sin_lat * dz;

    // Azimuth (from North, clockwise)
    let azimuth_deg = east.atan2(north) * RAD_TO_DEG;
    let azimuth_deg = if azimuth_deg < 0.0 { azimuth_deg + 360.0 } else { azimuth_deg };

    // Elevation (from horizon)
    let horiz_range = (east * east + north * north).sqrt();
    let elevation_deg = up.atan2(horiz_range) * RAD_TO_DEG;

    PointingAngles {
        azimuth_deg,
        elevation_deg,
        range_km,
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "ground_station_sim=info".to_string()),
        )
        .init();

    // Load configuration from environment
    let config = GroundStationConfig {
        id: std::env::var("GS_ID").unwrap_or_else(|_| "GS-000".to_string()),
        name: std::env::var("GS_NAME").unwrap_or_else(|_| "Default".to_string()),
        latitude_deg: std::env::var("GS_LAT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.0),
        longitude_deg: std::env::var("GS_LON")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.0),
        altitude_m: std::env::var("GS_ALT_M")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.0),
        min_elevation_deg: 5.0,
    };

    info!(
        "Ground Station {} ({}) starting at {:.4}°, {:.4}°",
        config.id, config.name, config.latitude_deg, config.longitude_deg
    );

    // Connect to NATS
    let nats_url = std::env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    let client = async_nats::connect(&nats_url).await?;
    info!("Connected to NATS at {}", nats_url);

    // Generate Walker 12/3/1 constellation
    let walker = WalkerDelta::halo_constellation();
    let satellites = walker.generate_satellites();
    info!("Generated {} satellites in Walker 12/3/1 constellation", satellites.len());

    // Simulation loop
    let mut telemetry = GroundStationTelemetry::idle(&config);
    let mut uptime = 0u32;
    let mut interval = time::interval(Duration::from_secs(1));

    loop {
        interval.tick().await;
        uptime += 1;
        telemetry.system_uptime_s = uptime;
        telemetry.timestamp_unix = Utc::now().timestamp();

        // Propagate all satellites and find best visible one
        let now = Utc::now();
        let mut best_satellite = None;
        let mut best_elevation = config.min_elevation_deg;

        for sat in &satellites {
            if let Ok(ground_track) = sat.ground_track(now) {
                let angles = calculate_look_angles(
                    config.latitude_deg,
                    config.longitude_deg,
                    config.altitude_m / 1000.0,
                    ground_track.latitude,
                    ground_track.longitude,
                    ground_track.altitude_km,
                );

                if angles.elevation_deg >= config.min_elevation_deg
                    && angles.elevation_deg > best_elevation
                {
                    best_elevation = angles.elevation_deg;
                    best_satellite = Some((sat, angles));
                }
            }
        }

        // Update telemetry based on tracking state
        if let Some((sat, angles)) = best_satellite {
            // TRACKING mode
            telemetry.tracking_mode = 2;
            telemetry.antenna_azimuth_mdeg = (angles.azimuth_deg * 1000.0) as u32;
            telemetry.antenna_elevation_mdeg = (angles.elevation_deg * 1000.0) as u32;
            telemetry.link_lock_status = 1;
            telemetry.link_signal_dbm10 = -450; // -45.0 dBm
            telemetry.link_data_rate_mbps = 1000; // 1 Gbps
            telemetry.link_packet_count += 1000; // 1000 packets/sec
            telemetry.tracking_satellite_id = Some(sat.id.clone());
            telemetry.tracking_satellite_norad = Some(sat.norad_id);
            
            if uptime % 10 == 0 {
                info!(
                    "{} tracking {} at Az={:.1}° El={:.1}° Range={:.0}km",
                    config.id, sat.name, angles.azimuth_deg, angles.elevation_deg, angles.range_km
                );
            }
        } else {
            // IDLE mode
            telemetry.tracking_mode = 0;
            telemetry.antenna_azimuth_mdeg = 0;
            telemetry.antenna_elevation_mdeg = 90000; // Parked
            telemetry.link_lock_status = 0;
            telemetry.link_signal_dbm10 = -999;
            telemetry.link_data_rate_mbps = 0;
            telemetry.tracking_satellite_id = None;
            telemetry.tracking_satellite_norad = None;
            
            if uptime % 60 == 0 {
                info!("{} idle - no satellites visible", config.id);
            }
        }

        // Publish telemetry to NATS
        let topic = format!("orbital.gs.{}.telemetry", config.id);
        let payload = serde_json::to_vec(&telemetry)?;
        
        if let Err(e) = client.publish(topic, payload.into()).await {
            warn!("Failed to publish telemetry: {}", e);
        }
    }
}
