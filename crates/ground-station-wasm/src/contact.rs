//! Contact Window Calculator
//!
//! Calculates when satellites are visible from a ground station.
//! Used for scheduling passes and planning tracking operations.

use serde::{Deserialize, Serialize};
use crate::{calculate_look_angles, GroundStationConfig};

/// A contact window (satellite pass)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContactWindow {
    pub norad_id: u32,
    pub aos_unix: i64,         // Acquisition of Signal
    pub los_unix: i64,         // Loss of Signal
    pub tca_unix: i64,         // Time of Closest Approach
    pub max_elevation_deg: f64,
    pub aos_azimuth_deg: f64,
    pub los_azimuth_deg: f64,
    pub duration_sec: f64,
}

/// Contact window calculator
pub struct ContactCalculator {
    config: GroundStationConfig,
}

impl ContactCalculator {
    pub fn new(config: GroundStationConfig) -> Self {
        Self { config }
    }

    /// Check if a satellite position is visible
    pub fn is_visible(&self, sat_lat: f64, sat_lon: f64, sat_alt_km: f64) -> bool {
        let angles = calculate_look_angles(
            self.config.latitude_deg,
            self.config.longitude_deg,
            self.config.altitude_m / 1000.0,
            sat_lat,
            sat_lon,
            sat_alt_km,
        );
        angles.elevation_deg >= self.config.min_elevation_deg
    }

    /// Find contact windows in a time range
    /// (Simplified - in production would use SGP4 propagation)
    pub fn find_windows(
        &self,
        norad_id: u32,
        positions: &[(i64, f64, f64, f64)], // (unix_time, lat, lon, alt_km)
    ) -> Vec<ContactWindow> {
        let mut windows = Vec::new();
        let mut in_view = false;
        let mut aos_time = 0i64;
        let mut aos_az = 0.0;
        let mut max_el = 0.0;
        let mut tca_time = 0i64;

        for &(time, lat, lon, alt) in positions {
            let angles = calculate_look_angles(
                self.config.latitude_deg,
                self.config.longitude_deg,
                self.config.altitude_m / 1000.0,
                lat,
                lon,
                alt,
            );

            let visible = angles.elevation_deg >= self.config.min_elevation_deg;

            if visible && !in_view {
                // AOS - start of pass
                in_view = true;
                aos_time = time;
                aos_az = angles.azimuth_deg;
                max_el = angles.elevation_deg;
                tca_time = time;
            } else if visible && in_view {
                // During pass
                if angles.elevation_deg > max_el {
                    max_el = angles.elevation_deg;
                    tca_time = time;
                }
            } else if !visible && in_view {
                // LOS - end of pass
                in_view = false;
                windows.push(ContactWindow {
                    norad_id,
                    aos_unix: aos_time,
                    los_unix: time,
                    tca_unix: tca_time,
                    max_elevation_deg: max_el,
                    aos_azimuth_deg: aos_az,
                    los_azimuth_deg: angles.azimuth_deg,
                    duration_sec: (time - aos_time) as f64,
                });
            }
        }

        // Handle pass still in progress at end of data
        if in_view {
            if let Some(&(time, _, _, _)) = positions.last() {
                let angles = calculate_look_angles(
                    self.config.latitude_deg,
                    self.config.longitude_deg,
                    self.config.altitude_m / 1000.0,
                    positions.last().unwrap().1,
                    positions.last().unwrap().2,
                    positions.last().unwrap().3,
                );
                windows.push(ContactWindow {
                    norad_id,
                    aos_unix: aos_time,
                    los_unix: time,
                    tca_unix: tca_time,
                    max_elevation_deg: max_el,
                    aos_azimuth_deg: aos_az,
                    los_azimuth_deg: angles.azimuth_deg,
                    duration_sec: (time - aos_time) as f64,
                });
            }
        }

        windows
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_visibility_check() {
        let config = GroundStationConfig {
            latitude_deg: 34.0,
            longitude_deg: -118.0,
            altitude_m: 100.0,
            min_elevation_deg: 10.0,
            ..Default::default()
        };

        let calc = ContactCalculator::new(config);

        // Satellite directly overhead should be visible
        assert!(calc.is_visible(34.0, -118.0, 500.0));

        // Satellite on opposite side of Earth should not be visible
        assert!(!calc.is_visible(-34.0, 62.0, 500.0));
    }
}
