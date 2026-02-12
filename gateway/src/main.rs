use anyhow::Result;
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::{cors::CorsLayer, services::ServeDir};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

// Import ground station types
use ground_station_wasm::{
    calculate_look_angles,
    downselect::{Downselect, DownselectSummary, ScoringWeights},
    stations::{load_strategic_stations, NetworkStation, StationStats},
};
use ground_stations::StationRegistry;

// Import orbital crates
use orbital_glaf::{
    satellite_ann::{ConstellationANN, LinkGeometry},
    ConstellationGraph, ConstellationLink, ConstellationNode,
};
use orbital_mechanics::walker::WalkerDelta;

mod ann_routes;
mod beam_profile;
mod entropy_harvester;
mod memory;
mod nats_telemetry;
mod realtime;
mod realtime_routes;
mod routes;
mod sim_state;
mod state_routes;
mod tle_generator;
mod weather_routes;

use nats_telemetry::NatsTelemetry;
use weather_routes::WeatherState;

#[derive(Clone)]
pub struct AppState {
    pub constellation: Arc<ConstellationState>,
    pub strategic_stations: Arc<Vec<NetworkStation>>,
    pub station_registry: Arc<StationRegistry>,
    pub telemetry: Arc<RwLock<NatsTelemetry>>,
    pub ann: Arc<RwLock<ConstellationANN>>,
    pub graph: Arc<RwLock<ConstellationGraph>>,
}

pub struct ConstellationState {
    pub satellites: Vec<orbital_mechanics::Satellite>,
    pub ground_stations: Vec<ground_stations::GroundStation>,
}

// Strategic stations response
#[derive(Serialize)]
pub struct StrategicStationsResponse {
    pub stations: Vec<NetworkStation>,
    pub stats: StationStats,
}

// Downselect request
#[derive(Deserialize)]
pub struct DownselectRequest {
    pub weights: Option<ScoringWeights>,
    pub top_n: Option<usize>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "orbital_gateway=debug,info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // ---- Generate HALO constellation TLEs ----
    let walker = WalkerDelta::halo_constellation();
    let satellites = walker.generate_satellites();
    tracing::info!(
        "   Generated {} HALO constellation TLEs (NORAD {}-{})",
        satellites.len(),
        satellites.first().map(|s| s.norad_id).unwrap_or(0),
        satellites.last().map(|s| s.norad_id).unwrap_or(0),
    );

    // ---- Propagate all satellites to current time ----
    let now = Utc::now();
    let mut sat_positions: Vec<(String, f64, f64, f64)> = Vec::new(); // (id, lat, lon, alt)
    for sat in &satellites {
        match sat.ground_track(now) {
            Ok(pos) => {
                sat_positions.push((sat.id.clone(), pos.latitude, pos.longitude, pos.altitude_km));
                tracing::debug!(
                    "   {} → {:.2}°N {:.2}°E alt={:.0}km",
                    sat.id,
                    pos.latitude,
                    pos.longitude,
                    pos.altitude_km
                );
            }
            Err(e) => {
                tracing::warn!("   Failed to propagate {}: {}", sat.id, e);
            }
        }
    }
    tracing::info!(
        "   Propagated {}/{} satellites to current time",
        sat_positions.len(),
        satellites.len()
    );

    // ---- Load strategic stations ----
    let strategic_stations = load_strategic_stations();
    tracing::info!("   Loaded {} strategic stations", strategic_stations.len());

    let station_registry = StationRegistry::with_fso_network();

    // ---- Build ConstellationGraph ----
    let graph = build_constellation_graph(&sat_positions, &strategic_stations);
    let stats = graph.stats();
    tracing::info!(
        "   ConstellationGraph: {} nodes ({} sats, {} stations), {} links ({} ISL, {} ground)",
        stats.total_nodes,
        stats.satellites,
        stats.ground_stations,
        stats.total_links,
        stats.isl_links,
        stats.gs_links
    );

    // ---- Initialize ConstellationANN ----
    let ann = build_constellation_ann(&sat_positions, &strategic_stations);
    tracing::info!(
        "   ConstellationANN initialized with {} neurons",
        ann.satellites.len()
    );

