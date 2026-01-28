//! Orbital GLAF - Graph Layer Analytical Feed
//!
//! Provides graph-based routing and topology analysis for the
//! orbital constellation network:
//!
//! - Constellation topology (satellites + ground stations)
//! - FSO link routing with quality metrics
//! - Path finding through mesh network
//! - Export to visualization formats (Cytoscape, React Flow)

use petgraph::graph::{DiGraph, NodeIndex};
use petgraph::algo::{dijkstra, astar};
use petgraph::visit::EdgeRef;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;

pub mod routing;
pub mod export;

#[cfg(feature = "neo4j")]
pub mod neo4j_client;

// Re-export neo4j module when feature is enabled
#[cfg(feature = "neo4j")]
pub use neo4j_client::{Neo4jClient, Neo4jConfig, Neo4jPath, Neo4jStats, DegradedLink};

/// GLAF errors
#[derive(Error, Debug)]
pub enum GlafError {
    #[error("Node not found: {0}")]
    NodeNotFound(String),
    #[error("Link not found: {0}")]
    LinkNotFound(String),
    #[error("No path found between {0} and {1}")]
    NoPath(String, String),
    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
    #[error("Neo4j error: {0}")]
    Neo4jError(String),
}

pub type Result<T> = std::result::Result<T, GlafError>;

/// Node types in the constellation graph
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum NodeType {
    Satellite {
        altitude_km: f64,
        plane_index: u8,
        inclination_deg: f64,
    },
    GroundStation {
        tier: u8,
        weather_score: f64,
        fso_capable: bool,
    },
}

/// A node in the constellation graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstellationNode {
    pub id: String,
    pub name: String,
    pub node_type: NodeType,
    pub latitude_deg: f64,
    pub longitude_deg: f64,
    /// Current position epoch (unix timestamp)
    pub epoch: i64,
}

impl ConstellationNode {
    pub fn satellite(
        id: impl Into<String>,
        name: impl Into<String>,
        lat: f64,
        lon: f64,
        altitude_km: f64,
        plane_index: u8,
        inclination_deg: f64,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            node_type: NodeType::Satellite {
                altitude_km,
                plane_index,
                inclination_deg,
            },
            latitude_deg: lat,
            longitude_deg: lon,
            epoch: 0,
        }
    }

    pub fn ground_station(
        id: impl Into<String>,
        name: impl Into<String>,
        lat: f64,
        lon: f64,
        tier: u8,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            node_type: NodeType::GroundStation {
                tier,
                weather_score: 1.0,
                fso_capable: true,
            },
            latitude_deg: lat,
            longitude_deg: lon,
            epoch: 0,
        }
    }

    pub fn is_satellite(&self) -> bool {
        matches!(self.node_type, NodeType::Satellite { .. })
    }

    pub fn is_ground_station(&self) -> bool {
        matches!(self.node_type, NodeType::GroundStation { .. })
    }
}

/// Link types in the constellation
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum LinkType {
    /// Inter-satellite link (laser)
    InterSatellite,
    /// Satellite to ground station (downlink/uplink)
    SatelliteToGround,
    /// Ground station to ground station (terrestrial)
    Terrestrial,
}

/// An edge (link) in the constellation graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstellationLink {
    pub id: String,
    pub link_type: LinkType,
    /// Link margin in dB (higher = better)
    pub margin_db: f64,
    /// Current throughput in Gbps
    pub throughput_gbps: f64,
    /// Latency in milliseconds
    pub latency_ms: f64,
    /// Whether link is currently active
    pub active: bool,
    /// Weather impact score (0-1, 1 = no impact)
    pub weather_score: f64,
}

impl ConstellationLink {
    pub fn inter_satellite(id: impl Into<String>, margin_db: f64) -> Self {
        Self {
            id: id.into(),
            link_type: LinkType::InterSatellite,
            margin_db,
            throughput_gbps: 10.0, // Typical FSO throughput
            latency_ms: 0.1,       // ~30km light travel
            active: true,
            weather_score: 1.0,    // No weather in space
        }
    }

    pub fn satellite_to_ground(id: impl Into<String>, margin_db: f64, weather_score: f64) -> Self {
        Self {
            id: id.into(),
            link_type: LinkType::SatelliteToGround,
            margin_db,
            throughput_gbps: 10.0,
            latency_ms: 5.0, // ~500km altitude
            active: true,
            weather_score,
        }
    }

    /// Calculate link cost for routing (lower = better)
    pub fn cost(&self) -> f64 {
        if !self.active {
            return f64::INFINITY;
        }

        // Cost factors:
        // - Inverse of margin (lower margin = higher cost)
        // - Weather impact
        // - Latency
        let margin_factor = 10.0 / self.margin_db.max(0.1);
        let weather_factor = 1.0 / self.weather_score.max(0.1);
        let latency_factor = self.latency_ms / 10.0;

        margin_factor + weather_factor + latency_factor
    }
}

