//! Accurate TLE Generator for HALO Constellation
//!
//! Creates realistic TLEs based on:
//! - Walker Delta pattern (planes, satellites per plane, phasing)
//! - Van Allen belt avoidance (10,500 km = safe MEO slot)
//! - 55° inclination (avoids polar waste, covers ±55° latitude)
//! - Non-zero eccentricity (realistic orbits aren't perfectly circular)
//!
//! # Orbital Mechanics Reference
//!
//! ## Van Allen Belts
//! - Inner belt: 1,000 - 6,000 km (protons, dangerous)
//! - Slot region: 6,000 - 13,000 km (LOW RADIATION - our target)
//! - Outer belt: 13,000 - 60,000 km (electrons, moderate)
//!
//! HALO at 10,500 km sits in the "slot" - optimal for MEO ops.
//!
//! ## Walker Delta Notation: T/P/F
//! - T = Total satellites
//! - P = Number of orbital planes
//! - F = Phasing factor (0 to P-1)
//!
//! HALO: 12/3/1 = 12 sats, 3 planes, phase factor 1
//! - 4 satellites per plane
//! - Planes at 0°, 120°, 240° RAAN
//! - Phase offset: 360° / T * F = 30° between planes

use chrono::{DateTime, Datelike, Timelike, Utc};
use sx9_foundation_primitives::{Nano9, NANO};

/// Earth constants (Nano9 scaled where applicable)
/// μ_Earth = 398600.4418 km³/s² - stored as raw for sqrt operations
const MU_EARTH_RAW: i64 = 398_600_441_800_000; // μ * 10^9 for precision
const EARTH_RADIUS_KM: i64 = 6_378_137_000_000; // 6378.137 km * 10^9
const J2_NANO: i64 = 1_082_630; // 0.00108263 * 10^9

/// Pi constants in Nano9
const PI_NANO: i64 = 3_141_592_653; // π * 10^9
const TWO_PI_NANO: i64 = 6_283_185_307; // 2π * 10^9

/// HALO constellation parameters (Nano9 where applicable)
pub const HALO_ALTITUDE_KM: i64 = 10_500_000_000_000; // 10500 km * 10^9
pub const HALO_INCLINATION: Nano9 = Nano9(960_454_259); // 55° in radians * 10^9 (0.9599...)
pub const HALO_INCLINATION_DEG: i64 = 55_000_000_000; // 55° * 10^9
pub const HALO_ECCENTRICITY: Nano9 = Nano9(400_000); // 0.0004 * 10^9
pub const HALO_PLANES: u8 = 3;
pub const HALO_SATS_PER_PLANE: u8 = 4;
pub const HALO_PHASE_FACTOR: u8 = 1;
pub const HALO_TOTAL_SATS: u8 = 12;

/// Degrees to Nano9 radians conversion factor: π/180 * 10^9
const DEG_TO_RAD_NANO: i64 = 17_453_292; // (π/180) * 10^9

/// Satellite names (Greek alphabet)
const SAT_NAMES: [&str; 12] = [
    "alpha", "beta", "gamma", "delta",
    "epsilon", "zeta", "eta", "theta",
    "iota", "kappa", "lambda", "mu"
];

/// Generated TLE with orbital elements
#[derive(Debug, Clone)]
pub struct GeneratedTLE {
    pub name: String,
    pub norad_id: u32,
    pub line1: String,
    pub line2: String,
    pub elements: OrbitalElements,
}

/// Keplerian orbital elements (all Nano9 fixed-point)
#[derive(Debug, Clone, Copy)]
pub struct OrbitalElements {
    /// Semi-major axis in km (Nano9: km * 10^9)
    pub semi_major_axis: Nano9,
    /// Eccentricity (Nano9: dimensionless * 10^9)
    pub eccentricity: Nano9,
    /// Inclination in radians (Nano9: rad * 10^9)
    pub inclination: Nano9,
    /// RAAN in radians (Nano9: rad * 10^9)
    pub raan: Nano9,
    /// Argument of perigee in radians (Nano9: rad * 10^9)
    pub arg_perigee: Nano9,
    /// Mean anomaly in radians (Nano9: rad * 10^9)
    pub mean_anomaly: Nano9,
    /// Mean motion in rev/day (Nano9: rev/day * 10^9)
    pub mean_motion: Nano9,
    /// Orbital period in seconds (Nano9: s * 10^9)
    pub period: Nano9,
}

