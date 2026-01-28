//! Neo4j live client for GLAF constellation graph
//!
//! Provides bidirectional sync between petgraph (in-memory) and Neo4j (persistent).
//! Enables routing queries to run on either engine.
//!
//! # Usage
//!
//! ```rust,ignore
//! use orbital_glaf::neo4j_client::Neo4jClient;
//!
//! let client = Neo4jClient::connect("bolt://localhost:7687", "neo4j", "password").await?;
//!
//! // Load graph from Neo4j into memory
//! let graph = client.load_constellation_graph().await?;
//!
//! // Find shortest path using Neo4j's native algorithms
//! let path = client.shortest_path("GS-Singapore", "GS-London").await?;
//!
//! // Run routing with k-shortest paths
//! let paths = client.k_shortest_paths("GS-NYC", "GS-Tokyo", 3).await?;
//! ```

#[cfg(feature = "neo4j")]
use neo4rs::{query, Graph};

use crate::{ConstellationGraph, ConstellationLink, ConstellationNode, GlafError, Result};
use serde::{Deserialize, Serialize};

/// Neo4j connection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Neo4jConfig {
    pub uri: String,
    pub username: String,
    pub password: String,
    pub database: Option<String>,
    pub max_connections: u32,
}

impl Default for Neo4jConfig {
    fn default() -> Self {
        Self {
            uri: "bolt://localhost:7687".to_string(),
            username: "neo4j".to_string(),
            password: "sx9-neo4j-dev".to_string(),
            database: None,
            max_connections: 10,
        }
    }
}

/// Path result from Neo4j routing query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Neo4jPath {
    /// Node IDs in order
    pub nodes: Vec<String>,
    /// Link IDs in order
    pub links: Vec<String>,
    /// Total path cost
    pub total_cost: f64,
    /// Total latency (ms)
    pub total_latency_ms: f64,
    /// Minimum margin along path (dB)
    pub min_margin_db: f64,
}

/// Live Neo4j client for constellation graph operations
#[cfg(feature = "neo4j")]
pub struct Neo4jClient {
    graph: Graph,
    #[allow(dead_code)]
    config: Neo4jConfig,
}

#[cfg(feature = "neo4j")]
impl Neo4jClient {
    /// Connect to Neo4j database
    pub async fn connect(config: Neo4jConfig) -> Result<Self> {
        let graph = Graph::new(&config.uri, &config.username, &config.password)
            .await
            .map_err(|e| GlafError::Neo4jError(format!("Connection failed: {}", e)))?;

        Ok(Self { graph, config })
    }

    /// Connect with default configuration (localhost, sx9-neo4j-dev password)
    pub async fn connect_default() -> Result<Self> {
        Self::connect(Neo4jConfig::default()).await
    }

