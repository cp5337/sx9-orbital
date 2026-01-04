//! Orbital Mechanics Library
//!
//! SGP4 propagation, coordinate transforms, and Walker Delta constellation modeling
//! for the HALO constellation (12 MEO satellites at 10,500 km).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum OrbitalError {
    #[error("Invalid TLE format: {0}")]
    InvalidTle(String),
    #[error("Propagation failed: {0}")]
    PropagationFailed(String),
    #[error("Invalid coordinates: {0}")]
    InvalidCoordinates(String),
}

pub type Result<T> = std::result::Result<T, OrbitalError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Satellite {
    pub id: String,
    pub norad_id: u32,
    pub name: String,
    pub tle_line1: String,
    pub tle_line2: String,
    pub plane: u8,
    pub slot: u8,
    pub status: SatelliteStatus,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum SatelliteStatus {
    Operational,
    Spare,
    Maneuvering,
    Degraded,
    Offline,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct StateVector {
    pub position_x: f64,
    pub position_y: f64,
    pub position_z: f64,
    pub velocity_x: f64,
    pub velocity_y: f64,
    pub velocity_z: f64,
    pub epoch: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct GeodeticPosition {
    pub latitude: f64,
    pub longitude: f64,
    pub altitude_km: f64,
}

impl Satellite {
    pub fn propagate(&self, time: DateTime<Utc>) -> Result<StateVector> {
        propagation::sgp4_propagate(&self.tle_line1, &self.tle_line2, time)
    }

    pub fn ground_track(&self, time: DateTime<Utc>) -> Result<GeodeticPosition> {
        let state = self.propagate(time)?;
        transforms::eci_to_geodetic(state.position_x, state.position_y, state.position_z)
    }
}

pub mod propagation {
    use super::*;

    pub fn sgp4_propagate(
        tle_line1: &str,
        tle_line2: &str,
        time: DateTime<Utc>,
    ) -> Result<StateVector> {
        // Parse TLE and propagate using sgp4 crate
        let elements = sgp4::Elements::from_tle(
            None,
            tle_line1.as_bytes(),
            tle_line2.as_bytes(),
        ).map_err(|e| OrbitalError::InvalidTle(format!("{:?}", e)))?;

        let constants = sgp4::Constants::from_elements(&elements)
            .map_err(|e| OrbitalError::PropagationFailed(format!("{:?}", e)))?;

        // Convert epoch to DateTime<Utc> for comparison
        let epoch_utc = DateTime::<Utc>::from_naive_utc_and_offset(elements.datetime, Utc);
        let duration = time.signed_duration_since(epoch_utc);
        let minutes_since_epoch = duration.num_seconds() as f64 / 60.0;

        let prediction = constants.propagate(minutes_since_epoch)
            .map_err(|e| OrbitalError::PropagationFailed(format!("{:?}", e)))?;

        Ok(StateVector {
            position_x: prediction.position[0],
            position_y: prediction.position[1],
            position_z: prediction.position[2],
            velocity_x: prediction.velocity[0],
            velocity_y: prediction.velocity[1],
            velocity_z: prediction.velocity[2],
            epoch: time,
        })
    }
}

pub mod transforms {
    use super::*;

    const EARTH_RADIUS_KM: f64 = 6378.137;
    const EARTH_FLATTENING: f64 = 1.0 / 298.257223563;

    pub fn eci_to_geodetic(x: f64, y: f64, z: f64) -> Result<GeodeticPosition> {
        // Convert ECI to ECEF (simplified - ignoring Earth rotation for now)
        let r = (x * x + y * y).sqrt();
        let longitude = y.atan2(x).to_degrees();
        let latitude = z.atan2(r).to_degrees();
        let altitude_km = (x * x + y * y + z * z).sqrt() - EARTH_RADIUS_KM;

        Ok(GeodeticPosition {
            latitude,
            longitude,
            altitude_km,
        })
    }

    pub fn geodetic_to_eci(pos: &GeodeticPosition) -> Result<(f64, f64, f64)> {
        let lat_rad = pos.latitude.to_radians();
        let lon_rad = pos.longitude.to_radians();
        let alt = pos.altitude_km;

        let n = EARTH_RADIUS_KM / (1.0 - EARTH_FLATTENING * lat_rad.sin().powi(2)).sqrt();

        let x = (n + alt) * lat_rad.cos() * lon_rad.cos();
        let y = (n + alt) * lat_rad.cos() * lon_rad.sin();
        let z = (n * (1.0 - EARTH_FLATTENING) + alt) * lat_rad.sin();

        Ok((x, y, z))
    }
}

pub mod walker {
    #[derive(Debug, Clone)]
    pub struct WalkerDelta {
        pub total_satellites: u32,
        pub planes: u32,
        pub phasing: u32,
        pub altitude_km: f64,
        pub inclination_deg: f64,
    }

    impl WalkerDelta {
        pub fn halo_constellation() -> Self {
            WalkerDelta {
                total_satellites: 12,
                planes: 3,
                phasing: 4,
                altitude_km: 10500.0,
                inclination_deg: 55.0,
            }
        }

        pub fn satellites_per_plane(&self) -> u32 {
            self.total_satellites / self.planes
        }

        pub fn plane_spacing_deg(&self) -> f64 {
            360.0 / self.planes as f64
        }

        pub fn in_plane_spacing_deg(&self) -> f64 {
            360.0 / self.satellites_per_plane() as f64
        }
    }
}
