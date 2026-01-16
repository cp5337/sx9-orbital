//! Graph export formats for visualization
//!
//! Supports:
//! - Cytoscape.js format
//! - React Flow format
//! - GraphML (for external tools)

use crate::{ConstellationGraph, ConstellationNode, ConstellationLink, NodeType, LinkType};
use serde::{Serialize, Deserialize};

/// Cytoscape.js element format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CytoscapeElement {
    pub data: CytoscapeData,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<CytoscapePosition>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub classes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CytoscapeData {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub node_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub margin_db: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub altitude_km: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tier: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plane_index: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weather_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CytoscapePosition {
    pub x: f64,
    pub y: f64,
}

/// React Flow node format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReactFlowNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub position: ReactFlowPosition,
    pub data: ReactFlowNodeData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReactFlowPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReactFlowNodeData {
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub altitude_km: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tier: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weather_score: Option<f64>,
}

/// React Flow edge format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReactFlowEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(rename = "type")]
    pub edge_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub animated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<ReactFlowEdgeStyle>,
    pub data: ReactFlowEdgeData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReactFlowEdgeStyle {
    pub stroke: String,
    #[serde(rename = "strokeWidth")]
    pub stroke_width: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReactFlowEdgeData {
    pub margin_db: f64,
    pub throughput_gbps: f64,
    pub active: bool,
}

/// Full React Flow graph export
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReactFlowGraph {
    pub nodes: Vec<ReactFlowNode>,
    pub edges: Vec<ReactFlowEdge>,
}

/// Link margin to color
fn margin_to_color(margin_db: f64) -> String {
    if margin_db >= 6.0 {
        "#22c55e".to_string() // Green
    } else if margin_db >= 3.0 {
        "#eab308".to_string() // Yellow
    } else if margin_db >= 0.0 {
        "#f97316".to_string() // Orange
    } else {
        "#ef4444".to_string() // Red
    }
}

/// Tier to color
fn tier_to_color(tier: u8) -> String {
    match tier {
        1 => "#3b82f6".to_string(), // Blue
        2 => "#10b981".to_string(), // Green
        3 => "#eab308".to_string(), // Yellow
        _ => "#6b7280".to_string(), // Gray
    }
}

/// Plane index to color
fn plane_to_color(plane: u8) -> String {
    let colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
    colors[(plane as usize) % colors.len()].to_string()
}

impl ConstellationGraph {
    /// Export to Cytoscape.js format
    pub fn to_cytoscape(&self) -> Vec<CytoscapeElement> {
        let mut elements = Vec::new();
        let mut seen_edges = std::collections::HashSet::new();

        // Add nodes
        for node in self.graph.node_weights() {
            let (node_type, color, extra) = match &node.node_type {
                NodeType::Satellite { altitude_km, plane_index, .. } => {
                    ("satellite".to_string(), plane_to_color(*plane_index), Some((*altitude_km, *plane_index)))
                }
                NodeType::GroundStation { tier, weather_score, .. } => {
                    ("ground-station".to_string(), tier_to_color(*tier), None)
                }
            };

            let mut data = CytoscapeData {
                id: node.id.clone(),
                label: Some(node.name.clone()),
                source: None,
                target: None,
                node_type: Some(node_type),
                color: Some(color),
                margin_db: None,
                altitude_km: extra.map(|(a, _)| a),
                tier: if let NodeType::GroundStation { tier, .. } = node.node_type { Some(tier) } else { None },
                plane_index: extra.map(|(_, p)| p),
                weather_score: if let NodeType::GroundStation { weather_score, .. } = node.node_type { Some(weather_score) } else { None },
                active: None,
            };

            // Position based on lat/lon (simple mercator)
            let x = (node.longitude_deg + 180.0) * 3.0;
            let y = (90.0 - node.latitude_deg) * 3.0;

            elements.push(CytoscapeElement {
                data,
                position: Some(CytoscapePosition { x, y }),
                classes: None,
            });
        }

        // Add edges (deduplicated - only one direction)
        for (source, target, link) in self.links() {
            let edge_key = if source.id < target.id {
                format!("{}-{}", source.id, target.id)
            } else {
                format!("{}-{}", target.id, source.id)
            };

            if seen_edges.contains(&edge_key) {
                continue;
            }
            seen_edges.insert(edge_key);

            let edge_type = match link.link_type {
                LinkType::InterSatellite => "sat-sat",
                LinkType::SatelliteToGround => "sat-ground",
                LinkType::Terrestrial => "terrestrial",
            };

            elements.push(CytoscapeElement {
                data: CytoscapeData {
                    id: link.id.clone(),
                    label: None,
                    source: Some(source.id.clone()),
                    target: Some(target.id.clone()),
                    node_type: Some(edge_type.to_string()),
                    color: Some(margin_to_color(link.margin_db)),
                    margin_db: Some(link.margin_db),
                    altitude_km: None,
                    tier: None,
                    plane_index: None,
                    weather_score: None,
                    active: Some(link.active),
                },
                position: None,
                classes: None,
            });
        }

        elements
    }

    /// Export to React Flow format
    pub fn to_react_flow(&self) -> ReactFlowGraph {
        let mut nodes = Vec::new();
        let mut edges = Vec::new();
        let mut seen_edges = std::collections::HashSet::new();

        // Add nodes
        for node in self.graph.node_weights() {
            let (node_type, altitude, tier, weather) = match &node.node_type {
                NodeType::Satellite { altitude_km, .. } => {
                    ("satellite", Some(*altitude_km), None, None)
                }
                NodeType::GroundStation { tier, weather_score, .. } => {
                    ("groundStation", None, Some(*tier), Some(*weather_score))
                }
            };

            // Position based on lat/lon
            let x = (node.longitude_deg + 180.0) * 4.0;
            let y = (90.0 - node.latitude_deg) * 4.0;

            nodes.push(ReactFlowNode {
                id: node.id.clone(),
                node_type: node_type.to_string(),
                position: ReactFlowPosition { x, y },
                data: ReactFlowNodeData {
                    label: node.name.clone(),
                    altitude_km: altitude,
                    tier,
                    weather_score: weather,
                },
            });
        }

        // Add edges (deduplicated)
        for (source, target, link) in self.links() {
            let edge_key = if source.id < target.id {
                format!("{}-{}", source.id, target.id)
            } else {
                format!("{}-{}", target.id, source.id)
            };

            if seen_edges.contains(&edge_key) {
                continue;
            }
            seen_edges.insert(edge_key);

            let edge_type = match link.link_type {
                LinkType::InterSatellite => "smoothstep",
                LinkType::SatelliteToGround => "straight",
                LinkType::Terrestrial => "default",
            };

            edges.push(ReactFlowEdge {
                id: link.id.clone(),
                source: source.id.clone(),
                target: target.id.clone(),
                edge_type: edge_type.to_string(),
                animated: Some(link.active),
                style: Some(ReactFlowEdgeStyle {
                    stroke: margin_to_color(link.margin_db),
                    stroke_width: if link.link_type == LinkType::InterSatellite { 3 } else { 2 },
                }),
                data: ReactFlowEdgeData {
                    margin_db: link.margin_db,
                    throughput_gbps: link.throughput_gbps,
                    active: link.active,
                },
            });
        }

        ReactFlowGraph { nodes, edges }
    }

    /// Export to JSON string (Cytoscape format)
    pub fn to_cytoscape_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(&self.to_cytoscape())
    }

    /// Export to JSON string (React Flow format)
    pub fn to_react_flow_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(&self.to_react_flow())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ConstellationGraph;

    #[test]
    fn test_cytoscape_export() {
        let mut graph = ConstellationGraph::new();
        graph.add_node(crate::ConstellationNode::satellite("SAT-1", "Sat 1", 0.0, 0.0, 550.0, 0, 53.0));
        graph.add_node(crate::ConstellationNode::ground_station("GS-1", "Ground 1", 40.0, -74.0, 1));
        graph.add_link("SAT-1", "GS-1", crate::ConstellationLink::satellite_to_ground("SG-1", 6.0, 0.9)).unwrap();

        let elements = graph.to_cytoscape();
        assert_eq!(elements.len(), 3); // 2 nodes + 1 edge

        let json = graph.to_cytoscape_json().unwrap();
        assert!(json.contains("SAT-1"));
        assert!(json.contains("GS-1"));
    }

    #[test]
    fn test_react_flow_export() {
        let mut graph = ConstellationGraph::new();
        graph.add_node(crate::ConstellationNode::satellite("SAT-1", "Sat 1", 0.0, 0.0, 550.0, 0, 53.0));
        graph.add_node(crate::ConstellationNode::ground_station("GS-1", "Ground 1", 40.0, -74.0, 1));
        graph.add_link("SAT-1", "GS-1", crate::ConstellationLink::satellite_to_ground("SG-1", 6.0, 0.9)).unwrap();

        let rf = graph.to_react_flow();
        assert_eq!(rf.nodes.len(), 2);
        assert_eq!(rf.edges.len(), 1);
    }
}