    /// Load constellation graph from Neo4j into memory (petgraph)
    pub async fn load_constellation_graph(&self) -> Result<ConstellationGraph> {
        let mut graph = ConstellationGraph::new();

        // Load satellites
        let mut result = self
            .graph
            .execute(query(
                "MATCH (s:Satellite) RETURN s.id as id, s.name as name,
                 s.latitude as lat, s.longitude as lon, s.altitude_km as alt,
                 s.plane as plane, s.inclination_deg as inc, s.epoch as epoch",
            ))
            .await
            .map_err(|e| GlafError::Neo4jError(format!("Query failed: {}", e)))?;

        while let Some(row) = result
            .next()
            .await
            .map_err(|e| GlafError::Neo4jError(format!("Row fetch failed: {}", e)))?
        {
            let id: String = row.get("id").unwrap_or_default();
            let name: String = row.get("name").unwrap_or_default();
            let lat: f64 = row.get("lat").unwrap_or(0.0);
            let lon: f64 = row.get("lon").unwrap_or(0.0);
            let alt: f64 = row.get("alt").unwrap_or(550.0);
            let plane: i64 = row.get("plane").unwrap_or(0);
            let inc: f64 = row.get("inc").unwrap_or(53.0);

            graph.add_node(ConstellationNode::satellite(
                &id, &name, lat, lon, alt, plane as u8, inc,
            ));
        }

        // Load ground stations
        let mut result = self
            .graph
            .execute(query(
                "MATCH (g:GroundStation) RETURN g.id as id, g.name as name,
                 g.latitude as lat, g.longitude as lon, g.tier as tier,
                 g.weather_score as wx, g.fso_capable as fso",
            ))
            .await
            .map_err(|e| GlafError::Neo4jError(format!("Query failed: {}", e)))?;

        while let Some(row) = result
            .next()
            .await
            .map_err(|e| GlafError::Neo4jError(format!("Row fetch failed: {}", e)))?
        {
            let id: String = row.get("id").unwrap_or_default();
            let name: String = row.get("name").unwrap_or_default();
            let lat: f64 = row.get("lat").unwrap_or(0.0);
            let lon: f64 = row.get("lon").unwrap_or(0.0);
            let tier: i64 = row.get("tier").unwrap_or(1);

            graph.add_node(ConstellationNode::ground_station(
                &id, &name, lat, lon, tier as u8,
            ));
        }

        // Load ISL links
        let mut result = self
            .graph
            .execute(query(
                "MATCH (a:Satellite)-[r:ISL]->(b:Satellite)
                 RETURN a.id as from_id, b.id as to_id, r.id as link_id,
                 r.margin_db as margin, r.latency_ms as latency,
                 r.throughput_gbps as throughput, r.active as active",
            ))
            .await
            .map_err(|e| GlafError::Neo4jError(format!("Query failed: {}", e)))?;

        while let Some(row) = result
            .next()
            .await
            .map_err(|e| GlafError::Neo4jError(format!("Row fetch failed: {}", e)))?
        {
            let from_id: String = row.get("from_id").unwrap_or_default();
            let to_id: String = row.get("to_id").unwrap_or_default();
            let link_id: String = row.get("link_id").unwrap_or_default();
            let margin: f64 = row.get("margin").unwrap_or(8.0);

            let _ = graph.add_link(
                &from_id,
                &to_id,
                ConstellationLink::inter_satellite(&link_id, margin),
            );
        }

        // Load FSO links
        let mut result = self
            .graph
            .execute(query(
                "MATCH (a)-[r:FSO_LINK]->(b)
                 RETURN a.id as from_id, b.id as to_id, r.id as link_id,
                 r.margin_db as margin, r.weather_score as wx",
            ))
            .await
            .map_err(|e| GlafError::Neo4jError(format!("Query failed: {}", e)))?;

        while let Some(row) = result
            .next()
            .await
            .map_err(|e| GlafError::Neo4jError(format!("Row fetch failed: {}", e)))?
        {
            let from_id: String = row.get("from_id").unwrap_or_default();
            let to_id: String = row.get("to_id").unwrap_or_default();
            let link_id: String = row.get("link_id").unwrap_or_default();
            let margin: f64 = row.get("margin").unwrap_or(6.0);
            let wx: f64 = row.get("wx").unwrap_or(0.9);

            let _ = graph.add_link(
                &from_id,
                &to_id,
                ConstellationLink::satellite_to_ground(&link_id, margin, wx),
            );
        }

        Ok(graph)
    }

    /// Find shortest path using Neo4j's native algorithm
    pub async fn shortest_path(&self, from_id: &str, to_id: &str) -> Result<Neo4jPath> {
        let cypher = format!(
            r#"
            MATCH (start {{id: '{}'}}), (end {{id: '{}'}})
            MATCH path = shortestPath((start)-[:FSO_LINK|ISL*]-(end))
            WITH path, relationships(path) as rels
            RETURN [n in nodes(path) | n.id] as node_ids,
                   [r in rels | r.id] as link_ids,
                   reduce(cost = 0.0, r in rels | cost + coalesce(r.latency_ms, 5.0)) as total_latency,
                   reduce(margin = 100.0, r in rels |
                          CASE WHEN r.margin_db < margin THEN r.margin_db ELSE margin END) as min_margin
            "#,
            from_id, to_id
        );

        let mut result = self
            .graph
            .execute(query(&cypher))
            .await
            .map_err(|e| GlafError::Neo4jError(format!("Query failed: {}", e)))?;

        if let Some(row) = result
            .next()
            .await
            .map_err(|e| GlafError::Neo4jError(format!("Row fetch failed: {}", e)))?
        {
            let nodes: Vec<String> = row.get("node_ids").unwrap_or_default();
            let links: Vec<String> = row.get("link_ids").unwrap_or_default();
            let total_latency: f64 = row.get("total_latency").unwrap_or(0.0);
            let min_margin: f64 = row.get("min_margin").unwrap_or(0.0);

            Ok(Neo4jPath {
                nodes,
                links,
                total_cost: total_latency / 10.0 + (10.0 / min_margin.max(0.1)),
                total_latency_ms: total_latency,
                min_margin_db: min_margin,
            })
        } else {
            Err(GlafError::NoPath(from_id.to_string(), to_id.to_string()))
        }
    }

