//! Inductive Entropy Harvester Module
//!
//! Space-based entropy generation using passive inductive coils.
//! 4 units per satellite × 12 satellites = 48 global entropy sources.
//!
//! Hardware: $700 COTS inductive units, ~38% efficiency
//! Output: ~512 kbps conditioned entropy per satellite
//! Annual: ~24 TB key material constellation-wide
//!
//! Key customers: Financial sector, internal CTAS operations

use serde::{Deserialize, Serialize};
use sx9_foundation_primitives::{Nano9, NANO};

// ============================================================================
// Constants
// ============================================================================

/// Base efficiency of inductive units (35-40%, using 38% nominal)
pub const BASE_EFFICIENCY: Nano9 = Nano9(380_000_000); // 0.38

/// Raw entropy rate per unit before conditioning (bits/sec)
pub const RAW_RATE_PER_UNIT: Nano9 = Nano9(340_000 * NANO); // 340 kbps

/// Units per satellite
pub const UNITS_PER_BIRD: u8 = 4;

/// Key pool capacity per satellite (bits)
pub const POOL_CAPACITY_BITS: Nano9 = Nano9(4_000_000 * NANO); // 4 Mbit

/// Cost per unit in cents (for reference, $700 = 70000 cents)
pub const UNIT_COST_CENTS: i64 = 70_000;

// ============================================================================
// Types
// ============================================================================

/// Coil axis orientation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CoilAxis {
    X,  // Roll axis - catches Y/Z field components
    Y,  // Pitch axis - catches X/Z field components
    Z,  // Yaw axis - catches X/Y field components
    Rf, // Broadband RF pickup - wideband EMI
}

impl CoilAxis {
    pub fn all() -> [CoilAxis; 4] {
        [CoilAxis::X, CoilAxis::Y, CoilAxis::Z, CoilAxis::Rf]
    }
}

/// Individual inductive entropy unit
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InductiveUnit {
    pub axis: CoilAxis,
    pub efficiency: Nano9,
    pub raw_rate_bps: Nano9,
    pub conditioned_rate_bps: Nano9,
    pub health: Nano9, // 0.0 - 1.0
}

impl InductiveUnit {
    pub fn new(axis: CoilAxis) -> Self {
        let conditioned = Nano9(
            (RAW_RATE_PER_UNIT.0 as i128 * BASE_EFFICIENCY.0 as i128 / NANO as i128) as i64
        );

        Self {
            axis,
            efficiency: BASE_EFFICIENCY,
            raw_rate_bps: RAW_RATE_PER_UNIT,
            conditioned_rate_bps: conditioned, // ~129 kbps per unit
            health: Nano9(NANO), // 1.0 = healthy
        }
    }

    /// Output rate in kbps (Nano9 scaled)
    pub fn output_kbps(&self) -> Nano9 {
        // bps / 1000 = kbps
        Nano9(self.conditioned_rate_bps.0 / 1000)
    }
}

/// Entropy bay - 4 inductive units per satellite
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntropyBay {
    pub satellite_id: String,
    pub norad_id: u32,
    pub units: [InductiveUnit; 4],
    /// Current entropy pool (bits, Nano9 scaled)
    pub pool_bits: Nano9,
    pub pool_capacity: Nano9,
    /// Lifetime keys generated
    pub keys_generated: u64,
    /// SAA-adjacent flag (delta, iota) - trivial gain adjustment
    pub saa_adjusted: bool,
}

impl EntropyBay {
    pub fn new(satellite_id: &str, norad_id: u32) -> Self {
        let saa_adjusted = matches!(satellite_id, "delta" | "iota");

        Self {
            satellite_id: satellite_id.to_string(),
            norad_id,
            units: [
                InductiveUnit::new(CoilAxis::X),
                InductiveUnit::new(CoilAxis::Y),
                InductiveUnit::new(CoilAxis::Z),
                InductiveUnit::new(CoilAxis::Rf),
            ],
            pool_bits: Nano9::ZERO,
            pool_capacity: POOL_CAPACITY_BITS,
            keys_generated: 0,
            saa_adjusted,
        }
    }

    /// Total conditioned output (bits/sec)
    pub fn total_rate_bps(&self) -> Nano9 {
        Nano9(self.units.iter().map(|u| u.conditioned_rate_bps.0).sum())
    }

    /// Output in kbps (Nano9 scaled)
    pub fn total_kbps(&self) -> Nano9 {
        Nano9(self.total_rate_bps().0 / 1000)
    }

