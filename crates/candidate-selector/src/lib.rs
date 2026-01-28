//! Ground Station Candidate Selector
//!
//! Merges ground nodes and cable landing points, scores candidates,
//! and selects optimal 247 stations for the SX9-Orbital constellation.
//!
//! # Scoring Model (7-Factor with Security + Infrastructure)
//!
//! ```text
//! Score(gn) = w₁·P + w₂·D_POP⁻¹ + w₃·C_XAI + w₄·W + w₅·N + w₆·S + w₇·I
//! ```
//!
//! | Factor | Weight | Description |
//! |--------|--------|-------------|
//! | P      | 0.20   | Population proximity |
//! | D_POP⁻¹| 0.15   | POP/IXP network proximity |
//! | C_XAI  | 0.15   | XAI connectivity (Memphis, TN) |
//! | W      | 0.10   | Weather suitability (FSO viability) |
//! | N      | 0.08   | Network demand (cable count) |
//! | S      | 0.15   | Security/geopolitical risk (Five Eyes + World Bank) |
//! | I      | 0.17   | Infrastructure quality (source type + tier + proximity) |
//!
//! # Infrastructure Priority
//!
//! Infrastructure sources are prioritized in this order:
//! 1. XAI Colossus (Memphis, TN) - highest priority
//! 2. Financial Infrastructure (DTCC, exchanges, clearing)
//! 3. Equinix IBX Data Centers
//! 4. Laser Light Beta Sites
//! 5. Cable Landings (by tier: 0-3 based on cable count)
//! 6. Internet Exchange Points (IXPs)
//! 7. Ground Nodes (generic)

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::f64::consts::PI;
use thiserror::Error;

pub mod loader;
pub mod scorer;
pub mod security;
pub mod selector;

pub use scorer::ScorerConfig;
pub use security::{CountryRisk, SecurityConfig};

/// XAI Colossus location (Memphis, TN) (9 decimal precision)
pub const XAI_LAT: f64 = 35.149500000;
pub const XAI_LON: f64 = -90.049000000;

/// Zone quotas for 247 total stations
pub const ZONE_QUOTAS: [(Zone, usize); 3] = [
    (Zone::Americas, 72),
    (Zone::Emea, 85),
    (Zone::Apac, 90),
];

/// Deduplication threshold in km (9 decimal precision)
pub const DEDUP_THRESHOLD_KM: f64 = 50.000000000;

/// Minimum spacing between selected stations in km (9 decimal precision)
pub const MIN_SPACING_KM: f64 = 50.000000000;

#[derive(Error, Debug)]
pub enum SelectorError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("No candidates found")]
    NoCandidates,
    #[error("Insufficient candidates for zone {0:?}: need {1}, have {2}")]
    InsufficientCandidates(Zone, usize, usize),
}

pub type Result<T> = std::result::Result<T, SelectorError>;

/// Geographic zones
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Zone {
    Americas,
    Emea,
    Apac,
}

impl Zone {
    /// Assign zone based on longitude (9 decimal precision)
    pub fn from_longitude(lon: f64) -> Self {
        if lon >= -180.000000000 && lon < -30.000000000 {
            Zone::Americas
        } else if lon >= -30.000000000 && lon < 60.000000000 {
            Zone::Emea
        } else {
            Zone::Apac
        }
    }

    /// Get the quota for this zone
    pub fn quota(&self) -> usize {
        match self {
            Zone::Americas => 72,
            Zone::Emea => 85,
            Zone::Apac => 90,
        }
    }
}

/// Source of candidate data
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CandidateSource {
    GroundNode,
    CableLanding,
    Equinix,
    LaserLight,
    IXP,
    FinancialInfra,
    XAI,
    Merged,
}

impl CandidateSource {
    /// Base infrastructure bonus (0-1) for prioritizing real infrastructure
    pub fn infrastructure_bonus(&self) -> f64 {
        match self {
            // Critical infrastructure gets highest bonus
            Self::XAI => 1.000000000,              // XAI Colossus - highest priority
            Self::FinancialInfra => 0.950000000,   // Financial infrastructure (DTCC, exchanges)
            Self::Equinix => 0.900000000,          // Major interconnection hubs
            Self::LaserLight => 0.850000000,       // Laser Light beta sites (optical backbone)
            Self::CableLanding => 0.800000000,     // Submarine cable landings
            Self::IXP => 0.700000000,              // Internet Exchange Points
            Self::GroundNode => 0.500000000,       // Generic ground nodes
            Self::Merged => 0.750000000,           // Merged sources (inherits from constituents)
        }
    }
}

