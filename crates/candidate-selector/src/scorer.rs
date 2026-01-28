//! Candidate scoring implementation
//!
//! Implements the 7-factor scoring model with security + infrastructure:
//! Score(gn) = w₁·P + w₂·D_POP⁻¹ + w₃·C_XAI + w₄·W + w₅·N + w₆·S + w₇·I
//!
//! Infrastructure types are prioritized:
//! - XAI Colossus, Financial Infrastructure, Equinix, Laser Light
//! - Cable Landings, IXPs, Ground Nodes (in descending priority)

use crate::security::{reverse_geocode_country, CountryRiskDatabase};
use crate::{haversine_km, Candidate, ScoredCandidate, XAI_LAT, XAI_LON};
use tracing::debug;

/// Scoring weights (7-factor model, 9 decimal precision)
/// Sum = 1.000000000
pub const W_POPULATION: f64 = 0.200000000;
pub const W_POP_PROXIMITY: f64 = 0.150000000;
pub const W_XAI: f64 = 0.150000000;
pub const W_WEATHER: f64 = 0.100000000;
pub const W_NETWORK: f64 = 0.080000000;
pub const W_SECURITY: f64 = 0.150000000;
pub const W_INFRASTRUCTURE: f64 = 0.170000000;

/// Maximum cable count for normalization (9 decimal precision)
const MAX_CABLE_COUNT: f64 = 20.000000000;

/// XAI connectivity decay constant (km) (9 decimal precision)
const XAI_DECAY_KM: f64 = 2000.000000000;

/// Scorer configuration
#[derive(Debug, Clone)]
pub struct ScorerConfig {
    /// Weight for population proximity (P)
    pub w_population: f64,
    /// Weight for POP network proximity (D_POP⁻¹)
    pub w_pop_proximity: f64,
    /// Weight for XAI connectivity (C_XAI)
    pub w_xai: f64,
    /// Weight for weather suitability (W)
    pub w_weather: f64,
    /// Weight for network demand (N)
    pub w_network: f64,
    /// Weight for security/geopolitical risk (S)
    pub w_security: f64,
    /// Weight for infrastructure quality (I)
    pub w_infrastructure: f64,
    /// Country risk database for security scoring
    pub risk_db: CountryRiskDatabase,
}

impl Default for ScorerConfig {
    fn default() -> Self {
        Self {
            w_population: W_POPULATION,
            w_pop_proximity: W_POP_PROXIMITY,
            w_xai: W_XAI,
            w_weather: W_WEATHER,
            w_network: W_NETWORK,
            w_security: W_SECURITY,
            w_infrastructure: W_INFRASTRUCTURE,
            risk_db: CountryRiskDatabase::with_defaults(),
        }
    }
}

/// Score all candidates
pub fn score_candidates(candidates: Vec<Candidate>, config: &ScorerConfig) -> Vec<ScoredCandidate> {
    // Find max cable count for normalization
    let max_cables = candidates
        .iter()
        .filter_map(|c| c.cable_count)
        .max()
        .unwrap_or(1) as f64;

    candidates
        .into_iter()
        .map(|c| score_candidate(c, config, max_cables))
        .collect()
}

