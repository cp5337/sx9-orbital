//! State API Routes for Simulation Tinkering
//!
//! Exposes mutable simulation state for testing/debugging:
//! - GET/PUT station states (door, tracking, weather)
//! - POST tick (advance simulation)
//! - POST route (calculate optimal path)

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use ground_station_wasm::GroundStationConfig;
use crate::sim_state::{SimulationCore, StationSnapshot, StateEvent};

/// Shared simulation state
#[derive(Clone)]
pub struct SimState {
    pub core: Arc<SimulationCore>,
}

impl SimState {
    pub fn new() -> Self {
        Self {
            core: Arc::new(SimulationCore::new()),
        }
    }
}

// ========== Request/Response Types ==========

#[derive(Deserialize)]
pub struct UpdateStationRequest {
    pub weather_score: Option<i64>,  // Nano9 raw value
    pub door_state: Option<String>,  // "Opening", "Open", "Closing", "Closed"
    pub target_satellite: Option<u8>,
}

#[derive(Serialize)]
pub struct StationsResponse {
    pub stations: Vec<StationInfo>,
    pub sim_time_ms: u32,
}

#[derive(Serialize)]
pub struct StationInfo {
    pub id: String,
    pub index: u8,
    pub snapshot: StationSnapshot,
}

#[derive(Deserialize)]
pub struct TickRequest {
    pub delta_sec: Option<f32>,
    pub delta_ms: Option<u32>,
}

#[derive(Serialize)]
pub struct TickResponse {
    pub sim_time_ms: u32,
    pub stations_updated: usize,
}

#[derive(Deserialize)]
pub struct RegisterStationRequest {
    pub id: String,
    pub name: String,
    pub latitude_deg: f64,
    pub longitude_deg: f64,
    pub altitude_m: f64,
    pub min_elevation_deg: Option<f32>,
    pub max_slew_rate_deg_s: Option<f32>,
}

#[derive(Serialize)]
pub struct RegisterResponse {
    pub index: u8,
    pub id: String,
}

#[derive(Deserialize)]
pub struct WeatherEventRequest {
    pub station_id: String,
    pub weather_score: i64,  // Nano9 raw value
}

// ========== Route Handlers ==========

/// List all station states
pub async fn list_stations(
    State(state): State<SimState>,
) -> Json<StationsResponse> {
    let core = &state.core;

    // Get all registered stations
    let station_ids = core.station_ids.read();
    let stations: Vec<StationInfo> = station_ids
        .iter()
        .enumerate()
        .map(|(idx, id)| StationInfo {
            id: id.clone(),
            index: idx as u8,
            snapshot: core.snapshot(idx as u8),
        })
        .collect();

    Json(StationsResponse {
        stations,
        sim_time_ms: core.sim_time_ms(),
    })
}

/// Get single station state
pub async fn get_station(
    State(state): State<SimState>,
    Path(id): Path<String>,
) -> Result<Json<StationInfo>, (StatusCode, String)> {
    let core = &state.core;

    let idx = core.station_index(&id)
        .ok_or((StatusCode::NOT_FOUND, format!("Station {} not found", id)))?;

    Ok(Json(StationInfo {
        id,
        index: idx,
        snapshot: core.snapshot(idx),
    }))
}

/// Update station state (for tinkering)
pub async fn update_station(
    State(state): State<SimState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateStationRequest>,
) -> Result<Json<StationInfo>, (StatusCode, String)> {
    let core = &state.core;

    let idx = core.station_index(&id)
        .ok_or((StatusCode::NOT_FOUND, format!("Station {} not found", id)))?;

    // Apply updates via events
    if let Some(score) = req.weather_score {
        core.inject(StateEvent::Weather {
            station: idx,
            score,  // Raw Nano9 i64 value
        });
    }

    if let Some(door_str) = req.door_state {
        match door_str.to_lowercase().as_str() {
            "open" | "opening" => {
                core.inject(StateEvent::DoorOpen { station: idx });
            }
            "close" | "closing" | "closed" => {
                core.inject(StateEvent::DoorClose { station: idx });
            }
            _ => return Err((StatusCode::BAD_REQUEST, format!("Invalid door state: {}", door_str))),
        }
    }

    if let Some(sat) = req.target_satellite {
        core.inject(StateEvent::TrackAcquire { station: idx, satellite: sat });
    }

    // Return updated state
    Ok(Json(StationInfo {
        id,
        index: idx,
        snapshot: core.snapshot(idx),
    }))
}

/// Register a new station
pub async fn register_station(
    State(state): State<SimState>,
    Json(req): Json<RegisterStationRequest>,
) -> Json<RegisterResponse> {
    let core = &state.core;

    let config = GroundStationConfig {
        id: req.id.clone(),
        name: req.name,
        latitude_deg: req.latitude_deg,
        longitude_deg: req.longitude_deg,
        altitude_m: req.altitude_m,
        min_elevation_deg: req.min_elevation_deg.unwrap_or(5.0) as f64,
        max_slew_rate_deg_s: req.max_slew_rate_deg_s.unwrap_or(2.0) as f64,
        fov_deg: 30.0, // Default field of view
    };

    let idx = core.register_station(req.id.clone(), config);

    Json(RegisterResponse {
        index: idx,
        id: req.id,
    })
}

/// Advance simulation by delta time
pub async fn tick(
    State(state): State<SimState>,
    Json(req): Json<TickRequest>,
) -> Json<TickResponse> {
    let core = &state.core;

    let delta_ms = req.delta_ms.unwrap_or_else(|| {
        req.delta_sec.map(|s| (s * 1000.0) as u32).unwrap_or(1000)
    });

    core.tick(delta_ms);

    let station_count = core.station_ids.read().len();

    Json(TickResponse {
        sim_time_ms: core.sim_time_ms(),
        stations_updated: station_count,
    })
}

/// Inject weather event
pub async fn inject_weather(
    State(state): State<SimState>,
    Json(req): Json<WeatherEventRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let core = &state.core;

    let idx = core.station_index(&req.station_id)
        .ok_or((StatusCode::NOT_FOUND, format!("Station {} not found", req.station_id)))?;

    core.inject(StateEvent::Weather {
        station: idx,
        score: req.weather_score,  // Raw Nano9 i64
    });

    Ok(Json(serde_json::json!({
        "success": true,
        "station": req.station_id,
        "weather_score": req.weather_score
    })))
}

/// Health check for simulation subsystem
pub async fn sim_health(
    State(state): State<SimState>,
) -> Json<serde_json::Value> {
    let core = &state.core;
    let station_count = core.station_ids.read().len();

    Json(serde_json::json!({
        "status": "healthy",
        "subsystem": "simulation",
        "sim_time_ms": core.sim_time_ms(),
        "station_count": station_count
    }))
}

// ========== Router ==========

pub fn state_routes(state: SimState) -> Router {
    Router::new()
        .route("/health", get(sim_health))
        .route("/stations", get(list_stations))
        .route("/stations", post(register_station))
        .route("/stations/:id", get(get_station))
        .route("/stations/:id", put(update_station))
        .route("/tick", post(tick))
        .route("/weather", post(inject_weather))
        .with_state(state)
}