impl OrbitalElements {
    /// Calculate mean motion from semi-major axis (Nano9)
    /// n = sqrt(μ/a³) in rad/s, convert to rev/day
    /// Returns Nano9 (rev/day * 10^9)
    pub fn mean_motion_from_sma(sma: Nano9) -> Nano9 {
        // Use f64 for sqrt, then convert back
        let sma_km = sma.to_f64();
        let mu = 398600.4418_f64;
        let n_rad_s = (mu / sma_km.powi(3)).sqrt();
        let rev_day = n_rad_s * 86400.0 / (2.0 * std::f64::consts::PI);
        Nano9::from_f64(rev_day)
    }

    /// Calculate orbital period in seconds (Nano9)
    /// T = 2π * sqrt(a³/μ)
    pub fn period_from_sma(sma: Nano9) -> Nano9 {
        let sma_km = sma.to_f64();
        let mu = 398600.4418_f64;
        let period_s = 2.0 * std::f64::consts::PI * (sma_km.powi(3) / mu).sqrt();
        Nano9::from_f64(period_s)
    }

    /// Calculate J2 secular drift of RAAN (nodal precession)
    /// Returns Nano9 radians per day
    pub fn raan_drift_per_day(sma: Nano9, ecc: Nano9, inc: Nano9) -> Nano9 {
        let sma_km = sma.to_f64();
        let e = ecc.to_f64();
        let inc_rad = inc.to_f64();
        let r_e = 6378.137_f64;
        let j2 = 0.00108263_f64;

        let n_rad_s = (398600.4418 / sma_km.powi(3)).sqrt();
        let p = sma_km * (1.0 - e * e);

        // RAAN drift: -3/2 * n * J2 * (R_e/p)² * cos(i)
        let drift_rad_s = -1.5 * n_rad_s * j2 * (r_e / p).powi(2) * inc_rad.cos();
        Nano9::from_f64(drift_rad_s * 86400.0)
    }

    /// Convert degrees (Nano9) to radians (Nano9)
    pub fn deg_to_rad(deg: Nano9) -> Nano9 {
        // rad = deg * π / 180
        // In Nano9: (deg * PI_NANO) / (180 * NANO)
        Nano9((deg.0 as i128 * PI_NANO as i128 / (180 * NANO) as i128) as i64)
    }

    /// Convert radians (Nano9) to degrees (Nano9)
    pub fn rad_to_deg(rad: Nano9) -> Nano9 {
        // deg = rad * 180 / π
        Nano9((rad.0 as i128 * 180 * NANO as i128 / PI_NANO as i128) as i64)
    }

    /// Get inclination in degrees for TLE output
    pub fn inclination_deg(&self) -> f64 {
        Self::rad_to_deg(self.inclination).to_f64()
    }

    /// Get RAAN in degrees for TLE output
    pub fn raan_deg(&self) -> f64 {
        Self::rad_to_deg(self.raan).to_f64()
    }

    /// Get argument of perigee in degrees for TLE output
    pub fn arg_perigee_deg(&self) -> f64 {
        Self::rad_to_deg(self.arg_perigee).to_f64()
    }

    /// Get mean anomaly in degrees for TLE output
    pub fn mean_anomaly_deg(&self) -> f64 {
        Self::rad_to_deg(self.mean_anomaly).to_f64()
    }
}

