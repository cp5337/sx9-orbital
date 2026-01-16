//! Ground Station Downselect Module
//!
//! Multi-criteria decision analysis for FSO ground station site selection.
//! Evaluates candidates against atmospheric, infrastructure, geographic,
//! and operational factors to produce ranked recommendations.
//!
//! Based on PhD-level deterministic performance analysis.

use serde::{Deserialize, Serialize};
use crate::stations::{NetworkStation, StationType};

/// Scoring weights for different criteria categories
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoringWeights {
    /// Atmospheric conditions weight (clear sky probability, turbulence)
    pub atmospheric: f64,
    /// Infrastructure weight (fiber, power, data center proximity)
    pub infrastructure: f64,
    /// Geographic weight (coverage, diversity, constellation access)
    pub geographic: f64,
    /// Operational weight (security, stability, accessibility)
    pub operational: f64,
    /// Strategic weight (partner locations, expansion potential)
    pub strategic: f64,
}

impl Default for ScoringWeights {
    fn default() -> Self {
        Self {
            atmospheric: 0.25,
            infrastructure: 0.25,
            geographic: 0.20,
            operational: 0.15,
            strategic: 0.15,
        }
    }
}

impl ScoringWeights {
    /// Normalize weights to sum to 1.0
    pub fn normalize(&mut self) {
        let sum = self.atmospheric + self.infrastructure + self.geographic
            + self.operational + self.strategic;
        if sum > 0.0 {
            self.atmospheric /= sum;
            self.infrastructure /= sum;
            self.geographic /= sum;
            self.operational /= sum;
            self.strategic /= sum;
        }
    }
}

/// Atmospheric scoring factors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AtmosphericScore {
    /// Annual clear sky probability (0-1)
    pub clear_sky_prob: f64,
    /// Atmospheric turbulence score (0-1, higher is better/less turbulence)
    pub turbulence_score: f64,
    /// Cloud cover seasonality variance (0-1, lower is better)
    pub seasonality: f64,
    /// Scintillation index average
    pub scintillation: f64,
}

impl AtmosphericScore {
    /// Calculate composite atmospheric score
    pub fn composite(&self) -> f64 {
        0.4 * self.clear_sky_prob
        + 0.3 * self.turbulence_score
        + 0.2 * (1.0 - self.seasonality)
        + 0.1 * (1.0 - self.scintillation.min(1.0))
    }

    /// Default based on latitude (simplified model)
    pub fn from_latitude(lat: f64) -> Self {
        let abs_lat = lat.abs();

        // Desert/arid regions (15-35°) have best seeing
        let clear_sky = if abs_lat < 15.0 {
            0.5 // Tropical - clouds
        } else if abs_lat < 35.0 {
            0.8 // Subtropical arid - best
        } else if abs_lat < 55.0 {
            0.6 // Temperate - variable
        } else {
            0.4 // High latitude - poor
        };

        // Turbulence increases with latitude variation
        let turbulence = 1.0 - (abs_lat / 90.0) * 0.3;

        Self {
            clear_sky_prob: clear_sky,
            turbulence_score: turbulence,
            seasonality: abs_lat / 90.0,
            scintillation: 0.3, // Default moderate
        }
    }
}

/// Infrastructure scoring factors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InfrastructureScore {
    /// Fiber connectivity (0-1)
    pub fiber_score: f64,
    /// Power grid reliability (0-1)
    pub power_reliability: f64,
    /// Data center tier (0-1, mapped from Tier I-IV)
    pub dc_tier: f64,
    /// Internet exchange proximity (0-1)
    pub ix_proximity: f64,
}

impl InfrastructureScore {
    pub fn composite(&self) -> f64 {
        0.35 * self.fiber_score
        + 0.25 * self.power_reliability
        + 0.25 * self.dc_tier
        + 0.15 * self.ix_proximity
    }

    pub fn from_station(station: &NetworkStation) -> Self {
        let dc_tier = match station.station_type {
            StationType::EquinixIBX => 1.0,  // Tier III+
            StationType::FSOTerminal => 0.75,
            StationType::Teleport => 0.7,
            StationType::CableLanding => 0.6,
            StationType::Research => 0.5,
        };

        Self {
            fiber_score: station.fiber_score,
            power_reliability: if station.country_code.as_deref() == Some("US")
                || station.country_code.as_deref() == Some("GB")
                || station.country_code.as_deref() == Some("DE")
                || station.country_code.as_deref() == Some("JP")
                || station.country_code.as_deref() == Some("SG") {
                0.95
            } else {
                0.75
            },
            dc_tier,
            ix_proximity: if station.equinix_code.is_some() { 1.0 } else { 0.5 },
        }
    }
}