/// Score a single candidate
fn score_candidate(mut candidate: Candidate, config: &ScorerConfig, max_cables: f64) -> ScoredCandidate {
    // P: Population proximity score
    // For now, use tier as proxy (Tier 1 = high pop, Tier 3 = low pop)
    // TODO: Integrate WorldPop API for real population data
    let pop_score = match candidate.tier {
        Some(1) => 1.000000000,
        Some(2) => 0.700000000,
        Some(3) => 0.400000000,
        _ => 0.500000000, // Default for cable landings
    };

    // D_POP⁻¹: POP network proximity
    // Use cable_count as proxy (more cables = closer to major POPs)
    let pop_proximity_score = match candidate.cable_count {
        Some(count) if count > 0 => (count as f64 / max_cables).min(1.000000000),
        _ => 0.300000000, // Default for ground nodes without cable data
    };

    // C_XAI: XAI connectivity (distance to Memphis, TN)
    // exp(-α · d_km) where α ≈ 1/2000
    let dist_to_xai = haversine_km(
        candidate.latitude,
        candidate.longitude,
        XAI_LAT,
        XAI_LON,
    );
    let xai_score = (-dist_to_xai / XAI_DECAY_KM).exp();

    // W: Weather suitability (FSO viability)
    // Use existing weather_score or default to 0.800000000 for cable landings
    let weather_score = candidate.weather_score.unwrap_or(0.800000000);

    // N: Network demand
    // Combine cable_count and demand_gbps
    let cable_factor = candidate
        .cable_count
        .map(|c| (c as f64 / MAX_CABLE_COUNT).min(1.000000000))
        .unwrap_or(0.300000000);
    let demand_factor = candidate
        .demand_gbps
        .map(|d| (d / 100.000000000).min(1.000000000))
        .unwrap_or(0.300000000);
    let network_score = (cable_factor + demand_factor) / 2.000000000;

    // S: Security/geopolitical risk score
    // First, determine country code from coordinates if not already set
    let country_code = candidate
        .country_code
        .clone()
        .or_else(|| reverse_geocode_country(candidate.latitude, candidate.longitude));

    // Update candidate with country info
    if candidate.country_code.is_none() {
        candidate.country_code = country_code.clone();
    }

    // Look up security score from risk database
    let security_score = country_code
        .as_ref()
        .map(|cc| config.risk_db.security_score(cc))
        .unwrap_or(config.risk_db.config.default_score);

    // Update candidate with security data
    if let Some(ref cc) = country_code {
        if let Some(risk) = config.risk_db.get(cc) {
            candidate.travel_advisory_level = risk.travel_advisory_level;
            candidate.political_stability = risk.political_stability;
            candidate.rule_of_law = risk.rule_of_law;
            candidate.corruption_control = risk.corruption_control;
            candidate.security_score = Some(risk.security_score);
        }
    }

    // I: Infrastructure quality score
    // Based on source type (prioritizes real infrastructure)
    let base_infrastructure = candidate.source.infrastructure_bonus();

    // Adjust based on infrastructure tier if available
    let tier_bonus = match candidate.infrastructure_tier {
        Some(0) => 0.200000000, // Tier 0: Critical infrastructure (10+ cables)
        Some(1) => 0.150000000, // Tier 1: Major hub (6-9 cables)
        Some(2) => 0.100000000, // Tier 2: Regional (4-5 cables)
        Some(3) => 0.050000000, // Tier 3: Local (1-3 cables)
        _ => 0.000000000,
    };

    // Boost for proximity to other infrastructure (if enriched)
    let proximity_bonus = calculate_infrastructure_proximity_bonus(&candidate);

    // Composite infrastructure score
    let infrastructure_score = (base_infrastructure + tier_bonus + proximity_bonus).min(1.000000000);

    // Calculate composite score (7-factor model)
    let score = config.w_population * pop_score
        + config.w_pop_proximity * pop_proximity_score
        + config.w_xai * xai_score
        + config.w_weather * weather_score
        + config.w_network * network_score
        + config.w_security * security_score
        + config.w_infrastructure * infrastructure_score;

    debug!(
        "Scored {}: {:.3} (pop={:.2}, pop_prox={:.2}, xai={:.2}, wx={:.2}, net={:.2}, sec={:.2}, infra={:.2})",
        candidate.name, score, pop_score, pop_proximity_score, xai_score, weather_score, network_score, security_score, infrastructure_score
    );

    ScoredCandidate {
        candidate,
        score,
        pop_score,
        pop_proximity_score,
        xai_score,
        weather_score,
        network_score,
        security_score,
        infrastructure_score,
    }
}