    /// Accumulate entropy over time (seconds as Nano9)
    pub fn tick(&mut self, seconds: Nano9) {
        // bits = rate × time
        let new_bits = Nano9(
            (self.total_rate_bps().0 as i128 * seconds.0 as i128 / NANO as i128) as i64
        );
        self.pool_bits = Nano9((self.pool_bits.0 + new_bits.0).min(self.pool_capacity.0));
    }

    /// Pool fill ratio (0-1 as Nano9)
    pub fn pool_fill(&self) -> Nano9 {
        if self.pool_capacity.0 == 0 {
            return Nano9::ZERO;
        }
        Nano9((self.pool_bits.0 as i128 * NANO as i128 / self.pool_capacity.0 as i128) as i64)
    }

    /// Extract 256-bit key if available
    pub fn extract_key_256(&mut self) -> Option<KeyMaterial> {
        let key_bits = 256 * NANO;
        if self.pool_bits.0 >= key_bits {
            self.pool_bits = Nano9(self.pool_bits.0 - key_bits);
            self.keys_generated += 1;
            Some(KeyMaterial {
                key_id: format!("HALO-{}-{:012}", self.satellite_id, self.keys_generated),
                satellite_id: self.satellite_id.clone(),
                norad_id: self.norad_id,
                bits: 256,
                generated_at_ms: chrono::Utc::now().timestamp_millis(),
            })
        } else {
            None
        }
    }

    /// Bulk extract keys (returns count extracted)
    pub fn extract_keys_bulk(&mut self, max_keys: u64) -> Vec<KeyMaterial> {
        let mut keys = Vec::new();
        for _ in 0..max_keys {
            match self.extract_key_256() {
                Some(k) => keys.push(k),
                None => break,
            }
        }
        keys
    }
}

/// Key material with provenance (actual key bytes not stored here)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyMaterial {
    pub key_id: String,
    pub satellite_id: String,
    pub norad_id: u32,
    pub bits: u32,
    pub generated_at_ms: i64,
}

// ============================================================================
// Constellation-wide management
// ============================================================================

/// All entropy bays across constellation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstellationEntropy {
    pub bays: Vec<EntropyBay>,
}

impl ConstellationEntropy {
    /// Initialize entropy bays for all satellites
    pub fn new(satellites: &[(String, u32)]) -> Self {
        let bays = satellites
            .iter()
            .map(|(id, norad)| EntropyBay::new(id, *norad))
            .collect();
        Self { bays }
    }

    /// Create for standard HALO constellation
    pub fn halo_constellation() -> Self {
        let sats = [
            ("alpha", 60001), ("beta", 60002), ("gamma", 60003), ("delta", 60004),
            ("epsilon", 60005), ("zeta", 60006), ("eta", 60007), ("theta", 60008),
            ("iota", 60009), ("kappa", 60010), ("lambda", 60011), ("mu", 60012),
        ];
        Self::new(&sats.iter().map(|(s, n)| (s.to_string(), *n)).collect::<Vec<_>>())
    }

    /// Tick all bays
    pub fn tick_all(&mut self, seconds: Nano9) {
        for bay in &mut self.bays {
            bay.tick(seconds);
        }
    }

    /// Total constellation output (kbps as Nano9)
    pub fn total_kbps(&self) -> Nano9 {
        Nano9(self.bays.iter().map(|b| b.total_kbps().0).sum())
    }

    /// Total pool across constellation (bits)
    pub fn total_pool_bits(&self) -> i64 {
        self.bays.iter().map(|b| b.pool_bits.0).sum()
    }

    /// Total keys generated lifetime
    pub fn total_keys(&self) -> u64 {
        self.bays.iter().map(|b| b.keys_generated).sum()
    }

    /// Stats summary
    pub fn stats(&self) -> EntropyStats {
        let saa_count = self.bays.iter().filter(|b| b.saa_adjusted).count() as u8;
        let rate_kbps = self.total_kbps();

        // Annual bytes = kbps * 1000 / 8 * 86400 * 365
        // = kbps * 125 * 86400 * 365
        // = kbps * 3_942_000_000 bytes/year
        // rate_kbps is Nano9 scaled, so divide by NANO first
        let rate_kbps_raw = rate_kbps.0 / NANO; // ~6192 kbps
        let annual_bytes = rate_kbps_raw as u128 * 125 * 86400 * 365;
        let _annual_tb = (annual_bytes / 1_000_000_000_000) as u64; // ~24 TB

        // Annual 256-bit keys = rate_kbps * 1000 * 86400 * 365 / 256
        // = kbps * 31_536_000_000 / 256
        // = kbps * 123_187_500 keys/year
        let annual_keys = rate_kbps_raw as u128 * 123_187_500;

        EntropyStats {
            total_birds: self.bays.len() as u8,
            total_units: self.bays.len() as u8 * UNITS_PER_BIRD,
            saa_adjusted_birds: saa_count,
            total_rate_kbps: rate_kbps,
            total_pool_bits: Nano9(self.total_pool_bits()),
            total_keys_generated: self.total_keys(),
            annual_bytes_estimate: annual_bytes as u64,
            annual_256bit_keys: annual_keys as u64,
        }
    }
}