/// The main constellation graph
pub struct ConstellationGraph {
    graph: DiGraph<ConstellationNode, ConstellationLink>,
    node_index: HashMap<String, NodeIndex>,
}

impl ConstellationGraph {
    pub fn new() -> Self {
        Self {
            graph: DiGraph::new(),
            node_index: HashMap::new(),
        }
    }

    /// Add a node to the graph
    pub fn add_node(&mut self, node: ConstellationNode) -> NodeIndex {
        let id = node.id.clone();
        let idx = self.graph.add_node(node);
        self.node_index.insert(id, idx);
        idx
    }

    /// Add a bidirectional link between two nodes
    pub fn add_link(&mut self, from_id: &str, to_id: &str, link: ConstellationLink) -> Result<()> {
        let from_idx = self.node_index.get(from_id)
            .ok_or_else(|| GlafError::NodeNotFound(from_id.to_string()))?;
        let to_idx = self.node_index.get(to_id)
            .ok_or_else(|| GlafError::NodeNotFound(to_id.to_string()))?;

        // Add bidirectional edges
        self.graph.add_edge(*from_idx, *to_idx, link.clone());
        self.graph.add_edge(*to_idx, *from_idx, link);

        Ok(())
    }

    /// Get a node by ID
    pub fn get_node(&self, id: &str) -> Option<&ConstellationNode> {
        self.node_index.get(id).map(|idx| &self.graph[*idx])
    }

    /// Get all satellites
    pub fn satellites(&self) -> impl Iterator<Item = &ConstellationNode> {
        self.graph.node_weights().filter(|n| n.is_satellite())
    }

    /// Get all ground stations
    pub fn ground_stations(&self) -> impl Iterator<Item = &ConstellationNode> {
        self.graph.node_weights().filter(|n| n.is_ground_station())
    }

    /// Find shortest path between two nodes using Dijkstra
    pub fn find_path(&self, from_id: &str, to_id: &str) -> Result<Vec<String>> {
        let from_idx = self.node_index.get(from_id)
            .ok_or_else(|| GlafError::NodeNotFound(from_id.to_string()))?;
        let to_idx = self.node_index.get(to_id)
            .ok_or_else(|| GlafError::NodeNotFound(to_id.to_string()))?;

        // Run Dijkstra
        let result = dijkstra(&self.graph, *from_idx, Some(*to_idx), |e| e.weight().cost());

        if !result.contains_key(to_idx) {
            return Err(GlafError::NoPath(from_id.to_string(), to_id.to_string()));
        }

        // Reconstruct path (Dijkstra gives us costs, need to trace back)
        // For simplicity, use A* which gives us the actual path
        let path = astar(
            &self.graph,
            *from_idx,
            |n| n == *to_idx,
            |e| e.weight().cost(),
            |_| 0.0, // No heuristic (same as Dijkstra)
        );

        match path {
            Some((_, path_nodes)) => {
                Ok(path_nodes.iter()
                    .map(|idx| self.graph[*idx].id.clone())
                    .collect())
            }
            None => Err(GlafError::NoPath(from_id.to_string(), to_id.to_string())),
        }
    }

    /// Calculate total path cost
    pub fn path_cost(&self, path: &[String]) -> f64 {
        let mut total_cost = 0.0;

        for i in 0..path.len().saturating_sub(1) {
            let from_idx = self.node_index.get(&path[i]);
            let to_idx = self.node_index.get(&path[i + 1]);

            if let (Some(from), Some(to)) = (from_idx, to_idx) {
                if let Some(edge) = self.graph.find_edge(*from, *to) {
                    total_cost += self.graph[edge].cost();
                }
            }
        }

        total_cost
    }

    /// Get all links
    pub fn links(&self) -> impl Iterator<Item = (&ConstellationNode, &ConstellationNode, &ConstellationLink)> {
        self.graph.edge_references().map(move |e| {
            let source = &self.graph[e.source()];
            let target = &self.graph[e.target()];
            let link = e.weight();
            (source, target, link)
        })
    }

