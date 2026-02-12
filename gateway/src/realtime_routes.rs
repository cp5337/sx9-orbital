//! Real-time Data API Routes
//!
//! Endpoints for live TLE, collision avoidance, and weather sync.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::realtime::{
    fetch_celestrak_tles, fetch_socrates_events, fetch_tle_by_norad,
    sync_weather_to_neo4j, CelesTrakTLE, RealtimeDataManager, SatelliteGroup, SocratesEvent,
};

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Deserialize)]
pub struct TleQuery {
    /// Satellite group: starlink, oneweb, gps, iridium, galileo, stations, active
    pub group: Option<String>,
    /// Limit results
    pub limit: Option<usize>,
}

#[derive(Serialize)]
pub struct TleResponse {
    pub count: usize,
    pub group: String,
    pub tles: Vec<TleSummary>,
}

#[derive(Serialize)]
pub struct TleSummary {
    pub norad_id: u32,
    pub name: String,
    pub epoch: String,
    pub inclination: f64,
    pub mean_motion: f64,
    pub eccentricity: f64,
}

impl From<&CelesTrakTLE> for TleSummary {
    fn from(tle: &CelesTrakTLE) -> Self {
        Self {
            norad_id: tle.norad_id,
            name: tle.name.clone(),
            epoch: tle.epoch.clone(),
            inclination: tle.inclination,
            mean_motion: tle.mean_motion,
            eccentricity: tle.eccentricity,
        }
    }
}

#[derive(Serialize)]
pub struct CollisionResponse {
    pub count: usize,
    pub critical_count: usize,
    pub events: Vec<CollisionSummary>,
}

#[derive(Serialize)]
pub struct CollisionSummary {
    pub sat1_name: String,
    pub sat1_norad: u32,
    pub sat2_name: String,
    pub sat2_norad: u32,
    pub tca: String,
    pub min_range_km: f64,
    pub relative_velocity_km_s: f64,
    pub critical: bool,
}

impl From<&SocratesEvent> for CollisionSummary {
    fn from(e: &SocratesEvent) -> Self {
        Self {
            sat1_name: e.sat1_name.clone(),
            sat1_norad: e.sat1_norad,
            sat2_name: e.sat2_name.clone(),
            sat2_norad: e.sat2_norad,
            tca: e.tca.clone(),
            min_range_km: e.min_range_km,
            relative_velocity_km_s: e.relative_velocity_km_s,
            critical: e.min_range_km < 5.0,
        }
    }
}

#[derive(Deserialize)]
pub struct WeatherSyncRequest {
    pub station_id: String,
    pub weather_score: i64, // Nano9 raw value
}

#[derive(Serialize)]
pub struct WeatherSyncResponse {
    pub success: bool,
    pub station_id: String,
    pub neo4j_updated: bool,
}

#[derive(Serialize)]
pub struct FullTleResponse {
    pub norad_id: u32,
    pub name: String,
    pub line0: String,
    pub line1: String,
    pub line2: String,
    pub epoch: String,
    pub orbital_elements: OrbitalElements,
}

#[derive(Serialize)]
pub struct OrbitalElements {
    pub inclination_deg: f64,
    pub raan_deg: f64,
    pub eccentricity: f64,
    pub arg_perigee_deg: f64,
    pub mean_anomaly_deg: f64,
    pub mean_motion_rev_day: f64,
    pub bstar: f64,
}

// ============================================================================
// Route Handlers
// ============================================================================

/// GET /realtime/tle - Fetch TLEs from CelesTrak
pub async fn get_tles(
    Query(query): Query<TleQuery>,
) -> Result<Json<TleResponse>, (StatusCode, String)> {
    let group_str = query.group.as_deref().unwrap_or("gps");

    let group = match group_str.to_lowercase().as_str() {
        "starlink" => SatelliteGroup::Starlink,
        "oneweb" => SatelliteGroup::OneWeb,
        "gps" => SatelliteGroup::Gps,
        "iridium" => SatelliteGroup::Iridium,
        "galileo" => SatelliteGroup::Galileo,
        "stations" => SatelliteGroup::Stations,
        "active" => SatelliteGroup::Active,
        "last30days" | "recent" => SatelliteGroup::LastThirtyDays,
        _ => return Err((StatusCode::BAD_REQUEST, format!("Unknown group: {}", group_str))),
    };

    let tles = fetch_celestrak_tles(group)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("CelesTrak error: {}", e)))?;

    let limit = query.limit.unwrap_or(100).min(1000);

    let summaries: Vec<TleSummary> = tles.iter().take(limit).map(TleSummary::from).collect();

    Ok(Json(TleResponse {
        count: summaries.len(),
        group: group_str.to_string(),
        tles: summaries,
    }))
}

/// GET /realtime/tle/:norad_id - Fetch TLE for specific satellite
pub async fn get_tle_by_id(
    Path(norad_id): Path<u32>,
) -> Result<Json<FullTleResponse>, (StatusCode, String)> {
    let tle = fetch_tle_by_norad(norad_id)
        .await
        .map_err(|e| (StatusCode::NOT_FOUND, format!("TLE not found: {}", e)))?;

    let (line0, line1, line2) = tle.to_tle_lines();

    Ok(Json(FullTleResponse {
        norad_id: tle.norad_id,
        name: tle.name,
        line0,
        line1,
        line2,
        epoch: tle.epoch,
        orbital_elements: OrbitalElements {
            inclination_deg: tle.inclination,
            raan_deg: tle.raan,
            eccentricity: tle.eccentricity,
            arg_perigee_deg: tle.arg_perigee,
            mean_anomaly_deg: tle.mean_anomaly,
            mean_motion_rev_day: tle.mean_motion,
            bstar: tle.bstar,
        },
    }))
}

/// GET /realtime/collisions - Get SOCRATES collision warnings
pub async fn get_collisions() -> Result<Json<CollisionResponse>, (StatusCode, String)> {
    let events = fetch_socrates_events()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("SOCRATES error: {}", e)))?;

    let summaries: Vec<CollisionSummary> = events.iter().map(CollisionSummary::from).collect();
    let critical_count = summaries.iter().filter(|s| s.critical).count();

    Ok(Json(CollisionResponse {
        count: summaries.len(),
        critical_count,
        events: summaries,
    }))
}

/// POST /realtime/weather/sync - Sync station weather to Neo4j
pub async fn sync_weather(
    Json(req): Json<WeatherSyncRequest>,
) -> Result<Json<WeatherSyncResponse>, (StatusCode, String)> {
    let neo4j_result = sync_weather_to_neo4j(&req.station_id, req.weather_score).await;

    Ok(Json(WeatherSyncResponse {
        success: true,
        station_id: req.station_id,
        neo4j_updated: neo4j_result.is_ok(),
    }))
}

/// GET /realtime/health - Health check for realtime subsystem
pub async fn realtime_health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "healthy",
        "subsystem": "realtime",
        "sources": {
            "celestrak": "https://celestrak.org",
            "socrates": "https://celestrak.org/SOCRATES",
            "neo4j": "localhost:7474"
        }
    }))
}

// ============================================================================
// Router
// ============================================================================

pub fn realtime_routes() -> Router {
    Router::new()
        .route("/health", get(realtime_health))
        .route("/tle", get(get_tles))
        .route("/tle/{norad_id}", get(get_tle_by_id))
        .route("/collisions", get(get_collisions))
        .route("/weather/sync", post(sync_weather))
}