/// A candidate ground station location
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candidate {
    pub id: String,
    pub name: String,
    pub latitude: f64,
    pub longitude: f64,
    pub zone: Zone,
    pub source: CandidateSource,

    // From ground nodes
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tier: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub demand_gbps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weather_score: Option<f64>,

    // From cable landings
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cable_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cables: Option<Vec<String>>,

    // Merged sources
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merged_from: Option<Vec<String>>,

    // Security & Geopolitical Risk (NEW)
    /// ISO 3166-1 alpha-2 country code (e.g., "US", "SG", "GB")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country_code: Option<String>,
    /// Five Eyes travel advisory level (1-4, lower = safer)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub travel_advisory_level: Option<u8>,
    /// World Bank Political Stability index (-2.5 to +2.5)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub political_stability: Option<f64>,
    /// World Bank Rule of Law index (-2.5 to +2.5)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_of_law: Option<f64>,
    /// World Bank Control of Corruption index (-2.5 to +2.5)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub corruption_control: Option<f64>,
    /// Composite security score (0-1, higher = safer)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub security_score: Option<f64>,

    // Infrastructure enrichment (NEW)
    /// Nearest IXP distance in km
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nearest_ixp_km: Option<f64>,
    /// Nearest Equinix facility distance in km
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nearest_equinix_km: Option<f64>,
    /// Nearest financial infrastructure distance in km
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nearest_financial_km: Option<f64>,
    /// Infrastructure type classification for scoring
    #[serde(skip_serializing_if = "Option::is_none")]
    pub infrastructure_tier: Option<u8>,
}

impl Candidate {
    /// Create from ground node data
    pub fn from_ground_node(
        id: String,
        name: String,
        lat: f64,
        lon: f64,
        tier: Option<u8>,
        demand_gbps: Option<f64>,
        weather_score: Option<f64>,
    ) -> Self {
        Self {
            id,
            name,
            latitude: lat,
            longitude: lon,
            zone: Zone::from_longitude(lon),
            source: CandidateSource::GroundNode,
            tier,
            demand_gbps,
            weather_score,
            cable_count: None,
            cables: None,
            merged_from: None,
            // Security fields (populated later)
            country_code: None,
            travel_advisory_level: None,
            political_stability: None,
            rule_of_law: None,
            corruption_control: None,
            security_score: None,
            // Infrastructure enrichment (populated later)
            nearest_ixp_km: None,
            nearest_equinix_km: None,
            nearest_financial_km: None,
            infrastructure_tier: None,
        }
    }

    /// Create from cable landing data
    pub fn from_cable_landing(
        id: String,
        name: String,
        lat: f64,
        lon: f64,
        cable_count: u32,
        cables: Vec<String>,
    ) -> Self {
        Self {
            id,
            name,
            latitude: lat,
            longitude: lon,
            zone: Zone::from_longitude(lon),
            source: CandidateSource::CableLanding,
            tier: None,
            demand_gbps: None,
            weather_score: None,
            cable_count: Some(cable_count),
            cables: Some(cables),
            merged_from: None,
            // Security fields (populated later)
            country_code: None,
            travel_advisory_level: None,
            political_stability: None,
            rule_of_law: None,
            corruption_control: None,
            security_score: None,
            // Infrastructure enrichment (populated later)
            nearest_ixp_km: None,
            nearest_equinix_km: None,
            nearest_financial_km: None,
            infrastructure_tier: None,
        }
    }

    /// Merge another candidate into this one
    pub fn merge(&mut self, other: &Candidate) {
        self.source = CandidateSource::Merged;

        // Track merged sources
        let mut merged = self.merged_from.take().unwrap_or_default();
        merged.push(other.id.clone());
        self.merged_from = Some(merged);

        // Merge cable info
        if self.cable_count.is_none() && other.cable_count.is_some() {
            self.cable_count = other.cable_count;
            self.cables = other.cables.clone();
        } else if let (Some(my_count), Some(their_count)) = (self.cable_count, other.cable_count) {
            self.cable_count = Some(my_count.max(their_count));
        }

        // Merge weather score
        if self.weather_score.is_none() && other.weather_score.is_some() {
            self.weather_score = other.weather_score;
        }

        // Merge tier
        if self.tier.is_none() && other.tier.is_some() {
            self.tier = other.tier;
        }
    }
}

