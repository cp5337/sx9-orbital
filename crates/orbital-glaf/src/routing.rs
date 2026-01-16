//! HFT-style route optimization for constellation mesh
//!
//! Uses adjudicator pattern for fast routing decisions:
//! - BUY: High-quality route, commit immediately
//! - SPREAD: Acceptable route, hold for potential better option
//! - SELL: Poor route, discard and find alternative
//!
//! Routes are scored based on:
//! - Link margin (dB) - signal quality
//! - Weather impact - atmospheric conditions
//! - Latency - propagation delay
//! - Hop count - number of links in path

use crate::{ConstellationGraph, ConstellationLink, GlafError, Result};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

/// HFT-style route decision
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RouteDecision {
    /// High confidence route - use immediately
    Buy,
    /// Acceptable route - hold, may improve
    Spread,
    /// Poor route - reject and find alternative
    Sell,
}

/// Route quality thresholds
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteThresholds {
    /// Minimum score for BUY decision (0-1)
    pub buy_threshold: f64,
    /// Minimum score for SPREAD decision (0-1)
    pub spread_threshold: f64,
    /// Maximum acceptable hop count
    pub max_hops: usize,
    /// Minimum link margin (dB)
    pub min_margin_db: f64,
}

impl Default for RouteThresholds {
    fn default() -> Self {
        Self {
            buy_threshold: 0.80,
            spread_threshold: 0.50,
            max_hops: 6,
            min_margin_db: 3.0,
        }
    }
}

/// A scored route through the constellation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoredRoute {
    /// Path as list of node IDs
    pub path: Vec<String>,
    /// Overall route score (0-1)
    pub score: f64,
    /// HFT decision
    pub decision: RouteDecision,
    /// Total latency (ms)
    pub total_latency_ms: f64,
    /// Minimum link margin along path (dB)
    pub min_margin_db: f64,
    /// Average link margin (dB)
    pub avg_margin_db: f64,
    /// Total throughput capacity (Gbps)
    pub throughput_gbps: f64,
    /// Number of hops
    pub hop_count: usize,
    /// Weather impact factor (0-1, 1 = no impact)
    pub weather_factor: f64,
}

/// Route request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteRequest {
    pub source_id: String,
    pub destination_id: String,
    /// Number of alternative routes to find
    pub alternatives: usize,
    /// Custom thresholds (optional)
    pub thresholds: Option<RouteThresholds>,
}

/// Route response with multiple options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteResponse {
    pub request: RouteRequest,
    /// Best route (if any)
    pub best_route: Option<ScoredRoute>,
    /// Alternative routes
    pub alternatives: Vec<ScoredRoute>,
    /// Processing time (microseconds)
    pub processing_time_us: u64,
}

/// HFT Route Optimizer
pub struct RouteOptimizer {
    thresholds: RouteThresholds,
}

impl RouteOptimizer {
    pub fn new() -> Self {
        Self {
            thresholds: RouteThresholds::default(),
        }
    }

    pub fn with_thresholds(thresholds: RouteThresholds) -> Self {
        Self { thresholds }
    }

    /// Calculate route score (0-1)
    fn score_route(&self, path: &[String], graph: &ConstellationGraph) -> Option<ScoredRoute> {
        if path.len() < 2 {
            return None;
        }

        let mut total_latency = 0.0;
        let mut min_margin = f64::MAX;
        let mut total_margin = 0.0;
        let mut min_throughput = f64::MAX;
        let mut weather_product = 1.0;
        let mut link_count = 0;

        // Analyze each link in the path
        for i in 0..path.len() - 1 {
            let from = &path[i];
            let to = &path[i + 1];

            // Find the link
            let link = graph.links()
                .find(|(s, t, _)| {
                    (s.id == *from && t.id == *to) || (s.id == *to && t.id == *from)
                })
                .map(|(_, _, l)| l);

            if let Some(link) = link {
                if !link.active {
                    return None; // Route not viable
                }

                total_latency += link.latency_ms;
                min_margin = min_margin.min(link.margin_db);
                total_margin += link.margin_db;
                min_throughput = min_throughput.min(link.throughput_gbps);
                weather_product *= link.weather_score;
                link_count += 1;
            } else {
                return None; // Link doesn't exist
            }
        }

        if link_count == 0 {
            return None;
        }

        let avg_margin = total_margin / link_count as f64;
        let hop_count = link_count;

        // Calculate composite score (0-1)
        // Weight factors for different metrics
        let margin_weight = 0.35;
        let latency_weight = 0.25;
        let hops_weight = 0.20;
        let weather_weight = 0.20;

        // Normalize components
        let margin_score = (min_margin / 10.0).min(1.0).max(0.0);
        let latency_score = (1.0 - total_latency / 100.0).max(0.0); // 100ms baseline
        let hops_score = (1.0 - (hop_count as f64 / self.thresholds.max_hops as f64)).max(0.0);
        let weather_score = weather_product;

        let score = margin_weight * margin_score
            + latency_weight * latency_score
            + hops_weight * hops_score
            + weather_weight * weather_score;

        // Determine HFT decision
        let decision = if score >= self.thresholds.buy_threshold {
            RouteDecision::Buy
        } else if score >= self.thresholds.spread_threshold {
            RouteDecision::Spread
        } else {
            RouteDecision::Sell
        };

        Some(ScoredRoute {
            path: path.to_vec(),
            score,
            decision,
            total_latency_ms: total_latency,
            min_margin_db: min_margin,
            avg_margin_db: avg_margin,
            throughput_gbps: min_throughput,
            hop_count,
            weather_factor: weather_product,
        })
    }

