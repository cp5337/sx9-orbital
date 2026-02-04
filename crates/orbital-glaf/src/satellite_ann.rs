//! Satellite ANN Router
//!
//! Treats each satellite as an artificial neuron in a routing network.
//! Satellites make autonomous routing decisions based on:
//! - Real-time weather at visible ground stations
//! - Historical weather patterns (learned)
//! - Link geometry (elevation, slant range)
//! - Current network load
//!
//! Each satellite runs a local decision model that:
//! 1. Evaluates all visible ground stations
//! 2. Scores them based on weather + geometry
//! 3. Selects best downlink target
//! 4. Shares decision with constellation mesh

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Weather observation for a ground station
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherObservation {
    pub station_id: String,
    pub timestamp: i64,
    pub fso_score: f64,        // 0-1, from weather scoring
    pub cloud_cover_pct: f64,
    pub visibility_km: f64,
    pub precip_probability: f64,
}

/// Historical weather pattern for a station
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherPattern {
    pub station_id: String,
    /// Average FSO score by hour of day (0-23)
    pub hourly_avg_score: [f64; 24],
    /// Average FSO score by month (0-11)
    pub monthly_avg_score: [f64; 12],
    /// Historical availability (fraction of time link-viable)
    pub availability: f64,
    /// Variance in FSO score (lower = more predictable)
    pub score_variance: f64,
}

/// Link geometry between satellite and ground station
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkGeometry {
    pub station_id: String,
    pub elevation_deg: f64,     // Elevation angle from ground station
    pub slant_range_km: f64,    // Distance satellite to station
    pub azimuth_deg: f64,       // Compass bearing
    pub doppler_shift_hz: f64,  // For frequency tracking
}

/// Satellite neuron state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SatelliteNeuron {
    pub satellite_id: String,
    pub satellite_name: String,

    /// Current position
    pub latitude: f64,
    pub longitude: f64,
    pub altitude_km: f64,

    /// Visible ground stations with geometry
    pub visible_stations: Vec<LinkGeometry>,

    /// Current weather observations for visible stations
    pub weather_obs: HashMap<String, WeatherObservation>,

    /// Learned weather patterns (historical)
    pub weather_patterns: HashMap<String, WeatherPattern>,

    /// Current best downlink target
    pub active_downlink: Option<String>,

    /// Neuron weights (learned from historical data)
    pub weights: NeuronWeights,

    /// Decision history for learning
    pub decision_log: Vec<RoutingDecision>,
}

/// Learned weights for routing decisions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NeuronWeights {
    /// Weight for current weather score
    pub w_current_weather: f64,
    /// Weight for historical availability
    pub w_historical_avail: f64,
    /// Weight for pattern prediction
    pub w_pattern_prediction: f64,
    /// Weight for elevation angle (higher = better)
    pub w_elevation: f64,
    /// Weight for slant range (shorter = better)
    pub w_range: f64,
    /// Weight for station tier (T1 > T2 > T3)
    pub w_tier: f64,
    /// Learning rate for weight updates
    pub learning_rate: f64,
}

impl Default for NeuronWeights {
    fn default() -> Self {
        Self {
            w_current_weather: 0.400000000,
            w_historical_avail: 0.150000000,
            w_pattern_prediction: 0.150000000,
            w_elevation: 0.150000000,
            w_range: 0.100000000,
            w_tier: 0.050000000,
            learning_rate: 0.010000000,
        }
    }
}

/// A routing decision made by a satellite
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingDecision {
    pub timestamp: i64,
    pub satellite_id: String,
    pub selected_station: String,
    pub score: f64,
    pub alternatives: Vec<(String, f64)>,  // (station_id, score)
    pub reason: String,
    /// Actual outcome (updated after link attempt)
    pub outcome: Option<LinkOutcome>,
}

/// Outcome of a routing decision (for learning)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkOutcome {
    pub success: bool,
    pub actual_throughput_gbps: f64,
    pub actual_margin_db: f64,
    pub duration_sec: f64,
    pub failure_reason: Option<String>,
}

impl SatelliteNeuron {
    pub fn new(id: &str, name: &str, lat: f64, lon: f64, alt_km: f64) -> Self {
        Self {
            satellite_id: id.to_string(),
            satellite_name: name.to_string(),
            latitude: lat,
            longitude: lon,
            altitude_km: alt_km,
            visible_stations: Vec::new(),
            weather_obs: HashMap::new(),
            weather_patterns: HashMap::new(),
            active_downlink: None,
            weights: NeuronWeights::default(),
            decision_log: Vec::new(),
        }
    }

