//! Satellite Location Side Calculations
//!
//! Provides auxiliary calculations for satellite position tracking:
//! - Geodetic to ECEF conversion
//! - ECEF to ECI conversion
//! - Ground station visibility
//! - Slant range and look angles
//! - Doppler shift estimation
//!
//! All calculations use Nano9 fixed-point for determinism

use sx9_foundation_primitives::{Nano9, NANO};
use std::f64::consts::PI;

/// Earth constants
const EARTH_RADIUS_KM: f64 = 6378.137;
const EARTH_FLATTENING: f64 = 1.0 / 298.257223563;
const EARTH_ROTATION_RATE_RAD_S: f64 = 7.2921159e-5; // rad/s

/// Geodetic position (latitude, longitude, altitude)
#[derive(Debug, Clone, Copy)]
pub struct GeodeticPosition {
    /// Latitude in radians (Nano9)
    pub latitude: Nano9,
    /// Longitude in radians (Nano9)
    pub longitude: Nano9,
    /// Altitude above ellipsoid in km (Nano9)
    pub altitude: Nano9,
}

/// ECEF (Earth-Centered Earth-Fixed) position
#[derive(Debug, Clone, Copy)]
pub struct EcefPosition {
    /// X coordinate in km (Nano9)
    pub x: Nano9,
    /// Y coordinate in km (Nano9)
    pub y: Nano9,
    /// Z coordinate in km (Nano9)
    pub z: Nano9,
}

/// ECI (Earth-Centered Inertial) position
#[derive(Debug, Clone, Copy)]
pub struct EciPosition {
    /// X coordinate in km (Nano9)
    pub x: Nano9,
    /// Y coordinate in km (Nano9)
    pub y: Nano9,
    /// Z coordinate in km (Nano9)
    pub z: Nano9,
}

/// Look angles from ground station to satellite
#[derive(Debug, Clone, Copy)]
pub struct LookAngles {
    /// Azimuth in radians (Nano9) - 0 = North, π/2 = East
    pub azimuth: Nano9,
    /// Elevation in radians (Nano9) - 0 = horizon, π/2 = zenith
    pub elevation: Nano9,
    /// Slant range in km (Nano9)
    pub range: Nano9,
    /// Range rate in km/s (Nano9) - for Doppler
    pub range_rate: Nano9,
}

/// Convert geodetic position to ECEF
pub fn geodetic_to_ecef(pos: GeodeticPosition) -> EcefPosition {
    let lat = pos.latitude.to_f64();
    let lon = pos.longitude.to_f64();
    let alt = pos.altitude.to_f64();
    
    // WGS84 ellipsoid parameters
    let a = EARTH_RADIUS_KM;
    let e2 = 2.0 * EARTH_FLATTENING - EARTH_FLATTENING * EARTH_FLATTENING;
    
    // Radius of curvature in prime vertical
    let n = a / (1.0 - e2 * lat.sin().powi(2)).sqrt();
    
    // ECEF coordinates
    let x = (n + alt) * lat.cos() * lon.cos();
    let y = (n + alt) * lat.cos() * lon.sin();
    let z = (n * (1.0 - e2) + alt) * lat.sin();
    
    EcefPosition {
        x: Nano9::from_f64(x),
        y: Nano9::from_f64(y),
        z: Nano9::from_f64(z),
    }
}

/// Convert ECEF to ECI (simplified - assumes GMST = 0 for epoch)
/// For accurate conversion, use actual GMST from epoch time
pub fn ecef_to_eci(ecef: EcefPosition, gmst_rad: f64) -> EciPosition {
    let x_ecef = ecef.x.to_f64();
    let y_ecef = ecef.y.to_f64();
    let z_ecef = ecef.z.to_f64();
    
    // Rotation matrix around Z-axis by GMST
    let cos_gmst = gmst_rad.cos();
    let sin_gmst = gmst_rad.sin();
    
    let x_eci = cos_gmst * x_ecef - sin_gmst * y_ecef;
    let y_eci = sin_gmst * x_ecef + cos_gmst * y_ecef;
    let z_eci = z_ecef;
    
    EciPosition {
        x: Nano9::from_f64(x_eci),
        y: Nano9::from_f64(y_eci),
        z: Nano9::from_f64(z_eci),
    }
}

