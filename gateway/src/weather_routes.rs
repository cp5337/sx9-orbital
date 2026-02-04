//! Weather API routes for FSO ground stations
//!
//! Uses Open-Meteo (free, no API key) by default.
//! Provides real-time weather data and FSO link quality scoring.

use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

use ground_station_wasm::weather_api::WeatherApi;
use ground_station_wasm::weather::{WeatherConditions, FsoWeatherScore};
use ground_station_wasm::weather_historical::{HistoricalWeatherFetcher, HistoricalConfig, WeatherPattern};
use ground_station_wasm::stations::NetworkStation;

/// Shared weather state with API client and station registry
pub struct WeatherState {
    pub api: WeatherApi,
    pub stations: Arc<Vec<NetworkStation>>,
}

impl WeatherState {
    pub fn new(stations: Arc<Vec<NetworkStation>>) -> Self {
        Self {
            api: WeatherApi::open_meteo(),
            stations,
        }
    }
}

/// Build weather routes with state
pub fn weather_router(state: Arc<RwLock<WeatherState>>) -> Router {
    Router::new()
        .route("/", get(get_weather))
        .route("/station/{station_id}", get(get_station_weather))
        .route("/batch", post(get_batch_weather))
        .route("/historical", get(get_historical_weather))
        .route("/historical/batch", post(get_historical_batch))
        .route("/cache/clear", post(clear_cache))
        .with_state(state)
}

/// Weather response for a single location
#[derive(Serialize)]
pub struct WeatherResponse {
    pub station_id: String,
    pub conditions: WeatherConditions,
    pub fso_score: FsoWeatherScore,
}

/// Batch weather request
#[derive(Deserialize)]
pub struct BatchWeatherRequest {
    pub locations: Vec<LocationRequest>,
}

#[derive(Deserialize)]
pub struct LocationRequest {
    pub id: String,
    pub lat: f64,
    pub lon: f64,
}

/// Batch weather response
#[derive(Serialize)]
pub struct BatchWeatherResponse {
    pub results: Vec<BatchWeatherResult>,
    pub cache_stats: CacheStats,
}