    /// Score a ground station for downlink
    pub fn score_station(&self, station_id: &str, tier: u8) -> Option<f64> {
        let geometry = self.visible_stations.iter()
            .find(|g| g.station_id == station_id)?;

        // Current weather score (most important)
        let current_weather = self.weather_obs.get(station_id)
            .map(|w| w.fso_score)
            .unwrap_or(0.5);

        // Historical availability
        let historical = self.weather_patterns.get(station_id)
            .map(|p| p.availability)
            .unwrap_or(0.5);

        // Pattern-based prediction for current hour
        let hour = (chrono::Utc::now().timestamp() / 3600 % 24) as usize;
        let pattern_pred = self.weather_patterns.get(station_id)
            .map(|p| p.hourly_avg_score[hour])
            .unwrap_or(0.5);

        // Normalize elevation (0° = 0, 90° = 1)
        let elevation_score = (geometry.elevation_deg / 90.0).min(1.0).max(0.0);

        // Normalize range (15000 km = 0, 5000 km = 1)
        let range_score = ((15000.0 - geometry.slant_range_km) / 10000.0).min(1.0).max(0.0);

        // Tier score (T1 = 1.0, T2 = 0.7, T3 = 0.5)
        let tier_score = match tier {
            1 => 1.000000000,
            2 => 0.700000000,
            _ => 0.500000000,
        };

        // Weighted sum
        let score = self.weights.w_current_weather * current_weather
            + self.weights.w_historical_avail * historical
            + self.weights.w_pattern_prediction * pattern_pred
            + self.weights.w_elevation * elevation_score
            + self.weights.w_range * range_score
            + self.weights.w_tier * tier_score;

        Some(score)
    }

    /// Select best downlink target from visible stations
    pub fn select_downlink(&mut self, station_tiers: &HashMap<String, u8>) -> Option<RoutingDecision> {
        let timestamp = chrono::Utc::now().timestamp();

        // Score all visible stations
        let mut scored: Vec<(String, f64)> = self.visible_stations.iter()
            .filter_map(|g| {
                let tier = station_tiers.get(&g.station_id).copied().unwrap_or(3);
                self.score_station(&g.station_id, tier)
                    .map(|score| (g.station_id.clone(), score))
            })
            .collect();

        // Sort by score descending
        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        if scored.is_empty() {
            return None;
        }

        let (best_station, best_score) = scored[0].clone();
        let alternatives = scored[1..].iter().take(3).cloned().collect();

        let decision = RoutingDecision {
            timestamp,
            satellite_id: self.satellite_id.clone(),
            selected_station: best_station.clone(),
            score: best_score,
            alternatives,
            reason: format!("Best weather + geometry score: {:.3}", best_score),
            outcome: None,
        };

        self.active_downlink = Some(best_station);
        self.decision_log.push(decision.clone());

        // Keep only last 1000 decisions
        if self.decision_log.len() > 1000 {
            self.decision_log.drain(0..500);
        }

        Some(decision)
    }

    /// Update weights based on outcome (simple gradient descent)
    pub fn learn_from_outcome(&mut self, decision_idx: usize, outcome: LinkOutcome) {
        if decision_idx >= self.decision_log.len() {
            return;
        }

        self.decision_log[decision_idx].outcome = Some(outcome.clone());

        // Simple reward signal: throughput achieved vs expected
        let reward = if outcome.success {
            outcome.actual_throughput_gbps / 100.0  // Normalize to 0-1 range
        } else {
            -0.5  // Penalty for failure
        };

        // Update weights toward features that led to good outcomes
        // This is a simplified online learning step
        let lr = self.weights.learning_rate;

        if reward > 0.0 {
            // Increase weight for current weather (it worked)
            self.weights.w_current_weather = (self.weights.w_current_weather + lr * reward).min(0.6);
        } else {
            // Decrease weight for current weather (it failed despite good score)
            // Increase weight for historical patterns
            self.weights.w_current_weather = (self.weights.w_current_weather + lr * reward).max(0.2);
            self.weights.w_historical_avail = (self.weights.w_historical_avail - lr * reward).min(0.3);
        }

        // Normalize weights to sum to 1.0
        self.normalize_weights();
    }

    fn normalize_weights(&mut self) {
        let sum = self.weights.w_current_weather
            + self.weights.w_historical_avail
            + self.weights.w_pattern_prediction
            + self.weights.w_elevation
            + self.weights.w_range
            + self.weights.w_tier;

        if sum > 0.0 {
            self.weights.w_current_weather /= sum;
            self.weights.w_historical_avail /= sum;
            self.weights.w_pattern_prediction /= sum;
            self.weights.w_elevation /= sum;
            self.weights.w_range /= sum;
            self.weights.w_tier /= sum;
        }
    }
}

/// Constellation-level routing coordinator
pub struct ConstellationANN {
    pub satellites: HashMap<String, SatelliteNeuron>,
    /// Global weather patterns (shared across satellites)
    pub global_patterns: HashMap<String, WeatherPattern>,
    /// Station tier lookup
    pub station_tiers: HashMap<String, u8>,
}

