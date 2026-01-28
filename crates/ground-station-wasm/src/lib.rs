//! Ground Station Digital Twin WASM
//!
//! Each instance represents one FSO ground terminal with:
//! - GIS position (lat/lon/alt)
//! - Slew control for optical tracking
//! - Door/aperture state machine
//! - Contact window calculations
//! - Real-time satellite tracking
//!
//! Deployed as individual containers in OrbStack, each assigned
//! to a specific geographic location from the 257-station network.

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

pub mod slew;
pub mod door;
pub mod contact;
pub mod tracking;
pub mod link_budget;
pub mod stations;
pub mod downselect;
pub mod weather;

#[cfg(feature = "weather-api")]
pub mod weather_api;

// Re-exports
pub use slew::SlewController;
pub use door::{DoorState, DoorController};
pub use contact::ContactWindow;
pub use tracking::TrackingLoop;
pub use stations::{NetworkStation, StationType, StationStats};
pub use downselect::{Downselect, ScoringWeights, StationEvaluation, DownselectSummary};
pub use weather::{
    WeatherConditions, FsoWeatherScore, MockWeatherProvider, WeatherProvider,
    // FSO Weather scoring weights (9 decimal precision)
    W_CLOUD, W_VISIBILITY, W_PRECIP, W_TURBULENCE, W_AIR_QUALITY, W_SUNSHINE, W_CLEAR_NIGHTS,
    // Viability thresholds
    VIABILITY_CLOUD_MIN, VIABILITY_VISIBILITY_MIN, VIABILITY_PRECIP_MIN,
    VIABILITY_AIR_QUALITY_MIN, VIABILITY_COMPOSITE_MIN,
};

#[cfg(feature = "weather-api")]
pub use weather_api::{WeatherApi, WeatherApiConfig, WeatherApiProvider, WeatherApiError};

/// Earth constants
const EARTH_RADIUS_KM: f64 = 6378.137;
const DEG_TO_RAD: f64 = PI / 180.0;
const RAD_TO_DEG: f64 = 180.0 / PI;

/// Ground station identity and position
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroundStationConfig {
    pub id: String,
    pub name: String,
    pub latitude_deg: f64,
    pub longitude_deg: f64,
    pub altitude_m: f64,
    pub min_elevation_deg: f64,  // Minimum tracking elevation (typically 5-10°)
    pub max_slew_rate_deg_s: f64, // Max slew speed in deg/sec
    pub fov_deg: f64,            // Field of view
}

impl Default for GroundStationConfig {
    fn default() -> Self {
        Self {
            id: "GS-000".to_string(),
            name: "Default".to_string(),
            latitude_deg: 0.0,
            longitude_deg: 0.0,
            altitude_m: 0.0,
            min_elevation_deg: 5.0,
            max_slew_rate_deg_s: 10.0,
            fov_deg: 0.1, // ~0.1° for FSO
        }
    }
}

/// Satellite position for tracking
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct SatellitePosition {
    pub norad_id: u32,
    pub latitude_deg: f64,
    pub longitude_deg: f64,
    pub altitude_km: f64,
    pub epoch_unix: i64,
}

/// Pointing angles from ground station to satellite
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct PointingAngles {
    pub azimuth_deg: f64,    // 0-360° from North
    pub elevation_deg: f64,  // 0-90° from horizon
    pub range_km: f64,       // Slant range to satellite
    pub doppler_shift_hz: f64, // For FSO frequency tracking
}

/// Ground station state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroundStationState {
    pub config: GroundStationConfig,
    pub current_pointing: PointingAngles,
    pub target_pointing: Option<PointingAngles>,
    pub door_state: DoorState,
    pub tracking_satellite: Option<u32>, // NORAD ID if tracking
    pub link_margin_db: f64,
    pub weather_score: f64,
    pub last_update_unix: i64,
}

// ============================================================================
// WASM EXPORTS - Micro-functions for ground station control
// ============================================================================

#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub struct GroundStation {
    state: GroundStationState,
    slew: SlewController,
    door: DoorController,
}

