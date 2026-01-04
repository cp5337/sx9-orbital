use anyhow::Result;
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod routes;

#[derive(Clone)]
pub struct AppState {
    pub constellation: Arc<ConstellationState>,
}

#[derive(Default)]
pub struct ConstellationState {
    pub satellites: Vec<orbital_mechanics::Satellite>,
    pub ground_stations: Vec<ground_stations::GroundStation>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "orbital_gateway=debug,info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let state = AppState {
        constellation: Arc::new(ConstellationState::default()),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/v1/satellites", get(routes::list_satellites))
        .route("/api/v1/satellites/:id/position", get(routes::get_position))
        .route("/api/v1/ground-stations", get(routes::list_ground_stations))
        .route("/api/v1/routing/optimal", post(routes::calculate_route))
        .route("/api/v1/collision/check", post(routes::check_collision))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "21600".to_string());
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