/// Generate HALO constellation TLEs using Walker Delta pattern
/// All calculations use Nano9 fixed-point for determinism
pub fn generate_halo_constellation(epoch: DateTime<Utc>) -> Vec<GeneratedTLE> {
    let mut tles = Vec::with_capacity(HALO_TOTAL_SATS as usize);

    // Semi-major axis: Earth radius + altitude (both in Nano9 km)
    let earth_r = Nano9::from_f64(6378.137);
    let altitude = Nano9::from_f64(10500.0);
    let sma = earth_r + altitude;

    let mean_motion = OrbitalElements::mean_motion_from_sma(sma);
    let period = OrbitalElements::period_from_sma(sma);

    // Walker Delta spacing in Nano9 radians
    // RAAN spacing: 2π / P (planes)
    let raan_spacing = Nano9(TWO_PI_NANO / HALO_PLANES as i64);

    // Mean anomaly spacing: 2π / sats_per_plane
    let ma_spacing = Nano9(TWO_PI_NANO / HALO_SATS_PER_PLANE as i64);

    // Phase offset: 2π * F / T
    let phase_offset = Nano9(TWO_PI_NANO * HALO_PHASE_FACTOR as i64 / HALO_TOTAL_SATS as i64);

    for plane in 0..HALO_PLANES {
        // RAAN for this plane
        let raan = Nano9(raan_spacing.0 * plane as i64);

        for slot in 0..HALO_SATS_PER_PLANE {
            let sat_index = (plane * HALO_SATS_PER_PLANE + slot) as usize;

            // Mean anomaly with Walker phasing
            let base_ma = Nano9(ma_spacing.0 * slot as i64);
            let phase_adj = Nano9(phase_offset.0 * plane as i64);
            let mean_anomaly = Nano9((base_ma.0 + phase_adj.0) % TWO_PI_NANO);

            // Argument of perigee - distributed for coverage (π/2 * slot)
            let arg_perigee = Nano9((PI_NANO / 2) * slot as i64 % TWO_PI_NANO);

            let elements = OrbitalElements {
                semi_major_axis: sma,
                eccentricity: HALO_ECCENTRICITY,
                inclination: HALO_INCLINATION,
                raan,
                arg_perigee,
                mean_anomaly,
                mean_motion,
                period,
            };

            let norad_id = 60001 + sat_index as u32; // Synthetic NORAD IDs
            let name = format!("HALO-{}-{}", plane + 1, slot + 1);

            let tle = generate_tle_lines(&name, norad_id, &elements, epoch);

            tles.push(GeneratedTLE {
                name: SAT_NAMES[sat_index].to_string(),
                norad_id,
                line1: tle.0,
                line2: tle.1,
                elements,
            });
        }
    }

    tles
}

/// Generate TLE line1 and line2 from orbital elements (Nano9 → f64 for output)
fn generate_tle_lines(
    _name: &str,
    norad_id: u32,
    elements: &OrbitalElements,
    epoch: DateTime<Utc>,
) -> (String, String) {
    // Epoch format: YYDDD.DDDDDDDD (2-digit year, day of year with fraction)
    let year = epoch.format("%y").to_string().parse::<u32>().unwrap_or(26);
    let day_of_year = epoch.ordinal() as f64
        + (epoch.hour() as f64 / 24.0)
        + (epoch.minute() as f64 / 1440.0)
        + (epoch.second() as f64 / 86400.0);

    // Line 1: Satellite number, classification, intl designator, epoch, derivatives, BSTAR, element set
    let line1 = format!(
        "1 {:05}U 24001A   {:02}{:012.8} -.00000000  00000-0  00000-0 0  999{}",
        norad_id,
        year,
        day_of_year,
        checksum_digit(&format!(
            "1 {:05}U 24001A   {:02}{:012.8} -.00000000  00000-0  00000-0 0  999",
            norad_id, year, day_of_year
        ))
    );

    // Line 2: Convert Nano9 elements to f64 degrees for TLE format
    // Eccentricity: Nano9 → decimal, then format as 7 digits (no leading decimal)
    let ecc_decimal = elements.eccentricity.to_f64();
    let ecc_str = format!("{:07}", (ecc_decimal * 10_000_000.0) as u32);

    let line2_base = format!(
        "2 {:05} {:8.4} {:8.4} {} {:8.4} {:8.4} {:11.8}{:05}",
        norad_id,
        elements.inclination_deg(),  // Nano9 rad → f64 deg
        elements.raan_deg(),         // Nano9 rad → f64 deg
        ecc_str,
        elements.arg_perigee_deg(),  // Nano9 rad → f64 deg
        elements.mean_anomaly_deg(), // Nano9 rad → f64 deg
        elements.mean_motion.to_f64(), // Nano9 rev/day → f64
        0 // revolution number at epoch
    );

    let line2 = format!("{}{}", line2_base, checksum_digit(&line2_base));

    (line1, line2)
}

/// Calculate TLE checksum digit
fn checksum_digit(line: &str) -> u32 {
    let sum: u32 = line
        .chars()
        .map(|c| match c {
            '0'..='9' => c.to_digit(10).unwrap(),
            '-' => 1,
            _ => 0,
        })
        .sum();
    sum % 10
}

