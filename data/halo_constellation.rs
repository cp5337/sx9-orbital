//! HALO Constellation ISL Network - Auto-generated
//! Generated: 2026-01-27T22:41:39.761195

/// Number of satellites in HALO constellation
pub const NUM_SATELLITES: usize = 12;

/// Number of ISL links
pub const NUM_ISL_LINKS: usize = 24;

/// Satellite IDs indexed by (plane-1)*4 + (slot-1)
pub const SATELLITE_IDS: [&str; NUM_SATELLITES] = [
    "HALO-1-1",
    "HALO-1-2",
    "HALO-1-3",
    "HALO-1-4",
    "HALO-2-1",
    "HALO-2-2",
    "HALO-2-3",
    "HALO-2-4",
    "HALO-3-1",
    "HALO-3-2",
    "HALO-3-3",
    "HALO-3-4",
];

/// ISL edges as (source_idx, target_idx, latency_ms, capacity_gbps, failure_prob_per_hour)
pub const ISL_EDGES: [(usize, usize, f64, f64, f64); NUM_ISL_LINKS] = [
    (0, 1, 35.0, 100.0, 0.0001),  // HALO-1-1 -> HALO-1-2
    (0, 4, 45.0, 80.0, 0.0005),  // HALO-1-1 -> HALO-2-1
    (1, 2, 35.0, 100.0, 0.0001),  // HALO-1-2 -> HALO-1-3
    (1, 5, 45.0, 80.0, 0.0005),  // HALO-1-2 -> HALO-2-2
    (2, 3, 35.0, 100.0, 0.0001),  // HALO-1-3 -> HALO-1-4
    (2, 6, 45.0, 80.0, 0.0005),  // HALO-1-3 -> HALO-2-3
    (3, 0, 35.0, 100.0, 0.0001),  // HALO-1-4 -> HALO-1-1
    (3, 7, 45.0, 80.0, 0.0005),  // HALO-1-4 -> HALO-2-4
    (4, 5, 35.0, 100.0, 0.0001),  // HALO-2-1 -> HALO-2-2
    (4, 8, 45.0, 80.0, 0.0005),  // HALO-2-1 -> HALO-3-1
    (5, 6, 35.0, 100.0, 0.0001),  // HALO-2-2 -> HALO-2-3
    (5, 9, 45.0, 80.0, 0.0005),  // HALO-2-2 -> HALO-3-2
    (6, 7, 35.0, 100.0, 0.0001),  // HALO-2-3 -> HALO-2-4
    (6, 10, 45.0, 80.0, 0.0005),  // HALO-2-3 -> HALO-3-3
    (7, 4, 35.0, 100.0, 0.0001),  // HALO-2-4 -> HALO-2-1
    (7, 11, 45.0, 80.0, 0.0005),  // HALO-2-4 -> HALO-3-4
    (8, 9, 35.0, 100.0, 0.0001),  // HALO-3-1 -> HALO-3-2
    (8, 0, 45.0, 80.0, 0.0005),  // HALO-3-1 -> HALO-1-1
    (9, 10, 35.0, 100.0, 0.0001),  // HALO-3-2 -> HALO-3-3
    (9, 1, 45.0, 80.0, 0.0005),  // HALO-3-2 -> HALO-1-2
    (10, 11, 35.0, 100.0, 0.0001),  // HALO-3-3 -> HALO-3-4
    (10, 2, 45.0, 80.0, 0.0005),  // HALO-3-3 -> HALO-1-3
    (11, 8, 35.0, 100.0, 0.0001),  // HALO-3-4 -> HALO-3-1
    (11, 3, 45.0, 80.0, 0.0005),  // HALO-3-4 -> HALO-1-4
];

/// Monte Carlo simulation parameters
pub mod mc_params {
    pub const SATELLITE_FAILURE_PROB_PER_YEAR: f64 = 0.02;
    pub const SATELLITE_MTBF_HOURS: f64 = 43800.0;
    pub const SOLAR_STORM_PROBABILITY: f64 = 0.001;
    pub const SOLAR_STORM_FAILURE_MULTIPLIER: f64 = 10.0;
}