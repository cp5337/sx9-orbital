//! Neo4j Cypher export for constellation graph
//!
//! Generates Cypher statements to load the graph into Neo4j.
//!
//! # Graph Structure
//!
//! ```text
//! (:GroundStation {id, name, lat, lon, tier, weather_score, zone})
//! (:Satellite {id, name, plane, slot, altitude_km, norad_id})
//!
//! (:GroundStation)-[:FSO_LINK {margin_db, weather_score}]->(:Satellite)
//! (:Satellite)-[:ISL {margin_db, latency_ms}]->(:Satellite)
//! ```

use crate::{ConstellationGraph, ConstellationLink, ConstellationNode, LinkType, NodeType};
use std::io::Write;

/// Generate Cypher CREATE statements for all nodes
pub fn generate_node_cypher(graph: &ConstellationGraph) -> String {
    let mut cypher = String::new();

    // Create constraints first (for indexes)
    cypher.push_str("// Constraints and indexes\n");
    cypher.push_str("CREATE CONSTRAINT IF NOT EXISTS FOR (s:Satellite) REQUIRE s.id IS UNIQUE;\n");
    cypher.push_str("CREATE CONSTRAINT IF NOT EXISTS FOR (g:GroundStation) REQUIRE g.id IS UNIQUE;\n");
    cypher.push_str("CREATE INDEX IF NOT EXISTS FOR (g:GroundStation) ON (g.zone);\n");
    cypher.push_str("CREATE INDEX IF NOT EXISTS FOR (s:Satellite) ON (s.plane);\n\n");

    // Clear existing data
    cypher.push_str("// Clear existing constellation data\n");
    cypher.push_str("MATCH (n:Satellite) DETACH DELETE n;\n");
    cypher.push_str("MATCH (n:GroundStation) DETACH DELETE n;\n\n");

    // Create satellites
    cypher.push_str("// Create satellites\n");
    for node in graph.satellites() {
        if let NodeType::Satellite {
            altitude_km,
            plane_index,
            inclination_deg,
        } = &node.node_type
        {
            cypher.push_str(&format!(
                "CREATE (:Satellite {{id: '{}', name: '{}', latitude: {}, longitude: {}, altitude_km: {}, plane: {}, inclination_deg: {}, epoch: {}}});\n",
                escape_cypher(&node.id),
                escape_cypher(&node.name),
                node.latitude_deg,
                node.longitude_deg,
                altitude_km,
                plane_index,
                inclination_deg,
                node.epoch
            ));
        }
    }

    // Create ground stations
    cypher.push_str("\n// Create ground stations\n");
    for node in graph.ground_stations() {
        if let NodeType::GroundStation {
            tier,
            weather_score,
            fso_capable,
        } = &node.node_type
        {
            let zone = longitude_to_zone(node.longitude_deg);
            cypher.push_str(&format!(
                "CREATE (:GroundStation {{id: '{}', name: '{}', latitude: {}, longitude: {}, tier: {}, weather_score: {}, fso_capable: {}, zone: '{}'}});\n",
                escape_cypher(&node.id),
                escape_cypher(&node.name),
                node.latitude_deg,
                node.longitude_deg,
                tier,
                weather_score,
                fso_capable,
                zone
            ));
        }
    }

    cypher
}

/// Generate Cypher MERGE statements for all links
pub fn generate_link_cypher(graph: &ConstellationGraph) -> String {
    let mut cypher = String::new();
    let mut seen_links = std::collections::HashSet::new();

    cypher.push_str("\n// Create links\n");

    for (source, target, link) in graph.links() {
        // Skip duplicate bidirectional edges
        let link_key = if source.id < target.id {
            format!("{}-{}", source.id, target.id)
        } else {
            format!("{}-{}", target.id, source.id)
        };

        if seen_links.contains(&link_key) {
            continue;
        }
        seen_links.insert(link_key);

        let (rel_type, source_label, target_label) = match link.link_type {
            LinkType::InterSatellite => ("ISL", "Satellite", "Satellite"),
            LinkType::SatelliteToGround => {
                if source.is_satellite() {
                    ("FSO_LINK", "Satellite", "GroundStation")
                } else {
                    ("FSO_LINK", "GroundStation", "Satellite")
                }
            }
            LinkType::Terrestrial => ("TERRESTRIAL", "GroundStation", "GroundStation"),
        };

        cypher.push_str(&format!(
            "MATCH (a:{} {{id: '{}'}}), (b:{} {{id: '{}'}}) CREATE (a)-[:{}{{id: '{}', margin_db: {}, throughput_gbps: {}, latency_ms: {}, active: {}, weather_score: {}}}]->(b);\n",
            source_label,
            escape_cypher(&source.id),
            target_label,
            escape_cypher(&target.id),
            rel_type,
            escape_cypher(&link.id),
            link.margin_db,
            link.throughput_gbps,
            link.latency_ms,
            link.active,
            link.weather_score
        ));
    }

    cypher
}