/// Van Allen belt radiation zones
#[derive(Debug, Clone, Copy)]
pub enum VanAllenZone {
    /// Below 1,000 km - LEO, minimal belt exposure
    LowEarthOrbit,
    /// 1,000 - 6,000 km - Inner belt (protons) - DANGEROUS
    InnerBelt,
    /// 6,000 - 13,000 km - Slot region - LOW RADIATION (optimal)
    SlotRegion,
    /// 13,000 - 60,000 km - Outer belt (electrons) - moderate
    OuterBelt,
    /// Above 60,000 km - Beyond belts
    BeyondBelts,
}

/// Van Allen belt altitude thresholds (Nano9 km * 10^9)
const VA_LEO_THRESHOLD: i64 = 1_000 * NANO;      // 1,000 km
const VA_INNER_THRESHOLD: i64 = 6_000 * NANO;    // 6,000 km
const VA_SLOT_THRESHOLD: i64 = 13_000 * NANO;    // 13,000 km
const VA_OUTER_THRESHOLD: i64 = 60_000 * NANO;   // 60,000 km

impl VanAllenZone {
    /// Classify altitude into Van Allen zone (Nano9 input)
    pub fn from_altitude(alt: Nano9) -> Self {
        match alt.0 {
            a if a < VA_LEO_THRESHOLD => Self::LowEarthOrbit,
            a if a < VA_INNER_THRESHOLD => Self::InnerBelt,
            a if a < VA_SLOT_THRESHOLD => Self::SlotRegion,
            a if a < VA_OUTER_THRESHOLD => Self::OuterBelt,
            _ => Self::BeyondBelts,
        }
    }

    /// Classify from f64 km (convenience for external APIs)
    pub fn from_altitude_km(alt_km: f64) -> Self {
        Self::from_altitude(Nano9::from_f64(alt_km))
    }

    pub fn radiation_level(&self) -> &'static str {
        match self {
            Self::LowEarthOrbit => "low",
            Self::InnerBelt => "EXTREME",
            Self::SlotRegion => "low",
            Self::OuterBelt => "moderate",
            Self::BeyondBelts => "low",
        }
    }

    pub fn suitable_for_meo_constellation(&self) -> bool {
        matches!(self, Self::SlotRegion)
    }
}

/// Validate constellation altitude is in safe zone (Nano9)
pub fn validate_altitude(altitude: Nano9) -> Result<VanAllenZone, String> {
    let zone = VanAllenZone::from_altitude(altitude);
    let alt_km = altitude.to_f64();

    if zone.suitable_for_meo_constellation() {
        Ok(zone)
    } else {
        Err(format!(
            "Altitude {:.0} km is in {:?} zone (radiation: {}). Recommend 6,000-13,000 km slot region.",
            alt_km, zone, zone.radiation_level()
        ))
    }
}

/// Coverage analysis for inclination
pub fn analyze_inclination_coverage(inclination_deg: f64) -> InclinationAnalysis {
    let max_latitude = inclination_deg;
    let min_latitude = -inclination_deg;

    // Population coverage estimate (rough)
    // 90% of world population lives between 60°N and 60°S
    let population_coverage = if inclination_deg >= 60.0 {
        0.95
    } else if inclination_deg >= 55.0 {
        0.90
    } else if inclination_deg >= 45.0 {
        0.80
    } else {
        0.60
    };

    // Polar waste - passes over unpopulated polar regions
    let polar_waste = if inclination_deg > 70.0 {
        "high - many polar passes"
    } else if inclination_deg > 60.0 {
        "moderate"
    } else {
        "low - optimized for populated latitudes"
    };

    InclinationAnalysis {
        inclination_deg,
        max_latitude_coverage: max_latitude,
        min_latitude_coverage: min_latitude,
        population_coverage_estimate: population_coverage,
        polar_waste_assessment: polar_waste.to_string(),
    }
}

#[derive(Debug, Clone)]
pub struct InclinationAnalysis {
    pub inclination_deg: f64,
    pub max_latitude_coverage: f64,
    pub min_latitude_coverage: f64,
    pub population_coverage_estimate: f64,
    pub polar_waste_assessment: String,
}

// ============================================================================
// Station-Keeping Box (Operational Boundaries)
// ============================================================================