/// Geographic scoring factors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeographicScore {
    /// Constellation coverage (avg satellites visible)
    pub constellation_access: f64,
    /// Ground station diversity (distance to nearest peer)
    pub diversity_score: f64,
    /// Latitude advantage for MEO coverage
    pub latitude_bonus: f64,
    /// Strategic region (major traffic route)
    pub traffic_corridor: f64,
}

impl GeographicScore {
    pub fn composite(&self) -> f64 {
        0.3 * self.constellation_access
        + 0.25 * self.diversity_score
        + 0.25 * self.latitude_bonus
        + 0.2 * self.traffic_corridor
    }

    /// Calculate from latitude for MEO constellation
    pub fn from_position(lat: f64, lon: f64) -> Self {
        let abs_lat = lat.abs();

        // MEO satellites (Walker Delta 53°) optimal at mid-latitudes
        let constellation = if abs_lat < 60.0 {
            1.0 - (abs_lat - 30.0).abs() / 60.0
        } else {
            0.4 // Polar limited
        };

        // Traffic corridors (simplified)
        let traffic = if (lat > 30.0 && lat < 55.0) && (lon > -130.0 && lon < 150.0) {
            0.9 // Northern hemisphere main routes
        } else if lat > -40.0 && lat < 10.0 {
            0.7 // Equatorial/Southern routes
        } else {
            0.5
        };

        Self {
            constellation_access: constellation,
            diversity_score: 0.5, // Requires network analysis
            latitude_bonus: 1.0 - (abs_lat - 35.0).abs() / 55.0,
            traffic_corridor: traffic,
        }
    }
}

/// Operational scoring factors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationalScore {
    /// Political stability index (0-1)
    pub stability: f64,
    /// Regulatory environment (0-1)
    pub regulatory: f64,
    /// Physical security (0-1)
    pub security: f64,
    /// Accessibility (maintenance, staff)
    pub accessibility: f64,
}

impl OperationalScore {
    pub fn composite(&self) -> f64 {
        0.3 * self.stability
        + 0.25 * self.regulatory
        + 0.25 * self.security
        + 0.2 * self.accessibility
    }

    pub fn from_country(country_code: Option<&str>) -> Self {
        // Simplified country scoring (would use real indices in production)
        let (stability, regulatory) = match country_code {
            Some("US") | Some("GB") | Some("DE") | Some("JP") | Some("AU") => (0.95, 0.90),
            Some("SG") | Some("NL") | Some("CH") | Some("NZ") => (0.95, 0.95),
            Some("FR") | Some("ES") | Some("IT") => (0.85, 0.80),
            Some("AE") | Some("HK") => (0.80, 0.85),
            Some("BR") | Some("IN") | Some("ZA") => (0.70, 0.65),
            Some("CL") => (0.80, 0.75),
            _ => (0.60, 0.55),
        };

        Self {
            stability,
            regulatory,
            security: stability * 0.9, // Correlated
            accessibility: 0.7, // Default
        }
    }
}

/// Strategic scoring factors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategicScore {
    /// Partner ecosystem (Equinix, ATLAS, etc.)
    pub partner_score: f64,
    /// Expansion potential (market growth)
    pub growth_potential: f64,
    /// Competitive advantage
    pub competitive: f64,
    /// Mission alignment (LaserLight strategy)
    pub mission_fit: f64,
}

impl StrategicScore {
    pub fn composite(&self) -> f64 {
        0.35 * self.partner_score
        + 0.25 * self.growth_potential
        + 0.20 * self.competitive
        + 0.20 * self.mission_fit
    }

    pub fn from_station(station: &NetworkStation) -> Self {
        let partner = if station.equinix_code.is_some() {
            1.0 // Direct Equinix partner
        } else if station.station_type == StationType::FSOTerminal {
            0.8 // HALO Centre
        } else {
            0.4
        };

        // Growth markets
        let growth = match station.country_code.as_deref() {
            Some("IN") | Some("BR") | Some("ZA") | Some("AE") => 0.9, // Emerging
            Some("SG") | Some("HK") => 0.85, // High growth hubs
            Some("US") | Some("GB") | Some("DE") => 0.7, // Mature
            _ => 0.5,
        };

        Self {
            partner_score: partner,
            growth_potential: growth,
            competitive: 0.7,
            mission_fit: if station.station_type == StationType::EquinixIBX { 1.0 } else { 0.6 },
        }
    }
}

/// Complete station evaluation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StationEvaluation {
    pub station_id: String,
    pub station_name: String,
    pub atmospheric: AtmosphericScore,
    pub infrastructure: InfrastructureScore,
    pub geographic: GeographicScore,
    pub operational: OperationalScore,
    pub strategic: StrategicScore,
    /// Final weighted score (0-100)
    pub final_score: f64,
    /// Rank in downselect
    pub rank: usize,
}

