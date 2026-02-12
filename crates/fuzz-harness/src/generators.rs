//! Nano9-native generators for property-based testing
//!
//! All generators produce Nano9 values directly - no floats involved.

use proptest::prelude::*;
use sx9_foundation_primitives::{Nano9, NANO};

// ============================================================================
// Core Nano9 Generators
// ============================================================================

/// Nano9 ratio in range [0, 1] (0 to NANO)
pub fn nano9_ratio() -> impl Strategy<Value = Nano9> {
    (0i64..=NANO).prop_map(Nano9)
}

/// Nano9 percentage in range [0, 100] as ratio
pub fn nano9_percent() -> impl Strategy<Value = Nano9> {
    (0i64..=NANO).prop_map(Nano9)
}

/// Nano9 in arbitrary range [min, max]
pub fn nano9_range(min: i64, max: i64) -> impl Strategy<Value = Nano9> {
    (min..=max).prop_map(Nano9)
}

/// Small positive Nano9 (0 to 1000 * NANO)
pub fn nano9_small() -> impl Strategy<Value = Nano9> {
    (0i64..=1000 * NANO).prop_map(Nano9)
}

/// Large positive Nano9 (0 to 1_000_000 * NANO)
pub fn nano9_large() -> impl Strategy<Value = Nano9> {
    (0i64..=1_000_000 * NANO).prop_map(Nano9)
}

/// Any valid Nano9 (full i64 range)
pub fn nano9_any() -> impl Strategy<Value = Nano9> {
    any::<i64>().prop_map(Nano9)
}

/// Positive Nano9 only
pub fn nano9_positive() -> impl Strategy<Value = Nano9> {
    (1i64..=i64::MAX).prop_map(Nano9)
}

/// Non-negative Nano9
pub fn nano9_non_negative() -> impl Strategy<Value = Nano9> {
    (0i64..=i64::MAX).prop_map(Nano9)
}

// ============================================================================
// Time Generators (all Nano9 scaled)
// ============================================================================

/// Milliseconds (0-1000ms as Nano9)
pub fn millis() -> impl Strategy<Value = Nano9> {
    (0i64..=1000 * NANO).prop_map(Nano9)
}

/// Seconds (0-3600s as Nano9)
pub fn seconds() -> impl Strategy<Value = Nano9> {
    (0i64..=3600 * NANO).prop_map(Nano9)
}

/// Minutes (0-60min as Nano9 seconds)
pub fn minutes() -> impl Strategy<Value = Nano9> {
    (0i64..=3600 * NANO).prop_map(Nano9)
}

/// Hours (0-24h as Nano9 seconds)
pub fn hours() -> impl Strategy<Value = Nano9> {
    (0i64..=86400 * NANO).prop_map(Nano9)
}

/// Days (0-365 days as Nano9 seconds)
pub fn days() -> impl Strategy<Value = Nano9> {
    (0i64..=31_536_000 * NANO).prop_map(Nano9)
}

// ============================================================================
// Orbital Domain Generators
// ============================================================================

/// Altitude in km (LEO to GEO range, as Nano9)
pub fn altitude_km() -> impl Strategy<Value = Nano9> {
    (200i64 * NANO..=42_000 * NANO).prop_map(Nano9)
}

/// MEO altitude range (2000-35786 km as Nano9)
pub fn altitude_meo() -> impl Strategy<Value = Nano9> {
    (2_000i64 * NANO..=35_786 * NANO).prop_map(Nano9)
}

/// HALO constellation altitude (~10,500 km as Nano9)
pub fn altitude_halo() -> impl Strategy<Value = Nano9> {
    (10_000i64 * NANO..=11_000 * NANO).prop_map(Nano9)
}

/// Inclination in degrees (0-180 as Nano9)
pub fn inclination_deg() -> impl Strategy<Value = Nano9> {
    (0i64..=180 * NANO).prop_map(Nano9)
}

/// Eccentricity (0-1 as Nano9 ratio)
pub fn eccentricity() -> impl Strategy<Value = Nano9> {
    (0i64..=NANO).prop_map(Nano9)
}

/// Near-circular eccentricity (0-0.01 as Nano9)
pub fn eccentricity_circular() -> impl Strategy<Value = Nano9> {
    (0i64..=10_000_000).prop_map(Nano9) // 0 to 0.01
}

/// RAAN (Right Ascension of Ascending Node, 0-360 deg as Nano9)
pub fn raan_deg() -> impl Strategy<Value = Nano9> {
    (0i64..=360 * NANO).prop_map(Nano9)
}

/// Argument of perigee (0-360 deg as Nano9)
pub fn arg_perigee_deg() -> impl Strategy<Value = Nano9> {
    (0i64..=360 * NANO).prop_map(Nano9)
}

/// Mean anomaly (0-360 deg as Nano9)
pub fn mean_anomaly_deg() -> impl Strategy<Value = Nano9> {
    (0i64..=360 * NANO).prop_map(Nano9)
}

/// Latitude (-90 to 90 deg as Nano9)
pub fn latitude_deg() -> impl Strategy<Value = Nano9> {
    (-90i64 * NANO..=90 * NANO).prop_map(Nano9)
}

/// Longitude (-180 to 180 deg as Nano9)
pub fn longitude_deg() -> impl Strategy<Value = Nano9> {
    (-180i64 * NANO..=180 * NANO).prop_map(Nano9)
}

/// Elevation angle (0-90 deg as Nano9)
pub fn elevation_deg() -> impl Strategy<Value = Nano9> {
    (0i64..=90 * NANO).prop_map(Nano9)
}