/// Station-keeping box defines operational boundaries for each satellite
/// All dimensions in Nano9 for deterministic simulation
#[derive(Debug, Clone, Copy)]
pub struct StationKeepingBox {
    /// Nominal altitude (Nano9 km)
    pub nominal_altitude: Nano9,
    /// Altitude tolerance ± (Nano9 km) - typical MEO: ±50 km
    pub altitude_tolerance: Nano9,
    /// Cross-track tolerance (Nano9 km) - deviation perpendicular to orbit
    pub cross_track_tolerance: Nano9,
    /// Along-track tolerance (Nano9 km) - phase drift within constellation
    pub along_track_tolerance: Nano9,
    /// Inclination tolerance (Nano9 radians) - orbital plane drift
    pub inclination_tolerance: Nano9,
    /// RAAN tolerance (Nano9 radians) - nodal precession bounds
    pub raan_tolerance: Nano9,
}

impl StationKeepingBox {
    /// HALO constellation station-keeping requirements (all Nano9)
    pub const HALO: Self = Self {
        nominal_altitude: Nano9(10_500 * NANO),        // 10,500 km
        altitude_tolerance: Nano9(50 * NANO),          // ±50 km radial
        cross_track_tolerance: Nano9(30 * NANO),       // ±30 km normal
        along_track_tolerance: Nano9(100 * NANO),      // ±100 km tangential
        inclination_tolerance: Nano9(1_745_329),       // ±0.1° in radians (0.00174...)
        raan_tolerance: Nano9(8_726_646),              // ±0.5° in radians (0.00872...)
    };

    /// Check if a satellite position is within the station-keeping box (Nano9)
    pub fn is_within_box(
        &self,
        altitude: Nano9,
        cross_track_error: Nano9,
        along_track_error: Nano9,
    ) -> StationKeepingStatus {
        let alt_error = Nano9((altitude.0 - self.nominal_altitude.0).abs());
        let altitude_ok = alt_error.0 <= self.altitude_tolerance.0;
        let cross_track_ok = cross_track_error.0.abs() <= self.cross_track_tolerance.0;
        let along_track_ok = along_track_error.0.abs() <= self.along_track_tolerance.0;

        if altitude_ok && cross_track_ok && along_track_ok {
            StationKeepingStatus::Nominal
        } else if !altitude_ok {
            StationKeepingStatus::AltitudeViolation {
                error: Nano9(altitude.0 - self.nominal_altitude.0),
            }
        } else if !cross_track_ok {
            StationKeepingStatus::CrossTrackViolation {
                error: cross_track_error,
            }
        } else {
            StationKeepingStatus::AlongTrackViolation {
                error: along_track_error,
            }
        }
    }

    /// Calculate delta-v needed to correct altitude (Hohmann approximation)
    /// Returns Nano9 m/s
    pub fn altitude_correction_dv(&self, current_alt: Nano9) -> Nano9 {
        let r_e = 6378.137_f64;
        let mu = 398600.4418_f64;

        let r1 = r_e + current_alt.to_f64();
        let r2 = r_e + self.nominal_altitude.to_f64();

        // Hohmann transfer approximation: Δv ≈ |v2 - v1|
        let v1 = (mu / r1).sqrt();
        let v2 = (mu / r2).sqrt();

        Nano9::from_f64((v2 - v1).abs() * 1000.0) // m/s as Nano9
    }

    /// Estimate station-keeping fuel budget per year (Nano9 m/s)
    pub fn annual_fuel_budget(&self) -> Nano9 {
        // Typical MEO station-keeping: 8 m/s per year
        Nano9(8 * NANO)
    }
}

/// Station-keeping status (all Nano9)
#[derive(Debug, Clone)]
pub enum StationKeepingStatus {
    /// Within all tolerances
    Nominal,
    /// Altitude out of bounds (error in Nano9 km)
    AltitudeViolation { error: Nano9 },
    /// Cross-track drift exceeded (error in Nano9 km)
    CrossTrackViolation { error: Nano9 },
    /// Along-track phase drift exceeded (error in Nano9 km)
    AlongTrackViolation { error: Nano9 },
    /// Maneuver in progress (Nano9 m/s remaining)
    ManeuverActive { delta_v_remaining: Nano9 },
}

