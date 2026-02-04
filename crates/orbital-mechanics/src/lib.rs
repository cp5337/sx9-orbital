//! Orbital Mechanics Library
//!
//! SGP4 propagation, coordinate transforms, and Walker Delta constellation modeling
//! for the HALO constellation (12 MEO satellites at 10,500 km).

use chrono::{DateTime, NaiveDateTime, Utc};
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

/// Raw orbital parameters for direct sgp4::Elements construction.
/// Bypasses TLE string formatting/parsing roundtrip.
/// All angles in degrees, mean_motion in orbits/day (Kozai convention).
#[derive(Debug, Clone, Copy)]
pub struct OrbitalParams {
    pub epoch: NaiveDateTime,
    pub norad_id: u64,
    pub inclination_deg: f64,
    pub right_ascension_deg: f64,
    pub eccentricity: f64,
    pub argument_of_perigee_deg: f64,
    pub mean_anomaly_deg: f64,
    pub mean_motion_orbits_day: f64,
}

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
    #[serde(skip)]
    pub orbital_params: Option<OrbitalParams>,
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
        if let Some(ref params) = self.orbital_params {
            propagation::sgp4_propagate_direct(params, time)
        } else {
            propagation::sgp4_propagate(&self.tle_line1, &self.tle_line2, time)
        }
    }

    pub fn ground_track(&self, time: DateTime<Utc>) -> Result<GeodeticPosition> {
        let state = self.propagate(time)?;
        transforms::eci_to_geodetic(state.position_x, state.position_y, state.position_z)
    }
}

pub mod propagation {
    use super::*;

    /// Propagate from raw orbital parameters — bypasses TLE string parsing entirely.
    /// Constructs sgp4::Elements directly from OrbitalParams.
    pub fn sgp4_propagate_direct(
        params: &OrbitalParams,
        time: DateTime<Utc>,
    ) -> Result<StateVector> {
        let elements = sgp4::Elements {
            object_name: None,
            international_designator: None,
            norad_id: params.norad_id,
            classification: sgp4::Classification::Unclassified,
            datetime: params.epoch,
            mean_motion_dot: 0.0,
            mean_motion_ddot: 0.0,
            drag_term: 0.0,
            element_set_number: 1,
            inclination: params.inclination_deg,
            right_ascension: params.right_ascension_deg,
            eccentricity: params.eccentricity,
            argument_of_perigee: params.argument_of_perigee_deg,
            mean_anomaly: params.mean_anomaly_deg,
            mean_motion: params.mean_motion_orbits_day,
            revolution_number: 1,
            ephemeris_type: 0,
        };

        propagate_from_elements(&elements, time)
    }

    /// Propagate from TLE string pair (legacy path, used when OrbitalParams unavailable).
    pub fn sgp4_propagate(
        tle_line1: &str,
        tle_line2: &str,
        time: DateTime<Utc>,
    ) -> Result<StateVector> {
        let elements = sgp4::Elements::from_tle(
            None,
            tle_line1.as_bytes(),
            tle_line2.as_bytes(),
        ).map_err(|e| OrbitalError::InvalidTle(format!("{:?}", e)))?;

        propagate_from_elements(&elements, time)
    }