/// Azimuth (0-360 deg as Nano9)
pub fn azimuth_deg() -> impl Strategy<Value = Nano9> {
    (0i64..=360 * NANO).prop_map(Nano9)
}

// ============================================================================
// Communication/Link Generators
// ============================================================================

/// QoS value (0-1 as Nano9)
pub fn qos() -> impl Strategy<Value = Nano9> {
    nano9_ratio()
}

/// Bandwidth in Mbps (0-10000 as Nano9)
pub fn bandwidth_mbps() -> impl Strategy<Value = Nano9> {
    (0i64..=10_000 * NANO).prop_map(Nano9)
}

/// Bandwidth in Gbps (0-100 as Nano9)
pub fn bandwidth_gbps() -> impl Strategy<Value = Nano9> {
    (0i64..=100 * NANO).prop_map(Nano9)
}

/// Latency in ms (0-1000ms as Nano9)
pub fn latency_ms() -> impl Strategy<Value = Nano9> {
    (0i64..=1000 * NANO).prop_map(Nano9)
}

/// RTT in ms (0-2000ms as Nano9)
pub fn rtt_ms() -> impl Strategy<Value = Nano9> {
    (0i64..=2000 * NANO).prop_map(Nano9)
}

/// Jitter in ms (0-100ms as Nano9)
pub fn jitter_ms() -> impl Strategy<Value = Nano9> {
    (0i64..=100 * NANO).prop_map(Nano9)
}

/// Packet loss ratio (0-1 as Nano9)
pub fn packet_loss() -> impl Strategy<Value = Nano9> {
    nano9_ratio()
}

/// Bit error rate (0 to 1e-3 as Nano9, scaled)
pub fn ber() -> impl Strategy<Value = Nano9> {
    (0i64..=1_000_000).prop_map(Nano9) // 0 to 0.001
}

/// Signal strength in dBm (-150 to 0 as Nano9)
pub fn signal_dbm() -> impl Strategy<Value = Nano9> {
    (-150i64 * NANO..=0).prop_map(Nano9)
}

// ============================================================================
// Entropy/Key Generators
// ============================================================================

/// Entropy rate in bps (0-1M as Nano9)
pub fn entropy_rate_bps() -> impl Strategy<Value = Nano9> {
    (0i64..=1_000_000 * NANO).prop_map(Nano9)
}

/// Key bits (common sizes)
pub fn key_bits() -> impl Strategy<Value = u32> {
    prop_oneof![
        Just(128u32),
        Just(256u32),
        Just(384u32),
        Just(512u32),
    ]
}

/// Pool capacity in bits (as Nano9)
pub fn pool_capacity_bits() -> impl Strategy<Value = Nano9> {
    (1_000i64 * NANO..=100_000_000 * NANO).prop_map(Nano9)
}

// ============================================================================
// Satellite ID Generators
// ============================================================================

/// HALO constellation satellite name
pub fn halo_sat_name() -> impl Strategy<Value = &'static str> {
    prop_oneof![
        Just("alpha"),
        Just("beta"),
        Just("gamma"),
        Just("delta"),
        Just("epsilon"),
        Just("zeta"),
        Just("eta"),
        Just("theta"),
        Just("iota"),
        Just("kappa"),
        Just("lambda"),
        Just("mu"),
    ]
}

/// NORAD ID (5-digit range)
pub fn norad_id() -> impl Strategy<Value = u32> {
    (10000u32..99999u32)
}

/// Generic satellite name
pub fn sat_name() -> impl Strategy<Value = String> {
    "[A-Z]{1,3}-[0-9]{1,4}".prop_map(|s| s.to_string())
}

// ============================================================================
// Composite Generators
// ============================================================================

/// Complete orbital elements tuple
pub fn orbital_elements() -> impl Strategy<Value = (Nano9, Nano9, Nano9, Nano9, Nano9, Nano9)> {
    (
        altitude_km(),
        eccentricity_circular(),
        inclination_deg(),
        raan_deg(),
        arg_perigee_deg(),
        mean_anomaly_deg(),
    )
}

/// Ground station position (lat, lon, alt)
pub fn ground_station_pos() -> impl Strategy<Value = (Nano9, Nano9, Nano9)> {
    (
        latitude_deg(),
        longitude_deg(),
        (0i64..=5000 * NANO).prop_map(Nano9), // altitude 0-5km
    )
}

/// Link quality metrics (qos, latency, jitter, loss)
pub fn link_quality() -> impl Strategy<Value = (Nano9, Nano9, Nano9, Nano9)> {
    (qos(), latency_ms(), jitter_ms(), packet_loss())
}

// ============================================================================
// Utility Functions
// ============================================================================

/// Clamp Nano9 to valid ratio range [0, 1]
pub fn clamp_ratio(n: Nano9) -> Nano9 {
    Nano9(n.0.clamp(0, NANO))
}

/// Clamp Nano9 to non-negative
pub fn clamp_positive(n: Nano9) -> Nano9 {
    Nano9(n.0.max(0))
}

#[cfg(test)]
mod tests {
    use super::*;

    proptest! {
        #[test]
        fn test_nano9_ratio_bounds(v in nano9_ratio()) {
            prop_assert!(v.0 >= 0);
            prop_assert!(v.0 <= NANO);
        }

        #[test]
        fn test_altitude_bounds(v in altitude_km()) {
            prop_assert!(v.0 >= 200 * NANO);
            prop_assert!(v.0 <= 42_000 * NANO);
        }

        #[test]
        fn test_latitude_bounds(v in latitude_deg()) {
            prop_assert!(v.0 >= -90 * NANO);
            prop_assert!(v.0 <= 90 * NANO);
        }
    }
}