    /// Find optimal route using HFT adjudication
    pub fn optimize(&self, graph: &ConstellationGraph, request: &RouteRequest) -> Result<RouteResponse> {
        let start = std::time::Instant::now();
        let thresholds = request.thresholds.clone().unwrap_or(self.thresholds.clone());

        // Find the primary shortest path
        let primary_path = graph.find_path(&request.source_id, &request.destination_id)?;
        let primary_route = self.score_route(&primary_path, graph);

        // Find alternative routes using k-shortest paths approach
        let mut alternatives = Vec::new();
        if request.alternatives > 0 {
            // Simple alternative finding: try removing each link from best path
            // and finding new routes
            for i in 0..primary_path.len().saturating_sub(1) {
                // This is a simplified approach - a full implementation would use
                // Yen's k-shortest paths algorithm
                // For now, we just report the primary path
            }
        }

        let processing_time_us = start.elapsed().as_micros() as u64;

        Ok(RouteResponse {
            request: request.clone(),
            best_route: primary_route,
            alternatives,
            processing_time_us,
        })
    }

    /// Quick adjudicate a route - returns decision without full analysis
    #[inline]
    pub fn quick_adjudicate(&self, graph: &ConstellationGraph, source: &str, dest: &str) -> RouteDecision {
        match graph.find_path(source, dest) {
            Ok(path) => {
                match self.score_route(&path, graph) {
                    Some(scored) => scored.decision,
                    None => RouteDecision::Sell,
                }
            }
            Err(_) => RouteDecision::Sell,
        }
    }

    /// Batch optimize multiple routes
    pub fn optimize_batch(
        &self,
        graph: &ConstellationGraph,
        requests: &[RouteRequest],
    ) -> Vec<RouteResponse> {
        requests.iter()
            .map(|req| self.optimize(graph, req).unwrap_or_else(|_| RouteResponse {
                request: req.clone(),
                best_route: None,
                alternatives: Vec::new(),
                processing_time_us: 0,
            }))
            .collect()
    }
}

impl Default for RouteOptimizer {
    fn default() -> Self {
        Self::new()
    }
}

/// Route cache for frequently requested paths
pub struct RouteCache {
    cache: std::collections::HashMap<(String, String), ScoredRoute>,
    max_age_ms: u64,
    timestamps: std::collections::HashMap<(String, String), std::time::Instant>,
}

impl RouteCache {
    pub fn new(max_age_ms: u64) -> Self {
        Self {
            cache: std::collections::HashMap::new(),
            max_age_ms,
            timestamps: std::collections::HashMap::new(),
        }
    }

    pub fn get(&self, source: &str, dest: &str) -> Option<&ScoredRoute> {
        let key = (source.to_string(), dest.to_string());
        if let Some(ts) = self.timestamps.get(&key) {
            if ts.elapsed().as_millis() < self.max_age_ms as u128 {
                return self.cache.get(&key);
            }
        }
        None
    }

    pub fn insert(&mut self, source: &str, dest: &str, route: ScoredRoute) {
        let key = (source.to_string(), dest.to_string());
        self.cache.insert(key.clone(), route);
        self.timestamps.insert(key, std::time::Instant::now());
    }

    pub fn invalidate(&mut self, source: &str, dest: &str) {
        let key = (source.to_string(), dest.to_string());
        self.cache.remove(&key);
        self.timestamps.remove(&key);
    }

    pub fn clear(&mut self) {
        self.cache.clear();
        self.timestamps.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ConstellationNode, ConstellationLink};

    fn create_test_graph() -> ConstellationGraph {
        let mut graph = ConstellationGraph::new();

        graph.add_node(ConstellationNode::satellite("SAT-1", "Sat 1", 0.0, 0.0, 550.0, 0, 53.0));
        graph.add_node(ConstellationNode::satellite("SAT-2", "Sat 2", 0.0, 90.0, 550.0, 0, 53.0));
        graph.add_node(ConstellationNode::ground_station("GS-1", "Ground 1", 40.0, -74.0, 1));
        graph.add_node(ConstellationNode::ground_station("GS-2", "Ground 2", 51.0, 0.0, 1));

        graph.add_link("SAT-1", "SAT-2", ConstellationLink::inter_satellite("ISL-1-2", 8.0)).unwrap();
        graph.add_link("SAT-1", "GS-1", ConstellationLink::satellite_to_ground("SG-1-1", 6.0, 0.9)).unwrap();
        graph.add_link("SAT-2", "GS-2", ConstellationLink::satellite_to_ground("SG-2-2", 6.0, 0.85)).unwrap();

        graph
    }

    #[test]
    fn test_route_optimization() {
        let graph = create_test_graph();
        let optimizer = RouteOptimizer::new();

        let request = RouteRequest {
            source_id: "GS-1".to_string(),
            destination_id: "GS-2".to_string(),
            alternatives: 0,
            thresholds: None,
        };

        let response = optimizer.optimize(&graph, &request).unwrap();
        assert!(response.best_route.is_some());

        let route = response.best_route.unwrap();
        assert!(route.path.len() >= 3); // GS-1 -> SAT -> GS-2
        assert!(route.score > 0.0);
    }

    #[test]
    fn test_quick_adjudicate() {
        let graph = create_test_graph();
        let optimizer = RouteOptimizer::new();

        let decision = optimizer.quick_adjudicate(&graph, "GS-1", "GS-2");
        assert_ne!(decision, RouteDecision::Sell); // Should find a valid route
    }
}