    fn propagate_from_elements(
        elements: &sgp4::Elements,
        time: DateTime<Utc>,
    ) -> Result<StateVector> {
        let constants = sgp4::Constants::from_elements(elements)
            .map_err(|e| OrbitalError::PropagationFailed(format!("{:?}", e)))?;

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
    use chrono::{Datelike, Timelike, Utc};

    /// Greek alphabet names for the 12-satellite HALO constellation.
    /// Plane 0: Alpha–Delta, Plane 1: Epsilon–Theta, Plane 2: Iota–Mu.
    const GREEK_NAMES: [&str; 12] = [
        "ALPHA", "BETA", "GAMMA", "DELTA",
        "EPSILON", "ZETA", "ETA", "THETA",
        "IOTA", "KAPPA", "LAMBDA", "MU",
    ];

    const GREEK_IDS: [&str; 12] = [
        "alpha", "beta", "gamma", "delta",
        "epsilon", "zeta", "eta", "theta",
        "iota", "kappa", "lambda", "mu",
    ];

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

        /// Generate valid TLE line pairs for all satellites in the constellation.
        /// Returns Vec of (name, tle_line1, tle_line2).
        /// NORAD IDs: 60001 through 60001+total_satellites-1.
        pub fn generate_tles(&self) -> Vec<(String, String, String)> {
            let now = Utc::now();
            let epoch_year = (now.year() % 100) as u8;
            let epoch_day = now.ordinal() as f64
                + now.hour() as f64 / 24.0
                + now.minute() as f64 / 1440.0
                + now.second() as f64 / 86400.0;

            // Compute mean motion (revolutions per day) from altitude
            let earth_radius = 6378.137_f64;
            let semi_major = earth_radius + self.altitude_km;
            let mu = 398600.4418_f64;
            let n_rad_s = (mu / semi_major.powi(3)).sqrt();
            let mean_motion = n_rad_s * 86400.0 / (2.0 * std::f64::consts::PI);

            let sats_per_plane = self.satellites_per_plane();
            let plane_spacing = self.plane_spacing_deg();
            let in_plane_spacing = self.in_plane_spacing_deg();
            let phase_offset = self.phasing as f64 * 360.0 / self.total_satellites as f64;

            let mut results = Vec::with_capacity(self.total_satellites as usize);

            for plane in 0..self.planes {
                for slot in 0..sats_per_plane {
                    let sat_index = plane * sats_per_plane + slot;
                    let norad_id = 60001 + sat_index;
                    let name = GREEK_NAMES[sat_index as usize].to_string();

                    let raan = plane as f64 * plane_spacing;
                    let mean_anomaly = (slot as f64 * in_plane_spacing
                        + plane as f64 * phase_offset)
                        % 360.0;

                    let line1 = format_tle_line1(norad_id, epoch_year, epoch_day);
                    let line2 = format_tle_line2(
                        norad_id,
                        self.inclination_deg,
                        raan,
                        0.001,
                        0.0,
                        mean_anomaly,
                        mean_motion,
                    );

                    results.push((name, line1, line2));
                }
            }

            results
        }

        /// Generate Satellite structs with valid TLEs and direct OrbitalParams.
        /// OrbitalParams bypass TLE string parsing for reliable SGP4 propagation.
        pub fn generate_satellites(&self) -> Vec<super::Satellite> {
            let now = Utc::now();
            let epoch = now.naive_utc();

            let earth_radius = 6378.137_f64;
            let semi_major = earth_radius + self.altitude_km;
            let mu = 398600.4418_f64;
            let n_rad_s = (mu / semi_major.powi(3)).sqrt();
            let mean_motion = n_rad_s * 86400.0 / (2.0 * std::f64::consts::PI);

            let sats_per_plane = self.satellites_per_plane();
            let plane_spacing = self.plane_spacing_deg();
            let in_plane_spacing = self.in_plane_spacing_deg();
            let phase_offset = self.phasing as f64 * 360.0 / self.total_satellites as f64;

            let tles = self.generate_tles();

            tles.into_iter()
                .enumerate()
                .map(|(i, (name, line1, line2))| {
                    let plane_idx = i as u32 / sats_per_plane;
                    let slot_idx = i as u32 % sats_per_plane;
                    let norad_id = 60001 + i as u32;

                    let raan = plane_idx as f64 * plane_spacing;
                    let mean_anomaly = (slot_idx as f64 * in_plane_spacing
                        + plane_idx as f64 * phase_offset)
                        % 360.0;

                    super::Satellite {
                        id: GREEK_IDS[i].to_string(),
                        norad_id,
                        name,
                        tle_line1: line1,
                        tle_line2: line2,
                        plane: plane_idx as u8,
                        slot: slot_idx as u8,
                        status: super::SatelliteStatus::Operational,
                        orbital_params: Some(super::OrbitalParams {
                            epoch,
                            norad_id: norad_id as u64,
                            inclination_deg: self.inclination_deg,
                            right_ascension_deg: raan,
                            eccentricity: 0.001,
                            argument_of_perigee_deg: 0.0,
                            mean_anomaly_deg: mean_anomaly,
                            mean_motion_orbits_day: mean_motion,
                        }),
                    }
                })
                .collect()
        }
    }

