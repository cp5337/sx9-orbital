use axum::{
    extract::{Path, State},
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::AppState;
use ground_stations::StationStatus;
use orbital_glaf::routing::{RouteOptimizer, RouteRequest as GlafRouteRequest};

// ---- Response types ----

#[derive(Serialize)]
pub struct SatelliteInfo {
    pub id: String,
    pub name: String,
    pub norad_id: u32,
    pub plane: u8,
    pub slot: u8,
    pub status: String,
    pub tle_line1: String,
    pub tle_line2: String,
}

#[derive(Serialize)]
pub struct SatellitePosition {
    pub id: String,
    pub norad_id: u32,
    pub latitude: f64,
    pub longitude: f64,
    pub altitude_km: f64,
    pub velocity_km_s: f64,
    pub timestamp: String,
}

#[derive(Serialize)]
pub struct BulkPositionResponse {
    pub satellites: Vec<SatellitePosition>,
    pub count: usize,
    pub timestamp: String,
}

#[derive(Serialize)]
pub struct TleEntry {
    pub norad_id: u32,
    pub name: String,
    pub line1: String,
    pub line2: String,
}

#[derive(Serialize)]
pub struct TleResponse {
    pub constellation: String,
    pub count: usize,
    pub tles: Vec<TleEntry>,
}

#[derive(Serialize)]
pub struct GroundStationInfo {
    pub id: String,
    pub name: String,
    pub latitude: f64,
    pub longitude: f64,
    pub status: String,
    pub weather_score: f64,
}

#[derive(Deserialize)]
pub struct RouteRequest {
    pub source_station: String,
    pub destination_station: String,
    pub priority: Option<String>,
}

#[derive(Serialize)]
pub struct RouteResponse {
    pub path: Vec<String>,
    pub decision: String,
    pub score: f64,
    pub total_latency_ms: f64,
    pub min_margin_db: f64,
    pub avg_margin_db: f64,
    pub throughput_gbps: f64,
    pub hop_count: usize,
    pub weather_factor: f64,
    pub processing_time_us: u64,
}

#[derive(Deserialize)]
#[allow(dead_code)]
pub struct CollisionCheckRequest {
    pub satellite_id: String,
    pub time_horizon_hours: Option<f64>,
}

#[derive(Serialize)]
pub struct CollisionCheckResponse {
    pub risk_level: String,
    pub closest_approach_km: Option<f64>,
    pub time_to_closest: Option<String>,
    pub recommended_action: Option<String>,
}

// ---- Handlers ----

/// List all satellites with TLE data
pub async fn list_satellites(State(state): State<AppState>) -> Json<Vec<SatelliteInfo>> {
    let sats = &state.constellation.satellites;
    Json(
        sats.iter()
            .map(|s| SatelliteInfo {
                id: s.id.clone(),
                name: s.name.clone(),
                norad_id: s.norad_id,
                plane: s.plane,
                slot: s.slot,
                status: format!("{:?}", s.status).to_lowercase(),
                tle_line1: s.tle_line1.clone(),
                tle_line2: s.tle_line2.clone(),
            })
            .collect(),
    )
}

/// Get single satellite position via real SGP4 propagation
/// Uses GMST-corrected ECI→geodetic for accurate sub-satellite point
pub async fn get_position(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Json<serde_json::Value> {
    let sat = state
        .constellation
        .satellites
        .iter()
        .find(|s| s.id == id || s.norad_id.to_string() == id);

    let sat = match sat {
        Some(s) => s,
        None => {
            return Json(serde_json::json!({"error": format!("Satellite {} not found", id)}));
        }
    };

    let now = Utc::now();
    match sat.propagate(now) {
        Ok(sv) => {
            // Use time-aware geodetic conversion for accurate ground track
            let pos = orbital_mechanics::transforms::eci_to_geodetic_at_time(
                sv.position_x,
                sv.position_y,
                sv.position_z,
                now,
            );
            let v = (sv.velocity_x.powi(2)
                + sv.velocity_y.powi(2)
                + sv.velocity_z.powi(2))
            .sqrt();
            Json(serde_json::json!({
                "id": sat.id,
                "norad_id": sat.norad_id,
                "latitude": pos.latitude,
                "longitude": pos.longitude,
                "altitude_km": pos.altitude_km,
                "velocity_km_s": v,
                "timestamp": now.to_rfc3339(),
            }))
        }
        Err(e) => Json(serde_json::json!({"error": format!("{}", e)})),
    }
}

/// Bulk propagate all satellites to current time
/// Uses GMST-corrected geodetic for accurate ground tracks
pub async fn get_bulk_positions(State(state): State<AppState>) -> Json<BulkPositionResponse> {
    let now = Utc::now();
    let timestamp = now.to_rfc3339();

    let satellites: Vec<SatellitePosition> = state
        .constellation
        .satellites
        .iter()
        .filter_map(|sat| {
            let sv = sat.propagate(now).ok()?;
            // Use time-aware geodetic conversion for accurate ground track
            let pos = orbital_mechanics::transforms::eci_to_geodetic_at_time(
                sv.position_x, sv.position_y, sv.position_z, now
            );
            let v =
                (sv.velocity_x.powi(2) + sv.velocity_y.powi(2) + sv.velocity_z.powi(2)).sqrt();

            Some(SatellitePosition {
                id: sat.id.clone(),
                norad_id: sat.norad_id,
                latitude: pos.latitude,
                longitude: pos.longitude,
                altitude_km: pos.altitude_km,
                velocity_km_s: v,
                timestamp: timestamp.clone(),
            })
        })
        .collect();

    let count = satellites.len();
    Json(BulkPositionResponse {
        satellites,
        count,
        timestamp,
    })
}

/// Get all constellation TLEs
pub async fn get_all_tles(State(state): State<AppState>) -> Json<TleResponse> {
    let tles: Vec<TleEntry> = state
        .constellation
        .satellites
        .iter()
        .map(|s| TleEntry {
            norad_id: s.norad_id,
            name: s.name.clone(),
            line1: s.tle_line1.clone(),
            line2: s.tle_line2.clone(),
        })
        .collect();

    let count = tles.len();
    Json(TleResponse {
        constellation: "HALO".to_string(),
        count,
        tles,
    })
}

/// Get single TLE by NORAD ID
pub async fn get_tle_by_norad(
    State(state): State<AppState>,
    Path(norad_id): Path<u32>,
) -> Json<serde_json::Value> {
    match state
        .constellation
        .satellites
        .iter()
        .find(|s| s.norad_id == norad_id)
    {
        Some(s) => Json(serde_json::json!({
            "norad_id": s.norad_id,
            "name": s.name,
            "line1": s.tle_line1,
            "line2": s.tle_line2,
        })),
        None => Json(serde_json::json!({"error": format!("NORAD ID {} not found", norad_id)})),
    }
}

/// List ground stations from registry
pub async fn list_ground_stations(State(state): State<AppState>) -> Json<Vec<GroundStationInfo>> {
    let stations = state
        .station_registry
        .operational()
        .map(|station| {
            let weather_score = station
                .weather
                .as_ref()
                .map(|w| w.beam_quality_score)
                .unwrap_or(1.0);

            let status = match station.status {
                StationStatus::Operational => "operational",
                StationStatus::Degraded => "degraded",
                StationStatus::WeatherHold => "weather_hold",
                StationStatus::Maintenance => "maintenance",
                StationStatus::Offline => "offline",
            };

            GroundStationInfo {
                id: station.id.clone(),
                name: station.name.clone(),
                latitude: station.location.latitude,
                longitude: station.location.longitude,
                status: status.to_string(),
                weather_score,
            }
        })
        .collect();

    Json(stations)
}

/// Calculate optimal route using ConstellationGraph + HFT RouteOptimizer
pub async fn calculate_route(
    State(state): State<AppState>,
    Json(request): Json<RouteRequest>,
) -> Json<serde_json::Value> {
    let graph = state.graph.read().await;
    let optimizer = RouteOptimizer::new();

    let glaf_request = GlafRouteRequest {
        source_id: request.source_station.clone(),
        destination_id: request.destination_station.clone(),
        alternatives: 0,
        thresholds: None,
    };

    match optimizer.optimize(&graph, &glaf_request) {
        Ok(response) => match response.best_route {
            Some(route) => Json(serde_json::json!({
                "path": route.path,
                "decision": format!("{:?}", route.decision),
                "score": route.score,
                "total_latency_ms": route.total_latency_ms,
                "min_margin_db": route.min_margin_db,
                "avg_margin_db": route.avg_margin_db,
                "throughput_gbps": route.throughput_gbps,
                "hop_count": route.hop_count,
                "weather_factor": route.weather_factor,
                "processing_time_us": response.processing_time_us,
            })),
            None => Json(serde_json::json!({
                "error": "No viable route found",
                "source": request.source_station,
                "destination": request.destination_station,
            })),
        },
        Err(e) => Json(serde_json::json!({"error": format!("{}", e)})),
    }
}

/// Check collision risk (placeholder)
pub async fn check_collision(
    State(_state): State<AppState>,
    Json(_request): Json<CollisionCheckRequest>,
) -> Json<CollisionCheckResponse> {
    Json(CollisionCheckResponse {
        risk_level: "low".to_string(),
        closest_approach_km: Some(50.0),
        time_to_closest: Some("2026-01-04T12:00:00Z".to_string()),
        recommended_action: None,
    })
}