/// Calculate look angles from ground station to satellite
pub fn calculate_look_angles(
    gs_geodetic: GeodeticPosition,
    sat_eci: EciPosition,
    gmst_rad: f64,
) -> LookAngles {
    // Convert ground station to ECEF, then to ECI
    let gs_ecef = geodetic_to_ecef(gs_geodetic);
    let gs_eci = ecef_to_eci(gs_ecef, gmst_rad);
    
    // Range vector (satellite - ground station) in ECI
    let dx = sat_eci.x.to_f64() - gs_eci.x.to_f64();
    let dy = sat_eci.y.to_f64() - gs_eci.y.to_f64();
    let dz = sat_eci.z.to_f64() - gs_eci.z.to_f64();
    
    // Slant range
    let range = (dx * dx + dy * dy + dz * dz).sqrt();
    
    // Convert range vector to topocentric (SEZ) coordinates
    let lat = gs_geodetic.latitude.to_f64();
    let lon = gs_geodetic.longitude.to_f64();
    
    // Rotation to SEZ (South-East-Zenith)
    let sin_lat = lat.sin();
    let cos_lat = lat.cos();
    let sin_lon = lon.sin();
    let cos_lon = lon.cos();
    
    let s = sin_lat * cos_lon * dx + sin_lat * sin_lon * dy - cos_lat * dz;
    let e = -sin_lon * dx + cos_lon * dy;
    let z = cos_lat * cos_lon * dx + cos_lat * sin_lon * dy + sin_lat * dz;
    
    // Azimuth (from North, clockwise)
    let azimuth = (-e).atan2(s);
    let azimuth_normalized = if azimuth < 0.0 { azimuth + 2.0 * PI } else { azimuth };
    
    // Elevation (from horizon)
    let elevation = (z / range).asin();
    
    LookAngles {
        azimuth: Nano9::from_f64(azimuth_normalized),
        elevation: Nano9::from_f64(elevation),
        range: Nano9::from_f64(range),
        range_rate: Nano9::ZERO, // Would need velocity for Doppler
    }
}

/// Calculate Doppler shift for FSO link
/// Returns frequency shift in Hz (Nano9)
pub fn calculate_doppler_shift(
    range_rate_km_s: Nano9,
    carrier_freq_hz: f64,
) -> Nano9 {
    let c = 299792.458; // Speed of light in km/s
    let v_r = range_rate_km_s.to_f64();
    
    // Doppler shift: Δf = -f₀ * (v_r / c)
    let doppler_hz = -carrier_freq_hz * (v_r / c);
    
    Nano9::from_f64(doppler_hz)
}

/// Check if satellite is visible from ground station
/// Returns true if elevation > min_elevation
pub fn is_visible(
    gs_geodetic: GeodeticPosition,
    sat_eci: EciPosition,
    gmst_rad: f64,
    min_elevation_rad: Nano9,
) -> bool {
    let look_angles = calculate_look_angles(gs_geodetic, sat_eci, gmst_rad);
    look_angles.elevation.0 >= min_elevation_rad.0
}

/// Calculate GMST (Greenwich Mean Sidereal Time) from Unix timestamp
/// Returns GMST in radians
pub fn unix_to_gmst(unix_timestamp: i64) -> f64 {
    // Julian Date from Unix timestamp
    let jd = (unix_timestamp as f64 / 86400.0) + 2440587.5;
    
    // Julian centuries from J2000.0
    let t = (jd - 2451545.0) / 36525.0;
    
    // GMST in seconds
    let gmst_sec = 67310.54841
        + (876600.0 * 3600.0 + 8640184.812866) * t
        + 0.093104 * t * t
        - 6.2e-6 * t * t * t;
    
    // Convert to radians, normalize to [0, 2π]
    let gmst_rad = (gmst_sec / 240.0) * (PI / 180.0);
    gmst_rad % (2.0 * PI)
}

