//! Neo4j integration test
//!
//! Run with: cargo run --example neo4j_test --features neo4j

use orbital_glaf::{Neo4jClient, Neo4jConfig};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    println!("=== GLAF Neo4j Integration Test ===\n");

    // Connect to Neo4j
    println!("Connecting to Neo4j...");
    let client = Neo4jClient::connect_default().await?;
    println!("Connected!\n");

    // Get stats
    println!("Fetching graph statistics...");
    let stats = client.get_stats().await?;
    println!("  Satellites:       {}", stats.satellites);
    println!("  Ground Stations:  {}", stats.ground_stations);
    println!("  ISL Links:        {}", stats.isl_links);
    println!("  FSO Links:        {}", stats.fso_links);
    println!();

    // Load full graph into memory
    println!("Loading constellation graph into memory...");
    let graph = client.load_constellation_graph().await?;
    let in_memory_stats = graph.stats();
    println!("  In-memory nodes:  {}", in_memory_stats.total_nodes);
    println!("  In-memory links:  {}", in_memory_stats.total_links);
    println!();

    // Test shortest path (if we have data)
    if stats.ground_stations >= 2 {
        println!("Testing shortest path query...");
        // Try to find path between two ground stations
        let result = client
            .shortest_path("GS-Singapore", "GS-London")
            .await;
        match result {
            Ok(path) => {
                println!("  Path found: {} hops", path.nodes.len() - 1);
                println!("  Nodes: {:?}", path.nodes);
                println!("  Total latency: {:.1}ms", path.total_latency_ms);
                println!("  Min margin: {:.1}dB", path.min_margin_db);
            }
            Err(e) => {
                println!("  No path found (might not have these stations): {}", e);
            }
        }
        println!();
    }

    // Check for degraded links
    println!("Checking for weather-degraded links (< 0.7)...");
    let degraded = client.find_degraded_links(0.7).await?;
    if degraded.is_empty() {
        println!("  No degraded links found");
    } else {
        println!("  Found {} degraded links:", degraded.len());
        for link in degraded.iter().take(5) {
            println!(
                "    {} -> {} (weather: {:.2})",
                link.ground_station_name, link.satellite_id, link.weather_score
            );
        }
        if degraded.len() > 5 {
            println!("    ... and {} more", degraded.len() - 5);
        }
    }
    println!();

    println!("=== Test Complete ===");
    Ok(())
}