/// Scored candidate with all scoring factors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoredCandidate {
    pub candidate: Candidate,
    /// Total composite score (0-1)
    pub score: f64,
    /// Population proximity score (0-1)
    pub pop_score: f64,
    /// POP network proximity score (0-1)
    pub pop_proximity_score: f64,
    /// XAI connectivity score (0-1)
    pub xai_score: f64,
    /// Weather suitability score (0-1)
    pub weather_score: f64,
    /// Network demand score (0-1)
    pub network_score: f64,
    /// Security/geopolitical risk score (0-1, higher = safer)
    pub security_score: f64,
    /// Infrastructure quality score (0-1, based on source type and proximity)
    pub infrastructure_score: f64,
}

impl ScoredCandidate {
    /// Calculate composite score from factors (7-factor model with security + infrastructure)
    ///
    /// Score(gn) = w₁·P + w₂·D_POP⁻¹ + w₃·C_XAI + w₄·W + w₅·N + w₆·S + w₇·I
    ///
    /// Weights rebalanced to include infrastructure priority (9-decimal precision):
    pub fn calculate_score(&mut self) {
        // 7-factor model weights (sum = 1.0)
        const W_POP: f64 = 0.200000000;           // Population proximity
        const W_POP_PROX: f64 = 0.150000000;      // POP/IXP network proximity
        const W_XAI: f64 = 0.150000000;           // XAI connectivity (Memphis)
        const W_WEATHER: f64 = 0.100000000;       // FSO weather suitability
        const W_NETWORK: f64 = 0.080000000;       // Network demand (cable count)
        const W_SECURITY: f64 = 0.150000000;      // Geopolitical security
        const W_INFRASTRUCTURE: f64 = 0.170000000; // Infrastructure quality bonus

        self.score = W_POP * self.pop_score
            + W_POP_PROX * self.pop_proximity_score
            + W_XAI * self.xai_score
            + W_WEATHER * self.weather_score
            + W_NETWORK * self.network_score
            + W_SECURITY * self.security_score
            + W_INFRASTRUCTURE * self.infrastructure_score;
    }
}

/// Final selection result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectionResult {
    pub selected: Vec<ScoredCandidate>,
    pub metadata: SelectionMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectionMetadata {
    pub total_selected: usize,
    pub zone_distribution: HashMap<String, usize>,
    pub total_candidates: usize,
    pub dedup_threshold_km: f64,
    pub min_spacing_km: f64,
    pub generated_at: String,
}

/// Haversine distance between two points in km (9 decimal precision)
pub fn haversine_km(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    const R: f64 = 6371.000000000; // Earth radius in km

    let lat1_rad = lat1 * PI / 180.000000000;
    let lat2_rad = lat2 * PI / 180.000000000;
    let dlat = (lat2 - lat1) * PI / 180.000000000;
    let dlon = (lon2 - lon1) * PI / 180.000000000;

    let a = (dlat / 2.000000000).sin().powi(2)
        + lat1_rad.cos() * lat2_rad.cos() * (dlon / 2.000000000).sin().powi(2);
    let c = 2.000000000 * a.sqrt().atan2((1.000000000 - a).sqrt());

    R * c
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zone_from_longitude() {
        assert_eq!(Zone::from_longitude(-74.000000000), Zone::Americas); // NYC
        assert_eq!(Zone::from_longitude(-122.000000000), Zone::Americas); // SF
        assert_eq!(Zone::from_longitude(0.000000000), Zone::Emea); // London
        assert_eq!(Zone::from_longitude(2.000000000), Zone::Emea); // Paris
        assert_eq!(Zone::from_longitude(103.000000000), Zone::Apac); // Singapore
        assert_eq!(Zone::from_longitude(139.000000000), Zone::Apac); // Tokyo
    }

    #[test]
    fn test_haversine() {
        // NYC to London: ~5,570 km
        let dist = haversine_km(40.712800000, -74.006000000, 51.507400000, -0.127800000);
        assert!((dist - 5570.000000000).abs() < 50.000000000);

        // Same point: 0 km
        let dist = haversine_km(0.000000000, 0.000000000, 0.000000000, 0.000000000);
        assert!(dist.abs() < 0.001000000);
    }

    #[test]
    fn test_zone_quotas() {
        let total: usize = ZONE_QUOTAS.iter().map(|(_, q)| q).sum();
        assert_eq!(total, 247);
    }
}