    fn tle_checksum(line: &str) -> u8 {
        (line
            .bytes()
            .take(68)
            .map(|b| {
                if b.is_ascii_digit() {
                    (b - b'0') as u16
                } else if b == b'-' {
                    1u16
                } else {
                    0u16
                }
            })
            .sum::<u16>()
            % 10) as u8
    }

    fn format_tle_line1(norad_id: u32, epoch_year: u8, epoch_day: f64) -> String {
        // TLE Line 1: 69 characters
        // Cols: 1(line#) 2(sp) 3-7(norad) 8(class) 9(sp) 10-17(intl desig)
        //       18(sp) 19-20(yr) 21-32(day) 33(sp) 34-43(ndot) 44(sp)
        //       45-52(nddot) 53(sp) 54-61(bstar) 62(sp) 63(etype) 64(sp) 65-68(elset) 69(cksum)
        let line = format!(
            "1 {:05}U 00000A   {:02}{:012.8}  .00000000  00000-0  00000-0 0    1",
            norad_id, epoch_year, epoch_day
        );
        let cksum = tle_checksum(&line);
        format!("{}{}", line, cksum)
    }

    fn format_tle_line2(
        norad_id: u32,
        inc_deg: f64,
        raan_deg: f64,
        eccentricity: f64,
        arg_perigee_deg: f64,
        mean_anomaly_deg: f64,
        mean_motion: f64,
    ) -> String {
        // TLE Line 2: 69 characters
        // Cols: 1(line#) 2(sp) 3-7(norad) 8(sp) 9-16(inc) 17(sp) 18-25(raan)
        //       26(sp) 27-33(ecc) 34(sp) 35-42(argp) 43(sp) 44-51(ma)
        //       52(sp) 53-63(mm) 64-68(revnum) 69(cksum)
        let ecc_int = (eccentricity * 10_000_000.0).round() as u64;
        let line = format!(
            "2 {:05} {:>8.4} {:>8.4} {:07} {:>8.4} {:>8.4} {:>11.8}{:05}",
            norad_id, inc_deg, raan_deg, ecc_int, arg_perigee_deg, mean_anomaly_deg,
            mean_motion, 1u32,
        );
        let cksum = tle_checksum(&line);
        format!("{}{}", line, cksum)
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn test_generate_tles_parse() {
            let walker = WalkerDelta::halo_constellation();
            let tles = walker.generate_tles();

            assert_eq!(tles.len(), 12);

            for (name, line1, line2) in &tles {
                assert_eq!(line1.len(), 69, "Line 1 wrong length for {}", name);
                assert_eq!(line2.len(), 69, "Line 2 wrong length for {}", name);

                let elements = sgp4::Elements::from_tle(
                    None,
                    line1.as_bytes(),
                    line2.as_bytes(),
                );
                assert!(
                    elements.is_ok(),
                    "Failed to parse TLE for {}: {:?}\nL1: {}\nL2: {}",
                    name,
                    elements.err(),
                    line1,
                    line2
                );
            }
        }

        #[test]
        fn test_generate_satellites_propagate() {
            let walker = WalkerDelta::halo_constellation();
            let sats = walker.generate_satellites();

            assert_eq!(sats.len(), 12);

            let now = chrono::Utc::now();
            for sat in &sats {
                let result = sat.propagate(now);
                assert!(result.is_ok(), "Failed to propagate {}: {:?}", sat.name, result.err());

                let sv = result.unwrap();
                let r = (sv.position_x.powi(2) + sv.position_y.powi(2) + sv.position_z.powi(2)).sqrt();
                // MEO at 10500km → radius ~16878 km
                assert!(
                    r > 15000.0 && r < 18000.0,
                    "Unexpected radius {:.0} km for {} (expected ~16878)",
                    r,
                    sat.name
                );
            }
        }
    }
}