    // ---- Initialize memory system (optional — agent memory, not orbital) ----
    let memory_db_path = std::env::var("ORBITAL_MEMORY_PATH")
        .unwrap_or_else(|_| ".orbital-memory".to_string());
    let memory_state = match memory::MemoryState::new(&memory_db_path) {
        Ok(state) => {
            tracing::info!("   Memory system initialized at {}", memory_db_path);
            Some(state)
        }
        Err(e) => {
            tracing::warn!("   Memory system unavailable: {} (non-fatal)", e);
            None
        }
    };

    // ---- Initialize NATS telemetry ----
    let telemetry = NatsTelemetry::new().await;
    let nats_connected = telemetry.is_connected().await;
    tracing::info!(
        "   NATS telemetry: {}",
        if nats_connected {
            "connected"
        } else {
            "offline mode"
        }
    );

    let strategic_stations_arc = Arc::new(strategic_stations);

    let state = AppState {
        constellation: Arc::new(ConstellationState {
            satellites,
            ground_stations: Vec::new(),
        }),
        strategic_stations: strategic_stations_arc.clone(),
        station_registry: Arc::new(station_registry),
        telemetry: Arc::new(RwLock::new(telemetry)),
        ann: Arc::new(RwLock::new(ann)),
        graph: Arc::new(RwLock::new(graph)),
    };

    // ---- Weather API state ----
    let weather_state = Arc::new(RwLock::new(WeatherState::new(strategic_stations_arc.clone())));
    tracing::info!("   Weather API: Open-Meteo (free)");

    // ---- Build routers ----
    let weather_router = weather_routes::weather_router(weather_state);
    let ann_router = ann_routes::ann_router();

    // ---- Simulation state ----
    let sim_state = state_routes::SimState::new();
    let state_router = state_routes::state_routes(sim_state);
    tracing::info!("   Simulation state: lock-free (Zone A/B compliant)");

    // Constellation API routes
    let constellation_routes = Router::new()
        .route("/satellites", get(routes::list_satellites))
        .route("/satellites/positions", get(routes::get_bulk_positions))
        .route("/satellites/{id}/position", get(routes::get_position))
        .route("/ground-stations", get(routes::list_ground_stations))
        .route("/strategic-stations", get(list_strategic_stations))
        .route("/strategic-stations/downselect", post(run_downselect))
        .route("/tle", get(routes::get_all_tles))
        .route("/tle/{norad_id}", get(routes::get_tle_by_norad))
        .route("/routing/optimal", post(routes::calculate_route))
        .route("/collision/check", post(routes::check_collision))
        .with_state(state.clone());

    // ANN routes (need AppState)
    let ann_routes = Router::new()
        .nest("/ann", ann_router)
        .with_state(state.clone());

    // Real-time data routes (CelesTrak TLE, collision avoidance, weather sync)
    let realtime_router = realtime_routes::realtime_routes();
    tracing::info!("   Real-time data: CelesTrak TLE, SOCRATES collision");

    // Combine all routes
    let mut api_routes = Router::new()
        .route("/health", get(health))
        .nest("/api/v1", constellation_routes)
        .nest("/api/v1", ann_routes)
        .nest("/api/v1/weather", weather_router)
        .nest("/api/v1/state", state_router)
        .nest("/api/v1/realtime", realtime_router);

    if let Some(mem) = memory_state {
        api_routes = api_routes.nest("/api/v1/memory", memory::memory_routes(mem));
    }

    let api_routes = api_routes.layer(CorsLayer::permissive());

    // Static file serving for UI
    let ui_path = std::path::Path::new("ui/cesium-orbital/dist");
    let app = if ui_path.exists() {
        tracing::info!("   Serving UI from {}", ui_path.display());
        api_routes.nest_service("/", ServeDir::new(ui_path))
    } else {
        tracing::warn!("   UI not built - run 'npm run build' in ui/cesium-orbital");
        api_routes
    };