/// Generate full Cypher script for loading graph
pub fn generate_full_cypher(graph: &ConstellationGraph) -> String {
    let mut cypher = String::new();

    cypher.push_str("// ==============================================\n");
    cypher.push_str("// SX9-Orbital Constellation Graph Import\n");
    cypher.push_str("// Generated by orbital-glaf Neo4j exporter\n");
    cypher.push_str("// ==============================================\n\n");

    cypher.push_str(&generate_node_cypher(graph));
    cypher.push_str(&generate_link_cypher(graph));

    // Add useful queries as comments
    cypher.push_str("\n// ==============================================\n");
    cypher.push_str("// Verification Queries\n");
    cypher.push_str("// ==============================================\n\n");

    cypher.push_str("// Count nodes\n");
    cypher.push_str("// MATCH (s:Satellite) RETURN count(s) AS satellites;\n");
    cypher.push_str("// MATCH (g:GroundStation) RETURN count(g) AS ground_stations;\n\n");

    cypher.push_str("// Find path between two ground stations\n");
    cypher.push_str("// MATCH path = shortestPath((a:GroundStation {name:'Singapore'})-[:FSO_LINK|ISL*]-(b:GroundStation {name:'London'}))\n");
    cypher.push_str("// RETURN path;\n\n");

    cypher.push_str("// Weather-degraded links\n");
    cypher.push_str("// MATCH (g:GroundStation)-[l:FSO_LINK]->(s:Satellite)\n");
    cypher.push_str("// WHERE l.weather_score < 0.5\n");
    cypher.push_str("// RETURN g.name, l.weather_score ORDER BY l.weather_score;\n\n");

    cypher.push_str("// Zone distribution\n");
    cypher.push_str("// MATCH (g:GroundStation) RETURN g.zone, count(g) ORDER BY count(g) DESC;\n");

    cypher
}

/// Write Cypher to file
pub fn write_cypher_file(graph: &ConstellationGraph, path: &std::path::Path) -> std::io::Result<()> {
    let mut file = std::fs::File::create(path)?;
    file.write_all(generate_full_cypher(graph).as_bytes())?;
    Ok(())
}

/// Escape string for Cypher (handle single quotes)
fn escape_cypher(s: &str) -> String {
    s.replace('\'', "\\'").replace('\\', "\\\\")
}

/// Convert longitude to zone name
fn longitude_to_zone(lon: f64) -> &'static str {
    if lon >= -180.0 && lon < -30.0 {
        "Americas"
    } else if lon >= -30.0 && lon < 60.0 {
        "EMEA"
    } else {
        "APAC"
    }
}