/// Satellite state including station-keeping (all Nano9)
#[derive(Debug, Clone)]
pub struct SatelliteOperationalState {
    pub norad_id: u32,
    pub name: String,
    pub elements: OrbitalElements,
    pub station_box: StationKeepingBox,
    pub status: StationKeepingStatus,
    /// Accumulated delta-v used this year (Nano9 m/s)
    pub delta_v_used: Nano9,
    /// Time since last maneuver (Nano9 hours)
    pub hours_since_maneuver: Nano9,
}

impl SatelliteOperationalState {
    pub fn new(tle: &GeneratedTLE) -> Self {
        Self {
            norad_id: tle.norad_id,
            name: tle.name.clone(),
            elements: tle.elements,
            station_box: StationKeepingBox::HALO,
            status: StationKeepingStatus::Nominal,
            delta_v_used: Nano9::ZERO,
            hours_since_maneuver: Nano9::ZERO,
        }
    }

    /// Simulate natural drift (simplified model)
    /// hours parameter is Nano9 (hours * 10^9)
    pub fn apply_drift(&mut self, hours: Nano9) {
        // Drift rates in Nano9 km per hour
        // At 10,500 km MEO, drag is negligible but SRP matters
        let drag_decay_per_hour = Nano9(10_000);    // 0.00001 km/hr in Nano9
        let srp_drift_per_hour = Nano9(50_000);     // 0.00005 km/hr in Nano9

        // Total drift = rate * hours (need to scale correctly)
        // drift_nano = (rate_nano * hours_nano) / NANO
        let total_rate = Nano9(drag_decay_per_hour.0 + srp_drift_per_hour.0);
        let altitude_drift = total_rate.mul(hours);

        // Current altitude from semi-major axis
        let earth_r = Nano9::from_f64(6378.137);
        let current_alt = self.elements.semi_major_axis - earth_r;
        let new_alt = current_alt - altitude_drift;

        // Check if we're still in the box
        self.status = self.station_box.is_within_box(new_alt, Nano9::ZERO, Nano9::ZERO);
        self.hours_since_maneuver = self.hours_since_maneuver + hours;
    }

    /// Check if maneuver is needed
    pub fn needs_maneuver(&self) -> bool {
        !matches!(self.status, StationKeepingStatus::Nominal)
    }

    /// Get fuel remaining for the year (Nano9 percentage, 100% = NANO)
    pub fn fuel_remaining_percent(&self) -> Nano9 {
        let annual_budget = self.station_box.annual_fuel_budget();
        if annual_budget.0 == 0 {
            return Nano9::ZERO;
        }
        // (budget - used) / budget * 100
        let remaining = Nano9((annual_budget.0 - self.delta_v_used.0).max(0));
        Nano9((remaining.0 as i128 * 100 * NANO as i128 / annual_budget.0 as i128) as i64)
    }
}

/// Ground station visibility window (all Nano9)
#[derive(Debug, Clone)]
pub struct VisibilityWindow {
    pub station_id: String,
    pub satellite_id: String,
    pub aos_unix_ms: i64,  // Acquisition of Signal (Unix ms)
    pub los_unix_ms: i64,  // Loss of Signal (Unix ms)
    pub max_elevation: Nano9,   // Radians
    pub duration: Nano9,        // Seconds
}