    /// Find k-shortest paths using Yen's algorithm (via Neo4j GDS if available)
    /// Falls back to multiple queries with link removal if GDS not installed
    pub async fn k_shortest_paths(
        &self,
        from_id: &str,
        to_id: &str,
        k: usize,
    ) -> Result<Vec<Neo4jPath>> {
        // Try Neo4j GDS first (if installed)
        let gds_result = self.k_shortest_paths_gds(from_id, to_id, k).await;
        if gds_result.is_ok() {
            return gds_result;
        }

        // Fallback: iterative shortest path with exclusions
        self.k_shortest_paths_iterative(from_id, to_id, k).await
    }

    /// K-shortest paths using Neo4j Graph Data Science library
    async fn k_shortest_paths_gds(
        &self,
        from_id: &str,
        to_id: &str,
        k: usize,
    ) -> Result<Vec<Neo4jPath>> {
        let cypher = format!(
            r#"
            MATCH (source {{id: '{}'}}), (target {{id: '{}'}})
            CALL gds.shortestPath.yens.stream('constellation', {{
                sourceNode: source,
                targetNode: target,
                k: {},
                relationshipWeightProperty: 'latency_ms'
            }})
            YIELD index, totalCost, nodeIds, costs
            RETURN index, totalCost,
                   [nodeId IN nodeIds | gds.util.asNode(nodeId).id] AS nodeNames
            ORDER BY totalCost
            "#,
            from_id, to_id, k
        );

        let mut result = self
            .graph
            .execute(query(&cypher))
            .await
            .map_err(|e| GlafError::Neo4jError(format!("GDS query failed: {}", e)))?;

        let mut paths = Vec::new();
        while let Some(row) = result
            .next()
            .await
            .map_err(|e| GlafError::Neo4jError(format!("Row fetch failed: {}", e)))?
        {
            let nodes: Vec<String> = row.get("nodeNames").unwrap_or_default();
            let total_cost: f64 = row.get("totalCost").unwrap_or(0.0);

            paths.push(Neo4jPath {
                nodes,
                links: Vec::new(), // GDS doesn't return relationship IDs directly
                total_cost,
                total_latency_ms: total_cost,
                min_margin_db: 0.0,
            });
        }

        if paths.is_empty() {
            Err(GlafError::NoPath(from_id.to_string(), to_id.to_string()))
        } else {
            Ok(paths)
        }
    }