/// Generate Cypher for batch import (more efficient for large graphs)
pub fn generate_batch_cypher(graph: &ConstellationGraph) -> String {
    let mut cypher = String::new();

    // Use UNWIND for batch creation
    cypher.push_str("// Batch import - more efficient for large graphs\n\n");

    // Satellites as array
    let satellites: Vec<_> = graph.satellites().collect();
    if !satellites.is_empty() {
        cypher.push_str("// Satellites\n");
        cypher.push_str("UNWIND [\n");
        for (i, node) in satellites.iter().enumerate() {
            if let NodeType::Satellite {
                altitude_km,
                plane_index,
                inclination_deg,
            } = &node.node_type
            {
                cypher.push_str(&format!(
                    "  {{id: '{}', name: '{}', lat: {}, lon: {}, alt: {}, plane: {}, inc: {}}}",
                    escape_cypher(&node.id),
                    escape_cypher(&node.name),
                    node.latitude_deg,
                    node.longitude_deg,
                    altitude_km,
                    plane_index,
                    inclination_deg
                ));
                if i < satellites.len() - 1 {
                    cypher.push(',');
                }
                cypher.push('\n');
            }
        }
        cypher.push_str("] AS sat\n");
        cypher.push_str("CREATE (:Satellite {id: sat.id, name: sat.name, latitude: sat.lat, longitude: sat.lon, altitude_km: sat.alt, plane: sat.plane, inclination_deg: sat.inc});\n\n");
    }

    // Ground stations as array
    let stations: Vec<_> = graph.ground_stations().collect();
    if !stations.is_empty() {
        cypher.push_str("// Ground Stations\n");
        cypher.push_str("UNWIND [\n");
        for (i, node) in stations.iter().enumerate() {
            if let NodeType::GroundStation {
                tier,
                weather_score,
                fso_capable,
            } = &node.node_type
            {
                let zone = longitude_to_zone(node.longitude_deg);
                cypher.push_str(&format!(
                    "  {{id: '{}', name: '{}', lat: {}, lon: {}, tier: {}, wx: {}, fso: {}, zone: '{}'}}",
                    escape_cypher(&node.id),
                    escape_cypher(&node.name),
                    node.latitude_deg,
                    node.longitude_deg,
                    tier,
                    weather_score,
                    fso_capable,
                    zone
                ));
                if i < stations.len() - 1 {
                    cypher.push(',');
                }
                cypher.push('\n');
            }
        }
        cypher.push_str("] AS gs\n");
        cypher.push_str("CREATE (:GroundStation {id: gs.id, name: gs.name, latitude: gs.lat, longitude: gs.lon, tier: gs.tier, weather_score: gs.wx, fso_capable: gs.fso, zone: gs.zone});\n");
    }

    cypher
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_graph() -> ConstellationGraph {
        let mut graph = ConstellationGraph::new();

        // Add satellites
        graph.add_node(ConstellationNode::satellite(
            "HALO-01", "HALO 1-1", 0.0, 0.0, 10500.0, 1, 55.0,
        ));
        graph.add_node(ConstellationNode::satellite(
            "HALO-02", "HALO 1-2", 0.0, 90.0, 10500.0, 1, 55.0,
        ));

        // Add ground station
        graph.add_node(ConstellationNode::ground_station(
            "GS-SIN", "Singapore", 1.3521, 103.8198, 1,
        ));

        // Add links
        graph
            .add_link(
                "HALO-01",
                "HALO-02",
                ConstellationLink::inter_satellite("ISL-1-2", 8.0),
            )
            .unwrap();
        graph
            .add_link(
                "HALO-01",
                "GS-SIN",
                ConstellationLink::satellite_to_ground("SG-1-SIN", 6.0, 0.9),
            )
            .unwrap();

        graph
    }

    #[test]
    fn test_node_cypher_generation() {
        let graph = create_test_graph();
        let cypher = generate_node_cypher(&graph);

        assert!(cypher.contains("CREATE (:Satellite"));
        assert!(cypher.contains("CREATE (:GroundStation"));
        assert!(cypher.contains("HALO-01"));
        assert!(cypher.contains("Singapore"));
    }

    #[test]
    fn test_link_cypher_generation() {
        let graph = create_test_graph();
        let cypher = generate_link_cypher(&graph);

        assert!(cypher.contains("[:ISL"));
        assert!(cypher.contains("[:FSO_LINK"));
        assert!(cypher.contains("margin_db"));
    }

    #[test]
    fn test_full_cypher_generation() {
        let graph = create_test_graph();
        let cypher = generate_full_cypher(&graph);

        assert!(cypher.contains("CREATE CONSTRAINT"));
        assert!(cypher.contains("Verification Queries"));
    }

    #[test]
    fn test_batch_cypher() {
        let graph = create_test_graph();
        let cypher = generate_batch_cypher(&graph);

        assert!(cypher.contains("UNWIND"));
        assert!(cypher.contains("AS sat"));
        assert!(cypher.contains("AS gs"));
    }

    #[test]
    fn test_escape_cypher() {
        assert_eq!(escape_cypher("O'Hare"), "O\\'Hare");
        assert_eq!(escape_cypher("test\\path"), "test\\\\path");
    }
}