/// Constellation entropy statistics (all Nano9 or integer)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntropyStats {
    pub total_birds: u8,
    pub total_units: u8,
    pub saa_adjusted_birds: u8,
    /// Total rate (kbps as Nano9)
    pub total_rate_kbps: Nano9,
    /// Total pool (bits as Nano9)
    pub total_pool_bits: Nano9,
    pub total_keys_generated: u64,
    /// Annual bytes estimate
    pub annual_bytes_estimate: u64,
    /// Annual 256-bit keys
    pub annual_256bit_keys: u64,
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unit_output() {
        let unit = InductiveUnit::new(CoilAxis::X);
        // 340 kbps × 0.38 = ~129 kbps
        // output_kbps returns Nano9 scaled, so ~129 * NANO
        let kbps = unit.output_kbps();
        let kbps_raw = kbps.0 / NANO;
        assert!(kbps_raw > 125 && kbps_raw < 135, "Expected ~129 kbps, got {}", kbps_raw);
    }

    #[test]
    fn test_bay_output() {
        let bay = EntropyBay::new("alpha", 60001);
        // 4 units × ~129 kbps = ~516 kbps
        let kbps = bay.total_kbps();
        let kbps_raw = kbps.0 / NANO;
        assert!(kbps_raw > 500 && kbps_raw < 540, "Expected ~516 kbps, got {}", kbps_raw);
        assert!(!bay.saa_adjusted);
    }

    #[test]
    fn test_saa_flags() {
        let delta = EntropyBay::new("delta", 60004);
        let iota = EntropyBay::new("iota", 60009);
        let alpha = EntropyBay::new("alpha", 60001);

        assert!(delta.saa_adjusted, "delta should be SAA-adjusted");
        assert!(iota.saa_adjusted, "iota should be SAA-adjusted");
        assert!(!alpha.saa_adjusted, "alpha should NOT be SAA-adjusted");
    }

    #[test]
    fn test_key_extraction() {
        let mut bay = EntropyBay::new("alpha", 60001);

        // Empty pool - no key
        assert!(bay.extract_key_256().is_none());

        // Fill pool (simulate 10 seconds)
        bay.tick(Nano9(10 * NANO));

        // Should have enough for many keys now
        // 516 kbps × 10s = 5.16 Mbit, but capped at 4 Mbit pool
        assert!(bay.pool_bits.0 > 0);

        let key = bay.extract_key_256();
        assert!(key.is_some());
        assert_eq!(bay.keys_generated, 1);
    }

    #[test]
    fn test_constellation_stats() {
        let constellation = ConstellationEntropy::halo_constellation();
        let stats = constellation.stats();

        assert_eq!(stats.total_birds, 12);
        assert_eq!(stats.total_units, 48);
        assert_eq!(stats.saa_adjusted_birds, 2); // delta, iota

        // 12 birds × ~516 kbps = ~6.2 Mbps (~6192 kbps)
        let rate_kbps = stats.total_rate_kbps.0 / NANO;
        assert!(rate_kbps > 6000 && rate_kbps < 6500,
            "Expected ~6200 kbps, got {}", rate_kbps);

        // Annual estimate should be ~24 TB (24_000_000_000_000 bytes)
        let annual_tb = stats.annual_bytes_estimate / 1_000_000_000_000;
        assert!(annual_tb > 20 && annual_tb < 28,
            "Expected ~24 TB/year, got {}", annual_tb);

        // Annual keys should be ~763 billion
        let annual_keys_b = stats.annual_256bit_keys / 1_000_000_000;
        assert!(annual_keys_b > 700 && annual_keys_b < 850,
            "Expected ~763 billion keys/year, got {} billion", annual_keys_b);
    }
}

// ============================================================================
// Property-based Fuzz Tests
// ============================================================================

