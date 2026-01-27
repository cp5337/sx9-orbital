use anyhow::Result;
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_http::{
    cors::CorsLayer,
    services::ServeDir,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

// Import ground station WASM types for API
use ground_station_wasm::{
    stations::{load_strategic_stations, NetworkStation, StationStats},
    downselect::{Downselect, ScoringWeights, DownselectSummary},
};

mod routes;
mod memory;

#[derive(Clone)]
pub struct AppState {
    pub constellation: Arc<ConstellationState>,
    pub strategic_stations: Arc<Vec<NetworkStation>>,
}

#[derive(Default)]
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

    // Load strategic stations (Equinix, HALO Centres, etc.)
    let strategic_stations = load_strategic_stations();
    tracing::info!("   Loaded {} strategic stations", strategic_stations.len());

    // Initialize memory system (sx9-tcache)
    let memory_db_path = std::env::var("ORBITAL_MEMORY_PATH")
        .unwrap_or_else(|_| ".orbital-memory".to_string());
    let memory_state = memory::MemoryState::new(&memory_db_path)
        .expect("Failed to initialize memory system");
    tracing::info!("   Memory system initialized at {}", memory_db_path);

    let state = AppState {
        constellation: Arc::new(ConstellationState::default()),
        strategic_stations: Arc::new(strategic_stations),
    };

    // Memory routes (sx9-tcache) - separate router with its own state
    let memory_router = memory::memory_routes(memory_state);

    // API routes for constellation operations
    let constellation_routes = Router::new()
        .route("/satellites", get(routes::list_satellites))
        .route("/satellites/:id/position", get(routes::get_position))
        .route("/ground-stations", get(routes::list_ground_stations))
        .route("/strategic-stations", get(list_strategic_stations))
        .route("/strategic-stations/downselect", post(run_downselect))
        .route("/routing/optimal", post(routes::calculate_route))
        .route("/collision/check", post(routes::check_collision))
        .with_state(state);

    // Combine all routes
    let api_routes = Router::new()
        .route("/health", get(health))
        .nest("/api/v1", constellation_routes)
        .nest("/api/v1/memory", memory_router)
        .layer(CorsLayer::permissive());

    // Static file serving for UI (if dist exists)
    let ui_path = std::path::Path::new("ui/cesium-orbital/dist");
    let app = if ui_path.exists() {
        tracing::info!("   Serving UI from {}", ui_path.display());
        api_routes.nest_service("/", ServeDir::new(ui_path))
    } else {
        tracing::warn!("   UI not built - run 'npm run build' in ui/cesium-orbital");
        api_routes
    };

    let port = std::env::var("ORBITAL_GATEWAY_PORT")
        .or_else(|_| std::env::var("PORT"))
        .unwrap_or_else(|_| "18601".to_string());
    let addr = format!("0.0.0.0:{}", port);

    tracing::info!("🛰️  Orbital Gateway starting on {}", addr);
    tracing::info!("   Constellation: HALO (12 MEO satellites)");
    tracing::info!("   Ground stations: 257 Airbus FSO");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "orbital-gateway",
        "constellation": "HALO",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

/// List all strategic stations (Equinix, HALO, Africa, etc.)
async fn list_strategic_stations(
    State(state): State<AppState>,
) -> Json<StrategicStationsResponse> {
    let stations = state.strategic_stations.as_ref().clone();
    let stats = StationStats::from_stations(&stations);

    Json(StrategicStationsResponse { stations, stats })
}

/// Run downselect analysis on strategic stations
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