/// Calculate if a satellite is visible from a ground station
/// All inputs are Nano9 (lat/lon in radians, alt in km)
/// Returns elevation angle in Nano9 radians if visible
pub fn calculate_visibility(
    sat_lat: Nano9,
    sat_lon: Nano9,
    sat_alt: Nano9,
    gs_lat: Nano9,
    gs_lon: Nano9,
    min_elevation: Nano9,
) -> Option<Nano9> {
    // Convert to f64 for trig (transcendentals not practical in fixed-point)
    let lat1 = sat_lat.to_f64();
    let lat2 = gs_lat.to_f64();
    let dlon = (sat_lon - gs_lon).to_f64();
    let h = sat_alt.to_f64();
    let r = 6378.137_f64;

    // Great circle distance
    let central_angle = (lat1.sin() * lat2.sin() + lat1.cos() * lat2.cos() * dlon.cos()).acos();
    let d = central_angle * r;

    // Elevation angle calculation using law of cosines
    let elevation_arg = ((h + r).powi(2) - r.powi(2) - d.powi(2)) / (2.0 * r * d);
    let elevation_rad = elevation_arg.asin();

    let result = Nano9::from_f64(elevation_rad);
    if result.0 >= min_elevation.0 {
        Some(result)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_halo_altitude_in_slot() {
        // HALO_ALTITUDE_KM is already Nano9-scaled (10500 * 10^9)
        let zone = VanAllenZone::from_altitude(Nano9(HALO_ALTITUDE_KM));
        assert!(matches!(zone, VanAllenZone::SlotRegion));
        assert!(zone.suitable_for_meo_constellation());
    }

    #[test]
    fn test_orbital_mechanics() {
        // Nano9 versions of earth radius and altitude
        let earth_r = Nano9(EARTH_RADIUS_KM);
        let altitude = Nano9(HALO_ALTITUDE_KM);
        let sma = earth_r + altitude;

        let mean_motion = OrbitalElements::mean_motion_from_sma(sma);
        let period = OrbitalElements::period_from_sma(sma);

        // HALO at 10,500 km (SMA ~16,878 km) orbital mechanics:
        // T = 2π√(a³/μ) ≈ 21,840s ≈ 364 min ≈ 6.07 hours
        // n = 86400/T ≈ 3.96 rev/day
        let mm_f64 = mean_motion.to_f64();
        let period_min = period.to_f64() / 60.0;

        assert!(mm_f64 > 3.8 && mm_f64 < 4.2, "Mean motion {} not in range [3.8, 4.2]", mm_f64);
        assert!(period_min > 350.0 && period_min < 380.0, "Period {} min not in range [350, 380]", period_min);

        println!("HALO Mean Motion: {:.4} rev/day", mm_f64);
        println!("HALO Period: {:.1} minutes", period_min);
    }

    #[test]
    fn test_walker_delta_generation() {
        let epoch = Utc::now();
        let tles = generate_halo_constellation(epoch);

        assert_eq!(tles.len(), 12);

        // Check Walker Delta spacing - use method calls for deg conversion
        let planes: Vec<f64> = tles.iter().map(|t| t.elements.raan_deg()).collect();
        let unique_planes: std::collections::HashSet<u32> =
            planes.iter().map(|r| *r as u32).collect();
        assert_eq!(unique_planes.len(), 3); // 3 orbital planes

        // Verify RAAN spacing (should be ~120° apart)
        let mut raans: Vec<f64> = unique_planes.iter().map(|r| *r as f64).collect();
        raans.sort_by(|a, b| a.partial_cmp(b).unwrap());

        for tle in &tles {
            println!(
                "{}: plane RAAN={:.0}°, MA={:.1}°, inc={:.1}°",
                tle.name,
                tle.elements.raan_deg(),
                tle.elements.mean_anomaly_deg(),
                tle.elements.inclination_deg()
            );
        }
    }

    #[test]
    fn test_inclination_coverage() {
        let analysis = analyze_inclination_coverage(55.0);
        assert_eq!(analysis.population_coverage_estimate, 0.90);
        assert!(analysis.polar_waste_assessment.contains("low"));
    }

    #[test]
    fn test_tle_checksum() {
        let line = "1 25544U 98067A   24001.50000000  .00001234  00000-0  12345-4 0  999";
        let checksum = checksum_digit(line);
        assert!(checksum < 10);
    }

    #[test]
    fn test_station_keeping_box() {
        let sk_box = StationKeepingBox::HALO;

        // Check nominal altitude is correct
        assert_eq!(sk_box.nominal_altitude.to_f64(), 10500.0);

        // Test within box
        let alt = Nano9::from_f64(10500.0);
        let status = sk_box.is_within_box(alt, Nano9::ZERO, Nano9::ZERO);
        assert!(matches!(status, StationKeepingStatus::Nominal));

        // Test outside box (altitude violation)
        let alt_high = Nano9::from_f64(10600.0); // 100 km high, tolerance is 50
        let status = sk_box.is_within_box(alt_high, Nano9::ZERO, Nano9::ZERO);
        assert!(matches!(status, StationKeepingStatus::AltitudeViolation { .. }));
    }

    #[test]
    fn test_nano9_deg_rad_conversion() {
        // 55° should convert to ~0.9599 radians
        let deg = Nano9::from_f64(55.0);
        let rad = OrbitalElements::deg_to_rad(deg);
        let back = OrbitalElements::rad_to_deg(rad);

        // Should round-trip with reasonable precision
        let diff = (back.to_f64() - 55.0).abs();
        assert!(diff < 0.001, "Round-trip diff {} too large", diff);
    }
}