    // ---- Background re-propagation task (every 30s) ----
    let bg_state = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
        loop {
            interval.tick().await;
            update_positions(&bg_state).await;
        }
    });

    // Start NATS telemetry publisher
    let telemetry_state = state.telemetry.clone();
    tokio::spawn(async move {
        let telemetry = telemetry_state.read().await;
        if let Err(e) = telemetry.run().await {
            tracing::error!("Telemetry publisher error: {}", e);
        }
    });

    // ---- Start server ----
    let port = std::env::var("ORBITAL_GATEWAY_PORT")
        .or_else(|_| std::env::var("PORT"))
        .unwrap_or_else(|_| "18700".to_string());
    let addr = format!("0.0.0.0:{}", port);

    tracing::info!("🛰️  Orbital Gateway starting on {}", addr);
    tracing::info!("   Constellation: HALO (12 MEO satellites)");
    tracing::info!("   Ground stations: 257 FSO");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

// ---- Graph construction ----

fn build_constellation_graph(
    sat_positions: &[(String, f64, f64, f64)],
    stations: &[NetworkStation],
) -> ConstellationGraph {
    let mut graph = ConstellationGraph::new();

    // Greek alphabet satellite IDs (matches orbital-mechanics walker)
    const GREEK_IDS: [&str; 12] = [
        "alpha", "beta", "gamma", "delta",
        "epsilon", "zeta", "eta", "theta",
        "iota", "kappa", "lambda", "mu",
    ];

    // Add satellite nodes
    for (i, (id, lat, lon, alt)) in sat_positions.iter().enumerate() {
        let plane_idx = (i / 4) as u8;

        graph.add_node(ConstellationNode::satellite(
            id.clone(),
            id.clone(),
            *lat,
            *lon,
            *alt,
            plane_idx,
            55.0,
        ));
    }

    // Add ground station nodes (top stations by tier)
    for station in stations.iter().take(50) {
        let tier = station_tier(station);
        graph.add_node(ConstellationNode::ground_station(
            &station.config.id,
            &station.config.name,
            station.config.latitude_deg,
            station.config.longitude_deg,
            tier,
        ));
    }

    // Add intra-plane ISL links (ring topology per plane)
    for plane in 0..3usize {
        let sats_per_plane = 4usize;
        for slot in 0..sats_per_plane {
            let from_idx = plane * sats_per_plane + slot;
            let to_idx = plane * sats_per_plane + (slot + 1) % sats_per_plane;

            let _ = graph.add_link(
                GREEK_IDS[from_idx],
                GREEK_IDS[to_idx],
                ConstellationLink::inter_satellite(
                    format!("ISL-{}-{}", GREEK_IDS[from_idx], GREEK_IDS[to_idx]),
                    8.0,
                ),
            );
        }
    }

    // Add cross-plane ISL links (adjacent planes, same slot index)
    for slot in 0..4usize {
        for plane in 0..3usize {
            let next_plane = (plane + 1) % 3;
            let from_idx = plane * 4 + slot;
            let to_idx = next_plane * 4 + slot;

            let _ = graph.add_link(
                GREEK_IDS[from_idx],
                GREEK_IDS[to_idx],
                ConstellationLink::inter_satellite(
                    format!("ISL-X-{}-{}", GREEK_IDS[from_idx], GREEK_IDS[to_idx]),
                    6.0, // Cross-plane links have lower margin
                ),
            );
        }
    }

    // Add satellite-to-ground links based on visibility
    for (sat_id, sat_lat, sat_lon, sat_alt) in sat_positions {
        for station in stations.iter().take(50) {
            let angles = calculate_look_angles(
                station.config.latitude_deg,
                station.config.longitude_deg,
                station.config.altitude_m / 1000.0,
                *sat_lat,
                *sat_lon,
                *sat_alt,
            );

            if angles.elevation_deg >= 5.0 {
                let weather_score = 0.85; // Default weather
                let margin = 3.0 + (angles.elevation_deg / 90.0) * 7.0; // 3-10 dB based on elevation

                let _ = graph.add_link(
                    sat_id,
                    &station.config.id,
                    ConstellationLink::satellite_to_ground(
                        format!("SG-{}-{}", sat_id, station.config.id),
                        margin,
                        weather_score,
                    ),
                );
            }
        }
    }

    graph
}

// ---- ANN construction ----