#[derive(Serialize)]
pub struct BatchWeatherResult {
    pub id: String,
    pub success: bool,
    pub conditions: Option<WeatherConditions>,
    pub fso_score: Option<FsoWeatherScore>,
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct CacheStats {
    pub total_entries: usize,
    pub valid_entries: usize,
}

/// Query params for single weather fetch
#[derive(Deserialize)]
pub struct WeatherQuery {
    pub lat: f64,
    pub lon: f64,
}

/// Get weather for a specific location
pub async fn get_weather(
    State(state): State<Arc<RwLock<WeatherState>>>,
    Query(query): Query<WeatherQuery>,
) -> Result<Json<WeatherResponse>, Json<ErrorResponse>> {
    let state = state.read().await;

    match state.api.fetch_current(query.lat, query.lon).await {
        Ok(conditions) => {
            let fso_score = conditions.to_fso_score();
            Ok(Json(WeatherResponse {
                station_id: format!("{:.4},{:.4}", query.lat, query.lon),
                conditions,
                fso_score,
            }))
        }
        Err(e) => Err(Json(ErrorResponse {
            error: e.to_string(),
        })),
    }
}

/// Get weather for a station by ID (looks up coords from registry)
pub async fn get_station_weather(
    State(state): State<Arc<RwLock<WeatherState>>>,
    Path(station_id): Path<String>,
) -> Result<Json<WeatherResponse>, Json<ErrorResponse>> {
    let state = state.read().await;

    // Find station by ID or name (fields are in config)
    let station = state.stations
        .iter()
        .find(|s| s.config.id == station_id || s.config.name == station_id);

    let station = match station {
        Some(s) => s,
        None => {
            return Err(Json(ErrorResponse {
                error: format!("Station not found: {}", station_id),
            }));
        }
    };

    match state.api.fetch_current(station.config.latitude_deg, station.config.longitude_deg).await {
        Ok(conditions) => {
            let fso_score = conditions.to_fso_score();
            Ok(Json(WeatherResponse {
                station_id: station.config.id.clone(),
                conditions,
                fso_score,
            }))
        }
        Err(e) => Err(Json(ErrorResponse {
            error: e.to_string(),
        })),
    }
}

/// Get weather for multiple locations in batch
pub async fn get_batch_weather(
    State(state): State<Arc<RwLock<WeatherState>>>,
    Json(request): Json<BatchWeatherRequest>,
) -> Json<BatchWeatherResponse> {
    let state = state.read().await;

    let locations: Vec<(String, f64, f64)> = request
        .locations
        .iter()
        .map(|l| (l.id.clone(), l.lat, l.lon))
        .collect();

    let results_map = state.api.fetch_batch(&locations).await;
    let (total, valid) = state.api.cache_stats().await;

    let results: Vec<BatchWeatherResult> = request
        .locations
        .iter()
        .map(|loc| {
            match results_map.get(&loc.id) {
                Some(Ok(score)) => BatchWeatherResult {
                    id: loc.id.clone(),
                    success: true,
                    conditions: None, // Batch returns scores only
                    fso_score: Some(score.clone()),
                    error: None,
                },
                Some(Err(e)) => BatchWeatherResult {
                    id: loc.id.clone(),
                    success: false,
                    conditions: None,
                    fso_score: None,
                    error: Some(e.to_string()),
                },
                None => BatchWeatherResult {
                    id: loc.id.clone(),
                    success: false,
                    conditions: None,
                    fso_score: None,
                    error: Some("No result".to_string()),
                },
            }
        })
        .collect();

    Json(BatchWeatherResponse {
        results,
        cache_stats: CacheStats {
            total_entries: total,
            valid_entries: valid,
        },
    })
}

/// Clear weather cache
pub async fn clear_cache(
    State(state): State<Arc<RwLock<WeatherState>>>,
) -> Json<CacheStats> {
    let state = state.read().await;
    state.api.clear_cache().await;
    let (total, valid) = state.api.cache_stats().await;

    Json(CacheStats {
        total_entries: total,
        valid_entries: valid,
    })
}

// ---- Historical weather types and handlers ----

#[derive(Deserialize)]
pub struct HistoricalQuery {
    pub station_id: Option<String>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub days: Option<u32>,
}

#[derive(Serialize)]
pub struct HistoricalResponse {
    pub station_id: String,
    pub pattern: WeatherPattern,
}

#[derive(Deserialize)]
pub struct HistoricalBatchRequest {
    pub stations: Vec<HistoricalStationRequest>,
    pub days: Option<u32>,
}

#[derive(Deserialize)]
pub struct HistoricalStationRequest {
    pub station_id: String,
    pub lat: f64,
    pub lon: f64,
}

#[derive(Serialize)]
pub struct HistoricalBatchResponse {
    pub results: Vec<HistoricalBatchResult>,
    pub total: usize,
    pub success_count: usize,
}

#[derive(Serialize)]
pub struct HistoricalBatchResult {
    pub station_id: String,
    pub success: bool,
    pub pattern: Option<WeatherPattern>,
    pub error: Option<String>,
}

/// Get historical weather pattern for a station (5-year data from Open-Meteo Archive)
pub async fn get_historical_weather(
    State(state): State<Arc<RwLock<WeatherState>>>,
    Query(query): Query<HistoricalQuery>,
) -> Result<Json<HistoricalResponse>, Json<ErrorResponse>> {
    let state = state.read().await;

    // Resolve coordinates: either from query params or station_id lookup
    let (station_id, lat, lon) = if let (Some(lat), Some(lon)) = (query.lat, query.lon) {
        let id = query
            .station_id
            .unwrap_or_else(|| format!("{:.4},{:.4}", lat, lon));
        (id, lat, lon)
    } else if let Some(ref sid) = query.station_id {
        let station = state
            .stations
            .iter()
            .find(|s| s.config.id == *sid || s.config.name == *sid);
        match station {
            Some(s) => (
                s.config.id.clone(),
                s.config.latitude_deg,
                s.config.longitude_deg,
            ),
            None => {
                return Err(Json(ErrorResponse {
                    error: format!("Station not found: {}", sid),
                }));
            }
        }
    } else {
        return Err(Json(ErrorResponse {
            error: "Provide station_id or lat/lon".to_string(),
        }));
    };

    let days = query.days.unwrap_or(1825); // Default: 5 years
    let fetcher = HistoricalWeatherFetcher::with_config(HistoricalConfig {
        days,
        timeout_sec: 60,
    });

    match fetcher.fetch_station_pattern(&station_id, lat, lon).await {
        Ok(pattern) => Ok(Json(HistoricalResponse {
            station_id,
            pattern,
        })),
        Err(e) => Err(Json(ErrorResponse { error: e })),
    }
}

/// Get historical weather patterns for multiple stations in parallel
pub async fn get_historical_batch(
    State(state): State<Arc<RwLock<WeatherState>>>,
    Json(request): Json<HistoricalBatchRequest>,
) -> Json<HistoricalBatchResponse> {
    let days = request.days.unwrap_or(1825);
    let fetcher = HistoricalWeatherFetcher::with_config(HistoricalConfig {
        days,
        timeout_sec: 60,
    });

    let stations: Vec<(String, f64, f64)> = request
        .stations
        .iter()
        .map(|s| (s.station_id.clone(), s.lat, s.lon))
        .collect();

    let results_map = fetcher.fetch_batch(&stations).await;

    let mut results = Vec::new();
    let mut success_count = 0;

    for s in &request.stations {
        match results_map.get(&s.station_id) {
            Some(Ok(pattern)) => {
                success_count += 1;
                results.push(HistoricalBatchResult {
                    station_id: s.station_id.clone(),
                    success: true,
                    pattern: Some(pattern.clone()),
                    error: None,
                });
            }
            Some(Err(e)) => {
                results.push(HistoricalBatchResult {
                    station_id: s.station_id.clone(),
                    success: false,
                    pattern: None,
                    error: Some(e.clone()),
                });
            }
            None => {
                results.push(HistoricalBatchResult {
                    station_id: s.station_id.clone(),
                    success: false,
                    pattern: None,
                    error: Some("No result returned".to_string()),
                });
            }
        }
    }

    let total = results.len();
    Json(HistoricalBatchResponse {
        results,
        total,
        success_count,
    })
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}