impl StationEvaluation {
    /// Calculate final score with weights
    pub fn calculate_score(&mut self, weights: &ScoringWeights) {
        self.final_score = 100.0 * (
            weights.atmospheric * self.atmospheric.composite()
            + weights.infrastructure * self.infrastructure.composite()
            + weights.geographic * self.geographic.composite()
            + weights.operational * self.operational.composite()
            + weights.strategic * self.strategic.composite()
        );
    }
}

/// Downselect processor
pub struct Downselect {
    pub weights: ScoringWeights,
    pub evaluations: Vec<StationEvaluation>,
}

impl Downselect {
    pub fn new() -> Self {
        Self {
            weights: ScoringWeights::default(),
            evaluations: vec![],
        }
    }

    pub fn with_weights(mut self, weights: ScoringWeights) -> Self {
        self.weights = weights;
        self.weights.normalize();
        self
    }

    /// Evaluate all stations
    pub fn evaluate(&mut self, stations: &[NetworkStation]) {
        self.evaluations = stations.iter().map(|s| {
            let lat = s.config.latitude_deg;
            let lon = s.config.longitude_deg;

            let mut eval = StationEvaluation {
                station_id: s.config.id.clone(),
                station_name: s.config.name.clone(),
                atmospheric: AtmosphericScore::from_latitude(lat),
                infrastructure: InfrastructureScore::from_station(s),
                geographic: GeographicScore::from_position(lat, lon),
                operational: OperationalScore::from_country(s.country_code.as_deref()),
                strategic: StrategicScore::from_station(s),
                final_score: 0.0,
                rank: 0,
            };

            eval.calculate_score(&self.weights);
            eval
        }).collect();

        // Sort by score descending and assign ranks
        self.evaluations.sort_by(|a, b| b.final_score.partial_cmp(&a.final_score).unwrap());
        for (i, eval) in self.evaluations.iter_mut().enumerate() {
            eval.rank = i + 1;
        }
    }

    /// Get top N stations
    pub fn top_n(&self, n: usize) -> Vec<&StationEvaluation> {
        self.evaluations.iter().take(n).collect()
    }

    /// Get stations above score threshold
    pub fn above_threshold(&self, min_score: f64) -> Vec<&StationEvaluation> {
        self.evaluations.iter().filter(|e| e.final_score >= min_score).collect()
    }

    /// Generate downselect summary
    pub fn summary(&self) -> DownselectSummary {
        let count = self.evaluations.len();
        let scores: Vec<f64> = self.evaluations.iter().map(|e| e.final_score).collect();

        DownselectSummary {
            total_candidates: count,
            mean_score: scores.iter().sum::<f64>() / count as f64,
            max_score: scores.iter().cloned().fold(f64::MIN, f64::max),
            min_score: scores.iter().cloned().fold(f64::MAX, f64::min),
            top_5: self.top_n(5).iter().map(|e| (e.station_name.clone(), e.final_score)).collect(),
        }
    }
}

/// Downselect summary for reporting
#[derive(Debug, Clone, Serialize)]
pub struct DownselectSummary {
    pub total_candidates: usize,
    pub mean_score: f64,
    pub max_score: f64,
    pub min_score: f64,
    pub top_5: Vec<(String, f64)>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stations::load_strategic_stations;

    #[test]
    fn test_downselect_strategic() {
        let stations = load_strategic_stations();
        let mut ds = Downselect::new();
        ds.evaluate(&stations);

        let summary = ds.summary();
        println!("Downselect Summary:");
        println!("  Total candidates: {}", summary.total_candidates);
        println!("  Mean score: {:.2}", summary.mean_score);
        println!("  Top 5:");
        for (name, score) in &summary.top_5 {
            println!("    {} - {:.2}", name, score);
        }

        assert!(summary.max_score > 60.0, "Top station should score > 60");
    }

    #[test]
    fn test_equinix_preference() {
        // With default weights, Equinix stations should rank higher
        let stations = load_strategic_stations();
        let mut ds = Downselect::new();
        ds.evaluate(&stations);

        let top_10 = ds.top_n(10);
        let equinix_in_top_10 = top_10.iter()
            .filter(|e| e.station_id.starts_with("EQ-"))
            .count();

        assert!(equinix_in_top_10 >= 3, "Equinix should dominate top 10");
    }

    #[test]
    fn test_custom_weights() {
        let stations = load_strategic_stations();

        // Prioritize atmospheric conditions (for FSO)
        let weights = ScoringWeights {
            atmospheric: 0.5,
            infrastructure: 0.2,
            geographic: 0.1,
            operational: 0.1,
            strategic: 0.1,
        };

        let mut ds = Downselect::new().with_weights(weights);
        ds.evaluate(&stations);

        // Should favor arid/clear sky locations
        let summary = ds.summary();
        println!("Atmospheric-weighted Top 5: {:?}", summary.top_5);
    }
}