/// Station-keeping ΔV budget tracker
#[derive(Debug, Clone)]
pub struct StationKeepingBudget {
    /// Annual ΔV budget in m/s (Nano9)
    pub annual_budget: Nano9,
    /// ΔV used this year in m/s (Nano9)
    pub delta_v_used: Nano9,
    /// Number of maneuvers this year
    pub maneuver_count: u32,
    /// Last maneuver timestamp (Unix seconds)
    pub last_maneuver_time: i64,
}

impl StationKeepingBudget {
    /// HALO constellation annual budget: 8 m/s per satellite
    pub const HALO_ANNUAL_BUDGET: Nano9 = Nano9(8 * NANO);
    
    /// Create new budget tracker
    pub fn new() -> Self {
        Self {
            annual_budget: Self::HALO_ANNUAL_BUDGET,
            delta_v_used: Nano9::ZERO,
            maneuver_count: 0,
            last_maneuver_time: 0,
        }
    }
    
    /// Record a maneuver
    pub fn record_maneuver(&mut self, delta_v: Nano9, timestamp: i64) {
        self.delta_v_used = self.delta_v_used + delta_v;
        self.maneuver_count += 1;
        self.last_maneuver_time = timestamp;
    }
    
    /// Get remaining budget as percentage (0-100)
    pub fn remaining_percent(&self) -> Nano9 {
        if self.annual_budget.0 == 0 {
            return Nano9::ZERO;
        }
        let remaining = Nano9((self.annual_budget.0 - self.delta_v_used.0).max(0));
        Nano9((remaining.0 as i128 * 100 * NANO as i128 / self.annual_budget.0 as i128) as i64)
    }
    
    /// Check if budget is critically low (< 20%)
    pub fn is_critical(&self) -> bool {
        self.remaining_percent().0 < 20 * NANO
    }
    
    /// Reset budget for new year
    pub fn reset_annual(&mut self) {
        self.delta_v_used = Nano9::ZERO;
        self.maneuver_count = 0;
    }
}

impl Default for StationKeepingBudget {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_geodetic_to_ecef() {
        // Test with equator, prime meridian
        let pos = GeodeticPosition {
            latitude: Nano9::ZERO,
            longitude: Nano9::ZERO,
            altitude: Nano9::ZERO,
        };
        
        let ecef = geodetic_to_ecef(pos);
        
        // Should be approximately (6378.137, 0, 0)
        assert!((ecef.x.to_f64() - EARTH_RADIUS_KM).abs() < 0.1);
        assert!(ecef.y.to_f64().abs() < 0.1);
        assert!(ecef.z.to_f64().abs() < 0.1);
    }
    
    #[test]
    fn test_station_keeping_budget() {
        let mut budget = StationKeepingBudget::new();
        
        // Record a 2 m/s maneuver
        budget.record_maneuver(Nano9::from_f64(2.0), 1000);
        
        assert_eq!(budget.maneuver_count, 1);
        assert_eq!(budget.delta_v_used.to_f64(), 2.0);
        
        // Should have 75% remaining (6/8)
        let remaining = budget.remaining_percent().to_f64();
        assert!((remaining - 75.0).abs() < 1.0);
    }
    
    #[test]
    fn test_gmst_calculation() {
        // Test GMST calculation for a known time
        let unix_time = 1707849600; // 2024-02-13 16:00:00 UTC
        let gmst = unix_to_gmst(unix_time);
        
        // GMST should be between 0 and 2π
        assert!(gmst >= 0.0 && gmst < 2.0 * PI);
    }
}