fn build_constellation_ann(
    sat_positions: &[(String, f64, f64, f64)],
    stations: &[NetworkStation],
) -> ConstellationANN {
    let mut ann = ConstellationANN::new();

    // Add satellite neurons
    for (id, lat, lon, alt) in sat_positions {
        ann.add_satellite(id, id, *lat, *lon, *alt);
    }

    // Set station tiers
    for station in stations.iter().take(50) {
        let tier = station_tier(station);
        ann.station_tiers
            .insert(station.config.id.clone(), tier);
    }

    // Compute visible stations for each satellite neuron
    for (sat_id, sat_lat, sat_lon, sat_alt) in sat_positions {
        if let Some(neuron) = ann.satellites.get_mut(sat_id.as_str()) {
            for station in stations.iter().take(50) {
                let angles = calculate_look_angles(
                    station.config.latitude_deg,
                    station.config.longitude_deg,
                    station.config.altitude_m / 1000.0,
                    *sat_lat,
                    *sat_lon,
                    *sat_alt,
                );

                if angles.elevation_deg >= 5.0 {
                    neuron.visible_stations.push(LinkGeometry {
                        station_id: station.config.id.clone(),
                        elevation_deg: angles.elevation_deg,
                        slant_range_km: angles.range_km,
                        azimuth_deg: angles.azimuth_deg,
                        doppler_shift_hz: angles.doppler_shift_hz,
                    });
                }
            }
        }
    }

    ann
}

fn station_tier(station: &NetworkStation) -> u8 {
    // Tier based on station name patterns
    let name = station.config.name.to_lowercase();
    if name.contains("equinix") || name.contains("halo") || name.contains("data center") {
        1
    } else if name.contains("university") || name.contains("observatory") {
        2
    } else {
        3
    }
}

// ---- Background position update ----

async fn update_positions(state: &AppState) {
    let now = Utc::now();
    let mut new_positions: Vec<(String, f64, f64, f64)> = Vec::new();

    for sat in &state.constellation.satellites {
        if let Ok(pos) = sat.ground_track(now) {
            new_positions.push((sat.id.clone(), pos.latitude, pos.longitude, pos.altitude_km));
        }
    }

    // Update ANN neuron positions and recompute visibility
    let stations = state.strategic_stations.clone();
    let mut ann = state.ann.write().await;

    for (sat_id, lat, lon, alt) in &new_positions {
        if let Some(neuron) = ann.satellites.get_mut(sat_id.as_str()) {
            neuron.latitude = *lat;
            neuron.longitude = *lon;
            neuron.altitude_km = *alt;

            // Recompute visible stations
            neuron.visible_stations.clear();
            for station in stations.iter().take(50) {
                let angles = calculate_look_angles(
                    station.config.latitude_deg,
                    station.config.longitude_deg,
                    station.config.altitude_m / 1000.0,
                    *lat,
                    *lon,
                    *alt,
                );

                if angles.elevation_deg >= 5.0 {
                    neuron.visible_stations.push(LinkGeometry {
                        station_id: station.config.id.clone(),
                        elevation_deg: angles.elevation_deg,
                        slant_range_km: angles.range_km,
                        azimuth_deg: angles.azimuth_deg,
                        doppler_shift_hz: angles.doppler_shift_hz,
                    });
                }
            }
        }
    }

    tracing::debug!(
        "Updated {} satellite positions ({} with visibility)",
        new_positions.len(),
        new_positions.len()
    );
}

// ---- Static handlers ----

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "orbital-gateway",
        "constellation": "HALO",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

async fn list_strategic_stations(
    State(state): State<AppState>,
) -> Json<StrategicStationsResponse> {
    let stations = state.strategic_stations.as_ref().clone();
    let stats = StationStats::from_stations(&stations);

    Json(StrategicStationsResponse { stations, stats })
}

async fn run_downselect(
    State(state): State<AppState>,
    Json(req): Json<DownselectRequest>,
) -> Json<DownselectSummary> {
    let stations = state.strategic_stations.as_ref();

    let weights = req.weights.unwrap_or_default();
    let mut ds = Downselect::new().with_weights(weights);
    ds.evaluate(stations);

    Json(ds.summary())
}
