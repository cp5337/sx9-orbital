//! ConstellationANN API routes
//!
//! Exposes the satellite neural network routing system via REST endpoints.
//! Each satellite is a neuron that autonomously selects the best ground station
//! for downlink based on weather, geometry, and learned patterns.

use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::AppState;
use orbital_glaf::satellite_ann::{
    LinkOutcome, RoutingDecision, WeatherObservation, WeatherPattern,
};

/// Build ANN routes
pub fn ann_router() -> Router<AppState> {
    Router::new()
        .route("/route-all", post(route_all))
        .route("/assignments", get(get_assignments))
        .route("/observe", post(observe_weather))
        .route("/train", post(train_historical))
        .route("/neuron/{satellite_id}", get(get_neuron))
        .route("/outcome", post(report_outcome))
}

// ---- Request/Response types ----

#[derive(Serialize)]
pub struct RouteAllResponse {
    pub decisions: Vec<RoutingDecision>,
    pub count: usize,
    pub timestamp: String,
}

#[derive(Serialize)]
pub struct AssignmentsResponse {
    pub assignments: HashMap<String, String>,
    pub count: usize,
}

#[derive(Deserialize)]
pub struct ObserveRequest {
    pub observations: Vec<WeatherObservation>,
}

#[derive(Serialize)]
pub struct ObserveResponse {
    pub updated_count: usize,
}

#[derive(Deserialize)]
pub struct TrainRequest {
    pub patterns: Vec<WeatherPattern>,
}

#[derive(Serialize)]
pub struct TrainResponse {
    pub loaded_patterns: usize,
    pub satellites_updated: usize,
}

#[derive(Serialize)]
pub struct NeuronResponse {
    pub satellite_id: String,
    pub satellite_name: String,
    pub latitude: f64,
    pub longitude: f64,
    pub altitude_km: f64,
    pub visible_station_count: usize,
    pub active_downlink: Option<String>,
    pub weights: serde_json::Value,
    pub recent_decisions: usize,
}

#[derive(Deserialize)]
pub struct OutcomeRequest {
    pub satellite_id: String,
    pub decision_index: usize,
    pub outcome: LinkOutcome,
}

#[derive(Serialize)]
pub struct OutcomeResponse {
    pub accepted: bool,
    pub satellite_id: String,
}

// ---- Handlers ----

/// Run routing decisions for all satellites
async fn route_all(State(state): State<AppState>) -> Json<RouteAllResponse> {
    let mut ann = state.ann.write().await;
    let decisions = ann.route_all();
    let count = decisions.len();

    Json(RouteAllResponse {
        decisions,
        count,
        timestamp: chrono::Utc::now().to_rfc3339(),
    })
}

/// Get current satellite→station assignments
async fn get_assignments(State(state): State<AppState>) -> Json<AssignmentsResponse> {
    let ann = state.ann.read().await;
    let assignments = ann.get_assignments();
    let count = assignments.len();

    Json(AssignmentsResponse { assignments, count })
}

/// Feed real-time weather observations to neurons
async fn observe_weather(
    State(state): State<AppState>,
    Json(request): Json<ObserveRequest>,
) -> Json<ObserveResponse> {
    let mut ann = state.ann.write().await;
    let count = request.observations.len();
    ann.update_weather(request.observations);

    Json(ObserveResponse {
        updated_count: count,
    })
}

/// Load historical weather patterns for training
async fn train_historical(
    State(state): State<AppState>,
    Json(request): Json<TrainRequest>,
) -> Json<TrainResponse> {
    let mut ann = state.ann.write().await;
    let pattern_count = request.patterns.len();
    let satellite_count = ann.satellites.len();
    ann.load_historical_patterns(request.patterns);

    Json(TrainResponse {
        loaded_patterns: pattern_count,
        satellites_updated: satellite_count,
    })
}

/// Get neuron state for a specific satellite
async fn get_neuron(
    State(state): State<AppState>,
    Path(satellite_id): Path<String>,
) -> Json<serde_json::Value> {
    let ann = state.ann.read().await;

    match ann.satellites.get(&satellite_id) {
        Some(neuron) => Json(serde_json::json!({
            "satellite_id": neuron.satellite_id,
            "satellite_name": neuron.satellite_name,
            "latitude": neuron.latitude,
            "longitude": neuron.longitude,
            "altitude_km": neuron.altitude_km,
            "visible_station_count": neuron.visible_stations.len(),
            "visible_stations": neuron.visible_stations.iter()
                .map(|g| serde_json::json!({
                    "station_id": g.station_id,
                    "elevation_deg": g.elevation_deg,
                    "slant_range_km": g.slant_range_km,
                    "azimuth_deg": g.azimuth_deg,
                }))
                .collect::<Vec<_>>(),
            "active_downlink": neuron.active_downlink,
            "weights": {
                "w_current_weather": neuron.weights.w_current_weather,
                "w_historical_avail": neuron.weights.w_historical_avail,
                "w_pattern_prediction": neuron.weights.w_pattern_prediction,
                "w_elevation": neuron.weights.w_elevation,
                "w_range": neuron.weights.w_range,
                "w_tier": neuron.weights.w_tier,
                "learning_rate": neuron.weights.learning_rate,
            },
            "recent_decisions": neuron.decision_log.len(),
        })),
        None => Json(serde_json::json!({
            "error": format!("Satellite {} not found in ANN", satellite_id)
        })),
    }
}

/// Report link outcome for learning (gradient descent weight update)
async fn report_outcome(
    State(state): State<AppState>,
    Json(request): Json<OutcomeRequest>,
) -> Json<OutcomeResponse> {
    let mut ann = state.ann.write().await;

    let accepted = if let Some(neuron) = ann.satellites.get_mut(&request.satellite_id) {
        neuron.learn_from_outcome(request.decision_index, request.outcome);
        true
    } else {
        false
    };

    Json(OutcomeResponse {
        accepted,
        satellite_id: request.satellite_id,
    })
}