#[cfg(test)]
mod proptests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(10000))]

        // Fuzz: Pool never exceeds capacity
        #[test]
        fn fuzz_pool_capacity(
            tick_seconds in 0i64..3600, // Up to 1 hour
            num_ticks in 1usize..100,
        ) {
            let mut bay = EntropyBay::new("fuzz-sat", 99999);

            for _ in 0..num_ticks {
                bay.tick(Nano9(tick_seconds * NANO));
            }

            prop_assert!(bay.pool_bits.0 >= 0, "Pool negative: {}", bay.pool_bits.0);
            prop_assert!(bay.pool_bits.0 <= bay.pool_capacity.0,
                "Pool {} exceeds capacity {}", bay.pool_bits.0, bay.pool_capacity.0);
        }

        // Fuzz: Key extraction always decreases pool by exactly 256 bits
        #[test]
        fn fuzz_key_extraction_consistent(
            tick_seconds in 10i64..100,
        ) {
            let mut bay = EntropyBay::new("fuzz-sat", 99999);

            // Fill pool
            bay.tick(Nano9(tick_seconds * NANO));

            let pool_before = bay.pool_bits.0;

            if let Some(_key) = bay.extract_key_256() {
                let pool_after = bay.pool_bits.0;
                let consumed = pool_before - pool_after;

                // Should consume exactly 256 * NANO bits
                prop_assert_eq!(consumed, 256 * NANO,
                    "Key extraction consumed {} bits, expected {}", consumed, 256 * NANO);
            }
        }

        // Fuzz: Constellation total rate is sum of bays
        #[test]
        fn fuzz_constellation_rate_sum(
            num_sats in 1usize..20,
        ) {
            let sats: Vec<(String, u32)> = (0..num_sats)
                .map(|i| (format!("sat-{}", i), 90000 + i as u32))
                .collect();

            let constellation = ConstellationEntropy::new(&sats);

            let bay_sum: i64 = constellation.bays.iter()
                .map(|b| b.total_rate_bps().0)
                .sum();

            // Total should be sum (divided by 1000 for kbps, but let's check bps sum)
            let total_kbps = constellation.total_kbps();

            // total_kbps * 1000 should equal bay_sum
            prop_assert_eq!(total_kbps.0 * 1000, bay_sum,
                "Total kbps {} * 1000 != bay sum {}", total_kbps.0, bay_sum);
        }

        // Fuzz: Pool fill ratio always in [0, 1]
        #[test]
        fn fuzz_pool_fill_bounds(
            tick_seconds in 0i64..1000,
        ) {
            let mut bay = EntropyBay::new("fuzz-sat", 99999);
            bay.tick(Nano9(tick_seconds * NANO));

            let fill = bay.pool_fill();

            prop_assert!(fill.0 >= 0, "Fill ratio negative: {}", fill.0);
            prop_assert!(fill.0 <= NANO, "Fill ratio > 1: {}", fill.0);
        }

        // Fuzz: Bulk extraction extracts correct number of keys
        #[test]
        fn fuzz_bulk_extraction(
            tick_seconds in 10i64..100,
            max_keys in 1u64..1000,
        ) {
            let mut bay = EntropyBay::new("fuzz-sat", 99999);
            bay.tick(Nano9(tick_seconds * NANO));

            let pool_before = bay.pool_bits.0;
            let keys = bay.extract_keys_bulk(max_keys);

            let pool_after = bay.pool_bits.0;
            let consumed = pool_before - pool_after;

            // Should consume exactly keys.len() * 256 * NANO bits
            let expected_consumed = keys.len() as i64 * 256 * NANO;
            prop_assert_eq!(consumed, expected_consumed,
                "Consumed {} bits for {} keys, expected {}",
                consumed, keys.len(), expected_consumed);
        }

        // Fuzz: SAA flags set correctly
        #[test]
        fn fuzz_saa_flags(
            sat_name in "[a-z]{3,10}",
        ) {
            let bay = EntropyBay::new(&sat_name, 99999);

            let should_be_saa = sat_name == "delta" || sat_name == "iota";
            prop_assert_eq!(bay.saa_adjusted, should_be_saa,
                "SAA flag for '{}' should be {}", sat_name, should_be_saa);
        }

        // Fuzz: Inductive unit rate calculation
        #[test]
        fn fuzz_unit_rate_calculation(axis_idx in 0usize..4) {
            let axis = match axis_idx {
                0 => CoilAxis::X,
                1 => CoilAxis::Y,
                2 => CoilAxis::Z,
                _ => CoilAxis::Rf,
            };

            let unit = InductiveUnit::new(axis);

            // Conditioned rate should be raw_rate * efficiency
            let expected = (RAW_RATE_PER_UNIT.0 as i128 * BASE_EFFICIENCY.0 as i128 / NANO as i128) as i64;
            prop_assert_eq!(unit.conditioned_rate_bps.0, expected);

            // Health should be 1.0
            prop_assert_eq!(unit.health.0, NANO);
        }
    }
}
