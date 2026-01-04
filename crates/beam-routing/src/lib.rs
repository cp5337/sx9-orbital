//! Beam Routing Library
//!
//! ANN/CNN weather-aware routing engine for FSO (Free Space Optical) links.
//! Uses 5-year weather backtest data and HFT-style optimization.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum RoutingError {
    #[error("No viable path found between {0} and {1}")]
    NoPath(String, String),
    #[error("Weather threshold exceeded: {0}")]
    WeatherBlocked(String),
    #[error("Link quality below minimum: {0} < {1}")]
    QualityTooLow(f64, f64),
}

pub type Result<T> = std::result::Result<T, RoutingError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteRequest {
    pub source: String,
    pub destination: String,
    pub priority: RoutePriority,
    pub min_quality: f64,
    pub max_latency_ms: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum RoutePriority {
    Latency,
    Reliability,
    Throughput,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Route {
    pub path: Vec<RouteHop>,
    pub total_latency_ms: f64,
    pub quality_score: f64,
    pub weather_impact: f64,
    pub computed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteHop {
    pub node_id: String,
    pub node_type: NodeType,
    pub link_quality: f64,
    pub hop_latency_ms: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum NodeType {
    GroundStation,
    Satellite,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherData {
    pub station_id: String,
    pub cloud_cover: f64,
    pub visibility_km: f64,
    pub precipitation_mm: f64,
    pub temperature_c: f64,
    pub humidity_pct: f64,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkQuality {
    pub link_id: String,
    pub source: String,
    pub destination: String,
    pub quality_score: f64,
    pub weather_adjusted: bool,
    pub last_updated: DateTime<Utc>,
}

pub struct RoutingEngine {
    min_quality_threshold: f64,
    max_hops: usize,
    weather_weight: f64,
}

impl Default for RoutingEngine {
    fn default() -> Self {
        Self {
            min_quality_threshold: 0.7,
            max_hops: 6,
            weather_weight: 0.3,
        }
    }
}

impl RoutingEngine {
    pub fn new(min_quality: f64, max_hops: usize, weather_weight: f64) -> Self {
        Self {
            min_quality_threshold: min_quality,
            max_hops,
            weather_weight,
        }
    }

    pub fn calculate_route(
        &self,
        request: &RouteRequest,
        link_qualities: &[LinkQuality],
        weather_data: &[WeatherData],
    ) -> Result<Route> {
        // Placeholder for ANN/CNN routing algorithm
        // Real implementation would use trained neural network

        let weather_adjustment = self.compute_weather_impact(weather_data);

        Ok(Route {
            path: vec![
                RouteHop {
                    node_id: request.source.clone(),
                    node_type: NodeType::GroundStation,
                    link_quality: 0.95,
                    hop_latency_ms: 5.0,
                },
                RouteHop {
                    node_id: "SAT-01".to_string(),
                    node_type: NodeType::Satellite,
                    link_quality: 0.92,
                    hop_latency_ms: 35.0,
                },
                RouteHop {
                    node_id: "SAT-02".to_string(),
                    node_type: NodeType::Satellite,
                    link_quality: 0.94,
                    hop_latency_ms: 10.0,
                },
                RouteHop {
                    node_id: request.destination.clone(),
                    node_type: NodeType::GroundStation,
                    link_quality: 0.91,
                    hop_latency_ms: 35.0,
                },
            ],
            total_latency_ms: 85.0,
            quality_score: 0.93,
            weather_impact: weather_adjustment,
            computed_at: Utc::now(),
        })
    }

    fn compute_weather_impact(&self, weather_data: &[WeatherData]) -> f64 {
        if weather_data.is_empty() {
            return 0.0;
        }

        let avg_cloud = weather_data.iter().map(|w| w.cloud_cover).sum::<f64>()
            / weather_data.len() as f64;

        avg_cloud * self.weather_weight
    }
}