impl ConstellationANN {
    pub fn new() -> Self {
        Self {
            satellites: HashMap::new(),
            global_patterns: HashMap::new(),
            station_tiers: HashMap::new(),
        }
    }

    /// Add a satellite to the constellation
    pub fn add_satellite(&mut self, id: &str, name: &str, lat: f64, lon: f64, alt_km: f64) {
        let neuron = SatelliteNeuron::new(id, name, lat, lon, alt_km);
        self.satellites.insert(id.to_string(), neuron);
    }

    /// Update weather observations for all satellites
    pub fn update_weather(&mut self, observations: Vec<WeatherObservation>) {
        for obs in observations {
            for sat in self.satellites.values_mut() {
                // Only update if station is visible to this satellite
                if sat.visible_stations.iter().any(|g| g.station_id == obs.station_id) {
                    sat.weather_obs.insert(obs.station_id.clone(), obs.clone());
                }
            }
        }
    }

    /// Update historical patterns from data
    pub fn load_historical_patterns(&mut self, patterns: Vec<WeatherPattern>) {
        for pattern in patterns {
            self.global_patterns.insert(pattern.station_id.clone(), pattern.clone());

            // Distribute to all satellites
            for sat in self.satellites.values_mut() {
                sat.weather_patterns.insert(pattern.station_id.clone(), pattern.clone());
            }
        }
    }

    /// Run routing decision for all satellites
    pub fn route_all(&mut self) -> Vec<RoutingDecision> {
        let tiers = self.station_tiers.clone();

        self.satellites.values_mut()
            .filter_map(|sat| sat.select_downlink(&tiers))
            .collect()
    }

    /// Get constellation-wide downlink assignments
    pub fn get_assignments(&self) -> HashMap<String, String> {
        self.satellites.iter()
            .filter_map(|(sat_id, sat)| {
                sat.active_downlink.as_ref()
                    .map(|station| (sat_id.clone(), station.clone()))
            })
            .collect()
    }
}

impl Default for ConstellationANN {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_neuron_scoring() {
        let mut neuron = SatelliteNeuron::new("SAT-1", "Test Sat", 0.0, 0.0, 15000.0);

        // Add visible station
        neuron.visible_stations.push(LinkGeometry {
            station_id: "GS-1".to_string(),
            elevation_deg: 45.0,
            slant_range_km: 8000.0,
            azimuth_deg: 180.0,
            doppler_shift_hz: 0.0,
        });

        // Add weather observation
        neuron.weather_obs.insert("GS-1".to_string(), WeatherObservation {
            station_id: "GS-1".to_string(),
            timestamp: 0,
            fso_score: 0.85,
            cloud_cover_pct: 10.0,
            visibility_km: 40.0,
            precip_probability: 0.05,
        });

        let score = neuron.score_station("GS-1", 1);
        assert!(score.is_some());
        assert!(score.unwrap() > 0.5, "Good weather + geometry should have high score");
    }

    #[test]
    fn test_downlink_selection() {
        let mut neuron = SatelliteNeuron::new("SAT-1", "Test Sat", 0.0, 0.0, 15000.0);

        // Add two stations with different conditions
        neuron.visible_stations.push(LinkGeometry {
            station_id: "GS-1".to_string(),
            elevation_deg: 60.0,
            slant_range_km: 7000.0,
            azimuth_deg: 90.0,
            doppler_shift_hz: 0.0,
        });
        neuron.visible_stations.push(LinkGeometry {
            station_id: "GS-2".to_string(),
            elevation_deg: 30.0,
            slant_range_km: 10000.0,
            azimuth_deg: 270.0,
            doppler_shift_hz: 0.0,
        });

        // GS-1: Good weather
        neuron.weather_obs.insert("GS-1".to_string(), WeatherObservation {
            station_id: "GS-1".to_string(),
            timestamp: 0,
            fso_score: 0.90,
            cloud_cover_pct: 5.0,
            visibility_km: 50.0,
            precip_probability: 0.02,
        });

        // GS-2: Poor weather
        neuron.weather_obs.insert("GS-2".to_string(), WeatherObservation {
            station_id: "GS-2".to_string(),
            timestamp: 0,
            fso_score: 0.40,
            cloud_cover_pct: 70.0,
            visibility_km: 8.0,
            precip_probability: 0.60,
        });

        let mut tiers = HashMap::new();
        tiers.insert("GS-1".to_string(), 1);
        tiers.insert("GS-2".to_string(), 2);

        let decision = neuron.select_downlink(&tiers);
        assert!(decision.is_some());
        assert_eq!(decision.unwrap().selected_station, "GS-1", "Should select station with better weather");
    }
}
