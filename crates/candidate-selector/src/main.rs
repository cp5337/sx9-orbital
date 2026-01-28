//! Ground Station Selection CLI
//!
//! Selects optimal 247 ground stations from candidate data.
//!
//! Usage:
//!   select-stations --ground-nodes data/all_ground_nodes_backup.json \
//!                   --cable-landings data/cable-infrastructure/cable_landing_complete.json \
//!                   --output data/selected_247_stations.json

use anyhow::Result;
use candidate_selector::{
    loader, scorer, selector, ScorerConfig, DEDUP_THRESHOLD_KM, MIN_SPACING_KM,
};
use clap::Parser;
use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

#[derive(Parser, Debug)]
#[command(
    name = "select-stations",
    about = "Select optimal ground stations for SX9-Orbital constellation"
)]
struct Args {
    /// Path to ground nodes JSON file
    #[arg(short = 'g', long, default_value = "data/all_ground_nodes_backup.json")]
    ground_nodes: PathBuf,

    /// Path to cable landings JSON file
    #[arg(
        short = 'c',
        long,
        default_value = "data/cable-infrastructure/cable_landing_complete.json"
    )]
    cable_landings: PathBuf,

    /// Output JSON file
    #[arg(short, long, default_value = "data/selected_247_stations.json")]
    output: PathBuf,

    /// Also output GeoJSON
    #[arg(long)]
    geojson: bool,

    /// Deduplication threshold in km
    #[arg(long, default_value_t = DEDUP_THRESHOLD_KM)]
    dedup_km: f64,

    /// Minimum spacing between selected stations in km
    #[arg(long, default_value_t = MIN_SPACING_KM)]
    spacing_km: f64,

    /// Verbose output
    #[arg(short, long)]
    verbose: bool,
}

fn main() -> Result<()> {
    let args = Args::parse();

    // Initialize logging
    let level = if args.verbose { Level::DEBUG } else { Level::INFO };
    let subscriber = FmtSubscriber::builder().with_max_level(level).finish();
    tracing::subscriber::set_global_default(subscriber)?;

    info!("{}", "=".repeat(60));
    info!("SX9-Orbital Ground Station Selector");
    info!("{}", "=".repeat(60));

    // Load candidates
    let candidates = loader::load_all_candidates(&args.ground_nodes, &args.cable_landings)?;

    // Deduplicate
    let deduped = selector::deduplicate(candidates, args.dedup_km);

    // Score
    let config = ScorerConfig::default();
    let scored = scorer::score_candidates(deduped, &config);

    info!("Scored {} candidates", scored.len());

    // Show top 10 by score
    let mut sorted = scored.clone();
    sorted.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    info!("\nTop 10 candidates by score:");
    for s in sorted.iter().take(10) {
        info!(
            "  {:.3} | {:40} | {:?}",
            s.score,
            &s.candidate.name[..s.candidate.name.len().min(40)],
            s.candidate.zone
        );
    }

    // Select by zone
    let result = selector::select_by_zone(scored, args.spacing_km)?;

    // Write output
    info!("\nWriting output to {:?}", args.output);
    let file = File::create(&args.output)?;
    let writer = BufWriter::new(file);
    serde_json::to_writer_pretty(writer, &result)?;

    // Write GeoJSON if requested
    if args.geojson {
        let geojson_path = args.output.with_extension("geojson");
        info!("Writing GeoJSON to {:?}", geojson_path);
        let geojson = selector::to_geojson(&result);
        let file = File::create(&geojson_path)?;
        let writer = BufWriter::new(file);
        serde_json::to_writer_pretty(writer, &geojson)?;
    }

    // Summary
    info!("\n{}", "=".repeat(60));
    info!("SUMMARY");
    info!("{}", "=".repeat(60));
    info!("Total selected: {}", result.metadata.total_selected);
    for (zone, count) in &result.metadata.zone_distribution {
        info!("  {}: {} stations", zone, count);
    }

    Ok(())
}