#[cfg(feature = "wasm")]
#[wasm_bindgen]
impl GroundStation {
    /// Create new ground station from config JSON
    #[wasm_bindgen(constructor)]
    pub fn new(config_json: &str) -> Result<GroundStation, JsValue> {
        let config: GroundStationConfig = serde_json::from_str(config_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid config: {}", e)))?;

        Ok(Self {
            state: GroundStationState {
                config: config.clone(),
                current_pointing: PointingAngles {
                    azimuth_deg: 0.0,
                    elevation_deg: 90.0, // Parked pointing up
                    range_km: 0.0,
                    doppler_shift_hz: 0.0,
                },
                target_pointing: None,
                door_state: DoorState::Closed,
                tracking_satellite: None,
                link_margin_db: 0.0,
                weather_score: 1.0,
                last_update_unix: 0,
            },
            slew: SlewController::new(config.max_slew_rate_deg_s),
            door: DoorController::new(),
        })
    }

    /// Micro-function: Calculate pointing angles to satellite
    #[wasm_bindgen]
    pub fn calc_pointing(&self, sat_lat: f64, sat_lon: f64, sat_alt_km: f64) -> String {
        let angles = calculate_look_angles(
            self.state.config.latitude_deg,
            self.state.config.longitude_deg,
            self.state.config.altitude_m / 1000.0,
            sat_lat,
            sat_lon,
            sat_alt_km,
        );
        serde_json::to_string(&angles).unwrap_or_default()
    }

    /// Micro-function: Check if satellite is visible (above min elevation)
    #[wasm_bindgen]
    pub fn is_visible(&self, sat_lat: f64, sat_lon: f64, sat_alt_km: f64) -> bool {
        let angles = calculate_look_angles(
            self.state.config.latitude_deg,
            self.state.config.longitude_deg,
            self.state.config.altitude_m / 1000.0,
            sat_lat,
            sat_lon,
            sat_alt_km,
        );
        angles.elevation_deg >= self.state.config.min_elevation_deg
    }

    /// Micro-function: Command slew to target
    #[wasm_bindgen]
    pub fn slew_to(&mut self, azimuth_deg: f64, elevation_deg: f64) {
        self.state.target_pointing = Some(PointingAngles {
            azimuth_deg,
            elevation_deg,
            range_km: 0.0,
            doppler_shift_hz: 0.0,
        });
    }

    /// Micro-function: Update slew position (call each tick)
    #[wasm_bindgen]
    pub fn tick_slew(&mut self, delta_sec: f64) -> String {
        if let Some(target) = &self.state.target_pointing {
            let new_pointing = self.slew.step(
                &self.state.current_pointing,
                target,
                delta_sec,
            );
            self.state.current_pointing = new_pointing;
        }
        serde_json::to_string(&self.state.current_pointing).unwrap_or_default()
    }

    /// Micro-function: Open door (aperture)
    #[wasm_bindgen]
    pub fn open_door(&mut self) {
        self.door.open(&mut self.state.door_state);
    }

    /// Micro-function: Close door (aperture)
    #[wasm_bindgen]
    pub fn close_door(&mut self) {
        self.door.close(&mut self.state.door_state);
    }

    /// Micro-function: Get door state
    #[wasm_bindgen]
    pub fn door_state(&self) -> String {
        serde_json::to_string(&self.state.door_state).unwrap_or_default()
    }

    /// Micro-function: Start tracking a satellite
    #[wasm_bindgen]
    pub fn start_tracking(&mut self, norad_id: u32, sat_lat: f64, sat_lon: f64, sat_alt_km: f64) {
        let angles = calculate_look_angles(
            self.state.config.latitude_deg,
            self.state.config.longitude_deg,
            self.state.config.altitude_m / 1000.0,
            sat_lat,
            sat_lon,
            sat_alt_km,
        );

        if angles.elevation_deg >= self.state.config.min_elevation_deg {
            self.state.tracking_satellite = Some(norad_id);
            self.state.target_pointing = Some(angles);
            self.door.open(&mut self.state.door_state);
        }
    }

    /// Micro-function: Stop tracking
    #[wasm_bindgen]
    pub fn stop_tracking(&mut self) {
        self.state.tracking_satellite = None;
        self.state.target_pointing = None;
        self.door.close(&mut self.state.door_state);
    }

    /// Micro-function: Calculate FSO link budget
    #[wasm_bindgen]
    pub fn calc_link_budget(&self, elevation_deg: f64, weather_score: f64) -> f64 {
        link_budget::calculate_margin(elevation_deg, weather_score)
    }

    /// Micro-function: Update weather score
    #[wasm_bindgen]
    pub fn set_weather(&mut self, score: f64) {
        self.state.weather_score = score.clamp(0.0, 1.0);
    }

    /// Get full state as JSON
    #[wasm_bindgen]
    pub fn get_state(&self) -> String {
        serde_json::to_string(&self.state).unwrap_or_default()
    }

    /// Get config
    #[wasm_bindgen]
    pub fn get_config(&self) -> String {
        serde_json::to_string(&self.state.config).unwrap_or_default()
    }
}

// ============================================================================
// Core calculations (used by both WASM and native)
// ============================================================================

/// Calculate look angles (azimuth/elevation) from ground station to satellite
pub fn calculate_look_angles(
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

    // Satellite ECEF (simplified - assumes lat/lon are sub-satellite point)
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
        doppler_shift_hz: 0.0, // TODO: calculate from velocity
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_look_angles_overhead() {
        // Satellite directly overhead ground station
        let angles = calculate_look_angles(
            0.0, 0.0, 0.0,    // GS at equator/prime meridian
            0.0, 0.0, 500.0,  // Sat at same lat/lon, 500km altitude
        );
        assert!(angles.elevation_deg > 85.0, "Should be nearly overhead");
        assert!((angles.range_km - 500.0).abs() < 10.0, "Range should be ~500km");
    }

    #[test]
    fn test_look_angles_horizon() {
        // Satellite far away should be low elevation
        let angles = calculate_look_angles(
            0.0, 0.0, 0.0,      // GS at equator
            45.0, 45.0, 500.0,  // Sat far north-east
        );
        assert!(angles.elevation_deg < 45.0, "Should be lower elevation");
    }
}