    /// Update link status
    pub fn update_link(&mut self, from_id: &str, to_id: &str, active: bool, margin_db: Option<f64>) -> Result<()> {
        let from_idx = self.node_index.get(from_id)
            .ok_or_else(|| GlafError::NodeNotFound(from_id.to_string()))?;
        let to_idx = self.node_index.get(to_id)
            .ok_or_else(|| GlafError::NodeNotFound(to_id.to_string()))?;

        if let Some(edge) = self.graph.find_edge(*from_idx, *to_idx) {
            let link = self.graph.edge_weight_mut(edge).unwrap();
            link.active = active;
            if let Some(margin) = margin_db {
                link.margin_db = margin;
            }
        }

        // Update reverse direction too
        if let Some(edge) = self.graph.find_edge(*to_idx, *from_idx) {
            let link = self.graph.edge_weight_mut(edge).unwrap();
            link.active = active;
            if let Some(margin) = margin_db {
                link.margin_db = margin;
            }
        }

        Ok(())
    }

    /// Get graph statistics
    pub fn stats(&self) -> GraphStats {
        let satellites = self.satellites().count();
        let ground_stations = self.ground_stations().count();

        let mut isl_links = 0;
        let mut gs_links = 0;
        let mut active_links = 0;

        for edge in self.graph.edge_references() {
            let link = edge.weight();
            match link.link_type {
                LinkType::InterSatellite => isl_links += 1,
                LinkType::SatelliteToGround => gs_links += 1,
                LinkType::Terrestrial => {}
            }
            if link.active {
                active_links += 1;
            }
        }

        GraphStats {
            total_nodes: self.graph.node_count(),
            satellites,
            ground_stations,
            total_links: self.graph.edge_count() / 2, // Bidirectional
            isl_links: isl_links / 2,
            gs_links: gs_links / 2,
            active_links: active_links / 2,
        }
    }
}

impl Default for ConstellationGraph {
    fn default() -> Self {
        Self::new()
    }
}

/// Graph statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphStats {
    pub total_nodes: usize,
    pub satellites: usize,
    pub ground_stations: usize,
    pub total_links: usize,
    pub isl_links: usize,
    pub gs_links: usize,
    pub active_links: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_graph() -> ConstellationGraph {
        let mut graph = ConstellationGraph::new();

        // Add 4 satellites
        graph.add_node(ConstellationNode::satellite("SAT-1", "Sat 1", 0.0, 0.0, 550.0, 0, 53.0));
        graph.add_node(ConstellationNode::satellite("SAT-2", "Sat 2", 0.0, 90.0, 550.0, 0, 53.0));
        graph.add_node(ConstellationNode::satellite("SAT-3", "Sat 3", 0.0, 180.0, 550.0, 0, 53.0));
        graph.add_node(ConstellationNode::satellite("SAT-4", "Sat 4", 0.0, 270.0, 550.0, 0, 53.0));

        // Add 2 ground stations
        graph.add_node(ConstellationNode::ground_station("GS-1", "Ground 1", 40.0, -74.0, 1));
        graph.add_node(ConstellationNode::ground_station("GS-2", "Ground 2", 51.0, 0.0, 1));

        // Add inter-satellite links
        graph.add_link("SAT-1", "SAT-2", ConstellationLink::inter_satellite("ISL-1-2", 8.0)).unwrap();
        graph.add_link("SAT-2", "SAT-3", ConstellationLink::inter_satellite("ISL-2-3", 8.0)).unwrap();
        graph.add_link("SAT-3", "SAT-4", ConstellationLink::inter_satellite("ISL-3-4", 8.0)).unwrap();
        graph.add_link("SAT-4", "SAT-1", ConstellationLink::inter_satellite("ISL-4-1", 8.0)).unwrap();

        // Add ground links
        graph.add_link("SAT-1", "GS-1", ConstellationLink::satellite_to_ground("SG-1-1", 6.0, 0.9)).unwrap();
        graph.add_link("SAT-2", "GS-2", ConstellationLink::satellite_to_ground("SG-2-2", 6.0, 0.85)).unwrap();

        graph
    }

    #[test]
    fn test_add_nodes() {
        let graph = create_test_graph();
        let stats = graph.stats();

        assert_eq!(stats.satellites, 4);
        assert_eq!(stats.ground_stations, 2);
        assert_eq!(stats.total_nodes, 6);
    }

    #[test]
    fn test_find_path() {
        let graph = create_test_graph();

        // Path from GS-1 to GS-2 should go through satellites
        let path = graph.find_path("GS-1", "GS-2").unwrap();

        assert!(path.len() >= 3); // At least GS-1 -> SAT -> GS-2
        assert_eq!(path.first().unwrap(), "GS-1");
        assert_eq!(path.last().unwrap(), "GS-2");
    }

    #[test]
    fn test_link_cost() {
        let link = ConstellationLink::inter_satellite("test", 10.0);
        assert!(link.cost() < 5.0); // Good margin should have low cost

        let weak_link = ConstellationLink::inter_satellite("test2", 1.0);
        assert!(weak_link.cost() > link.cost()); // Weak link should cost more
    }
}