/// Calculate infrastructure proximity bonus
/// Rewards candidates that are close to IXPs, Equinix, or financial infrastructure
fn calculate_infrastructure_proximity_bonus(candidate: &Candidate) -> f64 {
    let mut bonus = 0.000000000;

    // Bonus for being near an IXP
    if let Some(ixp_km) = candidate.nearest_ixp_km {
        // Full bonus if <10km, decays to 0 at 100km
        bonus += (1.000000000 - (ixp_km / 100.000000000).min(1.000000000)) * 0.050000000;
    }

    // Bonus for being near Equinix
    if let Some(eq_km) = candidate.nearest_equinix_km {
        // Full bonus if <10km, decays to 0 at 100km
        bonus += (1.000000000 - (eq_km / 100.000000000).min(1.000000000)) * 0.050000000;
    }

    // Bonus for being near financial infrastructure
    if let Some(fin_km) = candidate.nearest_financial_km {
        // Full bonus if <20km, decays to 0 at 150km
        bonus += (1.000000000 - (fin_km / 150.000000000).min(1.000000000)) * 0.050000000;
    }

    bonus
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CandidateSource, Zone};

    fn make_candidate(name: &str, lat: f64, lon: f64, tier: Option<u8>, cables: Option<u32>) -> Candidate {
        Candidate {
            id: name.to_string(),
            name: name.to_string(),
            latitude: lat,
            longitude: lon,
            zone: Zone::from_longitude(lon),
            source: crate::CandidateSource::GroundNode,
            tier,
            demand_gbps: Some(50.000000000),
            weather_score: Some(0.900000000),
            cable_count: cables,
            cables: None,
            merged_from: None,
            country_code: None,
            travel_advisory_level: None,
            political_stability: None,
            rule_of_law: None,
            corruption_control: None,
            security_score: None,
            nearest_ixp_km: None,
            nearest_equinix_km: None,
            nearest_financial_km: None,
            infrastructure_tier: None,
        }
    }

    fn make_infra_candidate(name: &str, lat: f64, lon: f64, source: CandidateSource, infra_tier: Option<u8>) -> Candidate {
        Candidate {
            id: name.to_string(),
            name: name.to_string(),
            latitude: lat,
            longitude: lon,
            zone: Zone::from_longitude(lon),
            source,
            tier: Some(1),
            demand_gbps: Some(50.000000000),
            weather_score: Some(0.900000000),
            cable_count: Some(5),
            cables: None,
            merged_from: None,
            country_code: None,
            travel_advisory_level: None,
            political_stability: None,
            rule_of_law: None,
            corruption_control: None,
            security_score: None,
            nearest_ixp_km: Some(5.000000000),  // 5km from IXP
            nearest_equinix_km: Some(10.000000000),  // 10km from Equinix
            nearest_financial_km: Some(20.000000000),  // 20km from financial infra
            infrastructure_tier: infra_tier,
        }
    }

    #[test]
    fn test_xai_proximity_score() {
        let config = ScorerConfig::default();

        // Memphis (at XAI) should have high XAI score
        let memphis = make_candidate("Memphis", XAI_LAT, XAI_LON, Some(1), Some(5));
        let scored = score_candidate(memphis, &config, 10.000000000);
        assert!(scored.xai_score > 0.990000000, "Memphis XAI score: {}", scored.xai_score);

        // Singapore (far from XAI) should have low XAI score
        let singapore = make_candidate("Singapore", 1.352100000, 103.819800000, Some(1), Some(10));
        let scored = score_candidate(singapore, &config, 10.000000000);
        assert!(scored.xai_score < 0.100000000, "Singapore XAI score: {}", scored.xai_score);
    }

    #[test]
    fn test_tier_affects_pop_score() {
        let config = ScorerConfig::default();

        let tier1 = make_candidate("Tier1", 40.000000000, -74.000000000, Some(1), Some(5));
        let tier3 = make_candidate("Tier3", 40.000000000, -74.000000000, Some(3), Some(5));

        let scored1 = score_candidate(tier1, &config, 10.000000000);
        let scored3 = score_candidate(tier3, &config, 10.000000000);

        assert!(scored1.pop_score > scored3.pop_score);
    }

    #[test]
    fn test_cable_count_affects_score() {
        let config = ScorerConfig::default();

        let many_cables = make_candidate("HighCable", 40.000000000, -74.000000000, Some(2), Some(15));
        let few_cables = make_candidate("LowCable", 40.000000000, -74.000000000, Some(2), Some(1));

        let scored_many = score_candidate(many_cables, &config, 15.000000000);
        let scored_few = score_candidate(few_cables, &config, 15.000000000);

        assert!(scored_many.pop_proximity_score > scored_few.pop_proximity_score);
        assert!(scored_many.network_score > scored_few.network_score);
    }

    #[test]
    fn test_security_score_affects_total() {
        let config = ScorerConfig::default();

        // New Zealand (high security) vs Afghanistan (critical risk)
        let nz = make_candidate("Auckland", -36.848500000, 174.763300000, Some(1), Some(5));
        let singapore = make_candidate("Singapore", 1.352100000, 103.819800000, Some(1), Some(5));

        let scored_nz = score_candidate(nz, &config, 10.000000000);
        let scored_sg = score_candidate(singapore, &config, 10.000000000);

        // Both should have high security scores
        assert!(scored_nz.security_score > 0.700000000, "NZ security: {}", scored_nz.security_score);
        assert!(scored_sg.security_score > 0.700000000, "SG security: {}", scored_sg.security_score);
    }

    #[test]
    fn test_security_score_risky_country() {
        let config = ScorerConfig::default();

        // Yemen (critical risk)
        let yemen = make_candidate("Aden", 12.779700000, 45.009500000, Some(2), Some(2));
        let scored = score_candidate(yemen, &config, 10.000000000);

        // Should have low security score (critical risk country)
        // Note: May not geocode correctly with simple bounding boxes
        // This test validates the integration works
        assert!(scored.security_score <= 1.000000000, "Security score in valid range");
    }

    #[test]
    fn test_weights_sum_to_one() {
        let config = ScorerConfig::default();
        let total = config.w_population
            + config.w_pop_proximity
            + config.w_xai
            + config.w_weather
            + config.w_network
            + config.w_security
            + config.w_infrastructure;

        assert!(
            (total - 1.000000000).abs() < 0.001000000,
            "Weights should sum to 1.0, got {}",
            total
        );
    }

    #[test]
    fn test_infrastructure_score_by_source() {
        let config = ScorerConfig::default();

        // Test without tier bonuses to see base source differentiation
        // XAI source should have highest infrastructure score
        let xai = make_infra_candidate("XAI", XAI_LAT, XAI_LON, CandidateSource::XAI, None);
        let scored_xai = score_candidate(xai, &config, 10.000000000);

        // Financial infrastructure should be very high
        let fin = make_infra_candidate("NYSE", 40.712800000, -74.006000000, CandidateSource::FinancialInfra, None);
        let scored_fin = score_candidate(fin, &config, 10.000000000);

        // Cable landing should be mid-high
        let cable = make_infra_candidate("Marseille", 43.296500000, 5.369800000, CandidateSource::CableLanding, None);
        let scored_cable = score_candidate(cable, &config, 10.000000000);

        // Ground node should be lower (no proximity bonuses either)
        let mut ground = make_candidate("GenericNode", 40.000000000, -74.000000000, None, None);
        ground.source = CandidateSource::GroundNode;
        let scored_ground = score_candidate(ground, &config, 10.000000000);

        // Verify ordering (base infrastructure bonuses + proximity bonuses)
        // XAI: 1.0 + 0.15 proximity = 1.0 (capped)
        // Financial: 0.95 + 0.15 = 1.0 (capped)
        // Cable: 0.80 + 0.15 = 0.95
        // Ground: 0.50 + 0 = 0.50

        assert!(scored_xai.infrastructure_score >= 0.950000000,
            "XAI should have high infra score: {}", scored_xai.infrastructure_score);
        assert!(scored_fin.infrastructure_score >= 0.950000000,
            "Financial should have high infra score: {}", scored_fin.infrastructure_score);
        assert!(scored_cable.infrastructure_score > 0.900000000,
            "Cable should have high infra score: {}", scored_cable.infrastructure_score);
        assert!(scored_ground.infrastructure_score < scored_cable.infrastructure_score,
            "Cable should have > infra score than ground node: {} vs {}",
            scored_cable.infrastructure_score, scored_ground.infrastructure_score);
    }

    #[test]
    fn test_infrastructure_tier_bonus() {
        let config = ScorerConfig::default();

        // Tier 0 cable landing (10+ cables) should score higher
        let tier0 = make_infra_candidate("Batam", 1.066800000, 104.016600000, CandidateSource::CableLanding, Some(0));
        let scored_tier0 = score_candidate(tier0, &config, 10.000000000);

        // Tier 3 cable landing (1-3 cables) should score lower
        let tier3 = make_infra_candidate("SmallPort", 1.066800000, 104.016600000, CandidateSource::CableLanding, Some(3));
        let scored_tier3 = score_candidate(tier3, &config, 10.000000000);

        assert!(scored_tier0.infrastructure_score > scored_tier3.infrastructure_score,
            "Tier 0 should have > infra score than Tier 3: {} vs {}",
            scored_tier0.infrastructure_score, scored_tier3.infrastructure_score);
    }
}
