use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};

use crate::AppState;
use ground_stations::StationStatus;

#[derive(Serialize)]
pub struct SatelliteInfo {
    pub id: String,
    pub name: String,
    pub norad_id: u32,
    pub plane: u8,
    pub slot: u8,
    pub status: String,
}

#[derive(Serialize)]
pub struct Position {
    pub latitude: f64,
    pub longitude: f64,
    pub altitude_km: f64,
    pub velocity_km_s: f64,
    pub timestamp: String,
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
    pub latency_ms: f64,
    pub quality_score: f64,
    pub weather_impact: f64,
}

#[derive(Deserialize)]
#[allow(dead_code)] // Fields will be used when collision-avoidance integration is complete
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

pub async fn list_satellites(State(_state): State<AppState>) -> Json<Vec<SatelliteInfo>> {
    // HALO constellation: 12 satellites in Walker Delta 3/4
    let satellites: Vec<SatelliteInfo> = (0..12)
        .map(|i| {
            let plane = (i / 4) + 1;
            let slot = (i % 4) + 1;
            SatelliteInfo {
                id: format!("HALO-{:02}", i + 1),
                name: format!("HALO-{}{}", plane, slot),
                norad_id: 60000 + i as u32,
                plane: plane as u8,
                slot: slot as u8,
                status: if i < 8 { "operational" } else { "spare" }.to_string(),
            }
        })
        .collect();

    Json(satellites)
}

pub async fn get_position(
    State(_state): State<AppState>,
    Path(id): Path<String>,
) -> Json<Position> {
    // Placeholder - would use SGP4 propagation
    Json(Position {
        latitude: 35.0,
        longitude: -120.0,
        altitude_km: 10500.0,
        velocity_km_s: 4.5,
        timestamp: chrono::Utc::now().to_rfc3339(),
    })
}

pub async fn list_ground_stations(
    State(state): State<AppState>,
) -> Json<Vec<GroundStationInfo>> {
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

pub async fn calculate_route(
    State(_state): State<AppState>,
    Json(request): Json<RouteRequest>,
) -> Json<RouteResponse> {
    // Placeholder - would use beam-routing crate with weather-aware ANN/CNN
    Json(RouteResponse {
        path: vec![
            request.source_station.clone(),
            "HALO-11".to_string(),
            "HALO-21".to_string(),
            request.destination_station.clone(),
        ],
        latency_ms: 85.0,
        quality_score: 0.94,
        weather_impact: 0.03,
    })
}

pub async fn check_collision(
    State(_state): State<AppState>,
    Json(request): Json<CollisionCheckRequest>,
) -> Json<CollisionCheckResponse> {
    // Placeholder - would use collision-avoidance crate with UCLA integration
    Json(CollisionCheckResponse {
        risk_level: "low".to_string(),
        closest_approach_km: Some(50.0),
        time_to_closest: Some("2026-01-04T12:00:00Z".to_string()),
        recommended_action: None,
    })
}