    /// Iterative k-shortest paths (fallback when GDS not available)
    async fn k_shortest_paths_iterative(
        &self,
        from_id: &str,
        to_id: &str,
        k: usize,
    ) -> Result<Vec<Neo4jPath>> {
        let mut paths = Vec::new();
        let mut excluded_links: Vec<String> = Vec::new();

        for _ in 0..k {
            // Build exclusion clause
            let exclusion = if excluded_links.is_empty() {
                String::new()
            } else {
                format!(
                    "WHERE NOT r.id IN [{}]",
                    excluded_links
                        .iter()
                        .map(|id| format!("'{}'", id))
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            };

            let cypher = format!(
                r#"
                MATCH (start {{id: '{}'}}), (end {{id: '{}'}})
                MATCH path = shortestPath((start)-[r:FSO_LINK|ISL*]-(end))
                {}
                WITH path, relationships(path) as rels
                RETURN [n in nodes(path) | n.id] as node_ids,
                       [r in rels | r.id] as link_ids,
                       reduce(cost = 0.0, r in rels | cost + coalesce(r.latency_ms, 5.0)) as total_latency,
                       reduce(margin = 100.0, r in rels |
                              CASE WHEN r.margin_db < margin THEN r.margin_db ELSE margin END) as min_margin
                "#,
                from_id, to_id, exclusion
            );

            let mut result = self
                .graph
                .execute(query(&cypher))
                .await
                .map_err(|e| GlafError::Neo4jError(format!("Query failed: {}", e)))?;

            if let Some(row) = result
                .next()
                .await
                .map_err(|e| GlafError::Neo4jError(format!("Row fetch failed: {}", e)))?
            {
                let nodes: Vec<String> = row.get("node_ids").unwrap_or_default();
                let links: Vec<String> = row.get("link_ids").unwrap_or_default();
                let total_latency: f64 = row.get("total_latency").unwrap_or(0.0);
                let min_margin: f64 = row.get("min_margin").unwrap_or(0.0);

                // Add first link to exclusion for next iteration
                if let Some(first_link) = links.first() {
                    excluded_links.push(first_link.clone());
                }

                paths.push(Neo4jPath {
                    nodes,
                    links,
                    total_cost: total_latency / 10.0 + (10.0 / min_margin.max(0.1)),
                    total_latency_ms: total_latency,
                    min_margin_db: min_margin,
                });
            } else {
                break; // No more paths found
            }
        }

        if paths.is_empty() {
            Err(GlafError::NoPath(from_id.to_string(), to_id.to_string()))
        } else {
            Ok(paths)
        }
    }

    /// Update link status in Neo4j (for Monte Carlo simulation)
    pub async fn update_link_status(
        &self,
        link_id: &str,
        active: bool,
        margin_db: Option<f64>,
    ) -> Result<()> {
        let margin_clause = margin_db
            .map(|m| format!(", r.margin_db = {}", m))
            .unwrap_or_default();

        let cypher = format!(
            "MATCH ()-[r {{id: '{}'}}]->() SET r.active = {} {} RETURN count(r)",
            link_id, active, margin_clause
        );

        self.graph
            .execute(query(&cypher))
            .await
            .map_err(|e| GlafError::Neo4jError(format!("Update failed: {}", e)))?;

        Ok(())
    }

    /// Get graph statistics from Neo4j
    pub async fn get_stats(&self) -> Result<Neo4jStats> {
        let cypher = r#"
            MATCH (s:Satellite) WITH count(s) as satellites
            MATCH (g:GroundStation) WITH satellites, count(g) as ground_stations
            MATCH ()-[isl:ISL]->() WITH satellites, ground_stations, count(isl)/2 as isl_count
            MATCH ()-[fso:FSO_LINK]->() WITH satellites, ground_stations, isl_count, count(fso)/2 as fso_count
            RETURN satellites, ground_stations, isl_count, fso_count
        "#;

        let mut result = self
            .graph
            .execute(query(cypher))
            .await
            .map_err(|e| GlafError::Neo4jError(format!("Stats query failed: {}", e)))?;

        if let Some(row) = result
            .next()
            .await
            .map_err(|e| GlafError::Neo4jError(format!("Row fetch failed: {}", e)))?
        {
            Ok(Neo4jStats {
                satellites: row.get::<i64>("satellites").unwrap_or(0) as usize,
                ground_stations: row.get::<i64>("ground_stations").unwrap_or(0) as usize,
                isl_links: row.get::<i64>("isl_count").unwrap_or(0) as usize,
                fso_links: row.get::<i64>("fso_count").unwrap_or(0) as usize,
            })
        } else {
            Ok(Neo4jStats::default())
        }
    }

    /// Find weather-impacted links below threshold
    pub async fn find_degraded_links(&self, weather_threshold: f64) -> Result<Vec<DegradedLink>> {
        let cypher = format!(
            r#"
            MATCH (g:GroundStation)-[r:FSO_LINK]->(s:Satellite)
            WHERE r.weather_score < {}
            RETURN g.id as gs_id, g.name as gs_name, s.id as sat_id,
                   r.id as link_id, r.weather_score as weather, r.margin_db as margin
            ORDER BY r.weather_score
            "#,
            weather_threshold
        );

        let mut result = self
            .graph
            .execute(query(&cypher))
            .await
            .map_err(|e| GlafError::Neo4jError(format!("Query failed: {}", e)))?;

        let mut links = Vec::new();
        while let Some(row) = result
            .next()
            .await
            .map_err(|e| GlafError::Neo4jError(format!("Row fetch failed: {}", e)))?
        {
            links.push(DegradedLink {
                link_id: row.get("link_id").unwrap_or_default(),
                ground_station_id: row.get("gs_id").unwrap_or_default(),
                ground_station_name: row.get("gs_name").unwrap_or_default(),
                satellite_id: row.get("sat_id").unwrap_or_default(),
                weather_score: row.get("weather").unwrap_or(0.0),
                margin_db: row.get("margin").unwrap_or(0.0),
            })
        }

        Ok(links)
    }
}

/// Neo4j graph statistics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Neo4jStats {
    pub satellites: usize,
    pub ground_stations: usize,
    pub isl_links: usize,
    pub fso_links: usize,
}

/// Weather-degraded link info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DegradedLink {
    pub link_id: String,
    pub ground_station_id: String,
    pub ground_station_name: String,
    pub satellite_id: String,
    pub weather_score: f64,
    pub margin_db: f64,
}

// Add Neo4j error variant
impl From<String> for GlafError {
    fn from(s: String) -> Self {
        GlafError::Neo4jError(s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_default() {
        let config = Neo4jConfig::default();
        assert_eq!(config.uri, "bolt://localhost:7687");
        assert_eq!(config.password, "sx9-neo4j-dev");
    }

    #[cfg(feature = "neo4j")]
    #[tokio::test]
    async fn test_connection() {
        // Only runs if Neo4j is available
        if let Ok(client) = Neo4jClient::connect_default().await {
            let stats = client.get_stats().await;
            assert!(stats.is_ok());
        }
    }
}
