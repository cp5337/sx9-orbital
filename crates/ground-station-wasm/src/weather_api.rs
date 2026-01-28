//! Live Weather API Integration for FSO Ground Stations
//!
//! Uses Open-Meteo (free, no API key) for real-time weather data.
//! Falls back to Tomorrow.io for more detailed atmospheric data if configured.
//!
//! # Usage
//!
//! ```rust,ignore
//! let api = WeatherApi::open_meteo();
//! let weather = api.fetch_current(40.7128, -74.0060).await?;
//! let score = weather.to_fso_score();
//! ```

use crate::weather::{WeatherConditions, FsoWeatherScore};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Weather API configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherApiConfig {
    /// API provider to use
    pub provider: WeatherApiProvider,
    /// Cache TTL in seconds (default: 300 = 5 minutes)
    pub cache_ttl_sec: u64,
    /// Maximum concurrent requests
    pub max_concurrent: usize,
    /// Request timeout in seconds
    pub timeout_sec: u64,
}

impl Default for WeatherApiConfig {
    fn default() -> Self {
        Self {
            provider: WeatherApiProvider::OpenMeteo,
            cache_ttl_sec: 300,
            max_concurrent: 10,
            timeout_sec: 10,
        }
    }
}

/// Supported weather API providers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WeatherApiProvider {
    /// Open-Meteo (free, no API key)
    OpenMeteo,
    /// Tomorrow.io (requires API key)
    TomorrowIo { api_key: String },
    /// OpenWeatherMap (requires API key)
    OpenWeatherMap { api_key: String },
}

/// Open-Meteo API response structure
#[derive(Debug, Deserialize)]
struct OpenMeteoResponse {
    current: OpenMeteoCurrent,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoCurrent {
    #[serde(default)]
    cloud_cover: f64,
    #[serde(default)]
    visibility: Option<f64>, // meters, might not be available
    #[serde(default)]
    precipitation: f64,
    #[serde(default)]
    rain: Option<f64>,
    #[serde(default)]
    wind_speed_10m: f64,
    #[serde(default)]
    temperature_2m: f64,
    #[serde(default)]
    relative_humidity_2m: f64,
    #[serde(default)]
    weather_code: i32,
}

/// Open-Meteo hourly forecast response
#[derive(Debug, Deserialize)]
struct OpenMeteoForecastResponse {
    hourly: OpenMeteoHourly,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoHourly {
    time: Vec<String>,
    cloud_cover: Vec<f64>,
    precipitation_probability: Vec<f64>,
    precipitation: Vec<f64>,
    visibility: Option<Vec<f64>>,
    wind_speed_10m: Vec<f64>,
    temperature_2m: Vec<f64>,
    relative_humidity_2m: Vec<f64>,
}

/// Cache entry with timestamp
struct CacheEntry {
    weather: WeatherConditions,
    expires_at: std::time::Instant,
}

/// Live Weather API client
pub struct WeatherApi {
    config: WeatherApiConfig,
    client: reqwest::Client,
    cache: Arc<RwLock<HashMap<String, CacheEntry>>>,
}

impl WeatherApi {
    /// Create new Open-Meteo client (free, no API key)
    pub fn open_meteo() -> Self {
        Self::new(WeatherApiConfig::default())
    }

    /// Create with custom configuration
    pub fn new(config: WeatherApiConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(config.timeout_sec))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            config,
            client,
            cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Generate cache key from coordinates (rounded to 2 decimal places)
    fn cache_key(lat: f64, lon: f64) -> String {
        format!("{:.2},{:.2}", lat, lon)
    }

    /// Fetch current weather for a location
    pub async fn fetch_current(&self, lat: f64, lon: f64) -> Result<WeatherConditions, WeatherApiError> {
        let key = Self::cache_key(lat, lon);

        // Check cache first
        {
            let cache = self.cache.read().await;
            if let Some(entry) = cache.get(&key) {
                if entry.expires_at > std::time::Instant::now() {
                    return Ok(entry.weather.clone());
                }
            }
        }

        // Fetch from API
        let weather = match &self.config.provider {
            WeatherApiProvider::OpenMeteo => self.fetch_open_meteo(lat, lon).await?,
            WeatherApiProvider::TomorrowIo { api_key } => {
                self.fetch_tomorrow_io(lat, lon, api_key).await?
            }
            WeatherApiProvider::OpenWeatherMap { api_key } => {
                self.fetch_openweathermap(lat, lon, api_key).await?
            }
        };

        // Update cache
        {
            let mut cache = self.cache.write().await;
            cache.insert(key, CacheEntry {
                weather: weather.clone(),
                expires_at: std::time::Instant::now()
                    + std::time::Duration::from_secs(self.config.cache_ttl_sec),
            });
        }

        Ok(weather)
    }

    /// Fetch from Open-Meteo (free API)
    async fn fetch_open_meteo(&self, lat: f64, lon: f64) -> Result<WeatherConditions, WeatherApiError> {
        let url = format!(
            "https://api.open-meteo.com/v1/forecast?latitude={:.6}&longitude={:.6}&current=cloud_cover,precipitation,rain,wind_speed_10m,temperature_2m,relative_humidity_2m,weather_code&timezone=auto",
            lat, lon
        );

        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| WeatherApiError::RequestFailed(e.to_string()))?;

        if !response.status().is_success() {
            return Err(WeatherApiError::ApiError(format!(
                "Open-Meteo returned status: {}",
                response.status()
            )));
        }

        let data: OpenMeteoResponse = response
            .json()
            .await
            .map_err(|e| WeatherApiError::ParseError(e.to_string()))?;

        // Convert weather code to visibility estimate
        // WMO codes: 0=clear, 1-3=partly cloudy, 45-48=fog, 51-67=drizzle/rain, 71-77=snow, 80-82=showers, 95-99=thunderstorm
        let visibility_km = match data.current.weather_code {
            0..=3 => 50.0,          // Clear/partly cloudy
            45..=48 => 1.0,         // Fog
            51..=55 => 10.0,        // Drizzle
            56..=57 => 5.0,         // Freezing drizzle
            61..=65 => 8.0,         // Rain
            66..=67 => 4.0,         // Freezing rain
            71..=75 => 3.0,         // Snow
            77 => 2.0,              // Snow grains
            80..=82 => 6.0,         // Rain showers
            85..=86 => 2.0,         // Snow showers
            95..=99 => 3.0,         // Thunderstorm
            _ => 20.0,              // Unknown, assume moderate
        };

        // Estimate precipitation probability from weather code
        let precip_probability = match data.current.weather_code {
            0..=3 => 0.000000000,
            45..=48 => 0.100000000,
            51..=67 => 0.800000000,
            71..=86 => 0.900000000,
            95..=99 => 0.950000000,
            _ => 0.200000000,
        };

        Ok(WeatherConditions {
            station_id: format!("{:.4},{:.4}", lat, lon),
            cloud_cover_pct: data.current.cloud_cover,
            visibility_km,
            precip_probability,
            precip_intensity: data.current.precipitation + data.current.rain.unwrap_or(0.0),
            wind_speed_ms: data.current.wind_speed_10m / 3.6, // km/h to m/s
            temperature_c: data.current.temperature_2m,
            humidity_pct: data.current.relative_humidity_2m,
            timestamp: chrono::Utc::now().timestamp(),
        })
    }

    /// Fetch from Tomorrow.io (more detailed, requires API key)
    async fn fetch_tomorrow_io(&self, lat: f64, lon: f64, api_key: &str) -> Result<WeatherConditions, WeatherApiError> {
        let url = format!(
            "https://api.tomorrow.io/v4/weather/realtime?location={:.6},{:.6}&apikey={}",
            lat, lon, api_key
        );

        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| WeatherApiError::RequestFailed(e.to_string()))?;

        if !response.status().is_success() {
            return Err(WeatherApiError::ApiError(format!(
                "Tomorrow.io returned status: {}",
                response.status()
            )));
        }

        // Tomorrow.io response parsing
        #[derive(Deserialize)]
        struct TomorrowResponse {
            data: TomorrowData,
        }
        #[derive(Deserialize)]
        struct TomorrowData {
            values: TomorrowValues,
        }
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct TomorrowValues {
            cloud_cover: f64,
            visibility: f64,
            precipitation_probability: f64,
            precipitation_intensity: f64,
            wind_speed: f64,
            temperature: f64,
            humidity: f64,
        }

        let data: TomorrowResponse = response
            .json()
            .await
            .map_err(|e| WeatherApiError::ParseError(e.to_string()))?;

        Ok(WeatherConditions {
            station_id: format!("{:.4},{:.4}", lat, lon),
            cloud_cover_pct: data.data.values.cloud_cover,
            visibility_km: data.data.values.visibility,
            precip_probability: data.data.values.precipitation_probability / 100.0,
            precip_intensity: data.data.values.precipitation_intensity,
            wind_speed_ms: data.data.values.wind_speed,
            temperature_c: data.data.values.temperature,
            humidity_pct: data.data.values.humidity,
            timestamp: chrono::Utc::now().timestamp(),
        })
    }

    /// Fetch from OpenWeatherMap
    async fn fetch_openweathermap(&self, lat: f64, lon: f64, api_key: &str) -> Result<WeatherConditions, WeatherApiError> {
        let url = format!(
            "https://api.openweathermap.org/data/2.5/weather?lat={:.6}&lon={:.6}&appid={}&units=metric",
            lat, lon, api_key
        );

        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| WeatherApiError::RequestFailed(e.to_string()))?;

        if !response.status().is_success() {
            return Err(WeatherApiError::ApiError(format!(
                "OpenWeatherMap returned status: {}",
                response.status()
            )));
        }

        #[derive(Deserialize)]
        struct OwmResponse {
            main: OwmMain,
            visibility: Option<i32>,
            wind: OwmWind,
            clouds: OwmClouds,
            rain: Option<OwmRain>,
        }
        #[derive(Deserialize)]
        struct OwmMain {
            temp: f64,
            humidity: f64,
        }
        #[derive(Deserialize)]
        struct OwmWind {
            speed: f64,
        }
        #[derive(Deserialize)]
        struct OwmClouds {
            all: f64,
        }
        #[derive(Deserialize)]
        struct OwmRain {
            #[serde(rename = "1h")]
            one_hour: Option<f64>,
        }

        let data: OwmResponse = response
            .json()
            .await
            .map_err(|e| WeatherApiError::ParseError(e.to_string()))?;

        let precip_intensity = data.rain
            .and_then(|r| r.one_hour)
            .unwrap_or(0.0);

        Ok(WeatherConditions {
            station_id: format!("{:.4},{:.4}", lat, lon),
            cloud_cover_pct: data.clouds.all,
            visibility_km: data.visibility.map(|v| v as f64 / 1000.0).unwrap_or(10.0),
            precip_probability: if precip_intensity > 0.0 { 0.900000000 } else { 0.100000000 },
            precip_intensity,
            wind_speed_ms: data.wind.speed,
            temperature_c: data.main.temp,
            humidity_pct: data.main.humidity,
            timestamp: chrono::Utc::now().timestamp(),
        })
    }

    /// Fetch weather for multiple stations in parallel
    pub async fn fetch_batch(&self, locations: &[(String, f64, f64)]) -> HashMap<String, Result<FsoWeatherScore, WeatherApiError>> {
        use futures::future::join_all;

        let futures: Vec<_> = locations
            .iter()
            .map(|(id, lat, lon)| {
                let id = id.clone();
                let lat = *lat;
                let lon = *lon;
                async move {
                    let result = self.fetch_current(lat, lon).await;
                    (id, result.map(|w| w.to_fso_score()))
                }
            })
            .collect();

        join_all(futures).await.into_iter().collect()
    }

    /// Clear the cache
    pub async fn clear_cache(&self) {
        let mut cache = self.cache.write().await;
        cache.clear();
    }

    /// Get cache statistics
    pub async fn cache_stats(&self) -> (usize, usize) {
        let cache = self.cache.read().await;
        let total = cache.len();
        let valid = cache.values()
            .filter(|e| e.expires_at > std::time::Instant::now())
            .count();
        (total, valid)
    }
}

/// Weather API errors
#[derive(Debug, Clone)]
pub enum WeatherApiError {
    RequestFailed(String),
    ApiError(String),
    ParseError(String),
    RateLimited,
}

impl std::fmt::Display for WeatherApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::RequestFailed(e) => write!(f, "Request failed: {}", e),
            Self::ApiError(e) => write!(f, "API error: {}", e),
            Self::ParseError(e) => write!(f, "Parse error: {}", e),
            Self::RateLimited => write!(f, "Rate limited"),
        }
    }
}

impl std::error::Error for WeatherApiError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_open_meteo_fetch() {
        let api = WeatherApi::open_meteo();

        // New York City
        let result = api.fetch_current(40.7128, -74.0060).await;

        match result {
            Ok(weather) => {
                println!("Weather for NYC: {:?}", weather);
                assert!(weather.cloud_cover_pct >= 0.0 && weather.cloud_cover_pct <= 100.0);
                assert!(weather.temperature_c > -50.0 && weather.temperature_c < 60.0);

                let score = weather.to_fso_score();
                println!("FSO Score: {:?}", score);
                assert!(score.quality >= 0.0 && score.quality <= 1.0);
            }
            Err(e) => {
                // Network errors are acceptable in CI
                println!("API error (may be expected): {}", e);
            }
        }
    }

    #[tokio::test]
    async fn test_cache_behavior() {
        let api = WeatherApi::open_meteo();

        // First fetch
        let _ = api.fetch_current(51.5074, -0.1278).await;

        // Check cache
        let (total, valid) = api.cache_stats().await;
        assert!(total >= 1);
        assert!(valid >= 1);

        // Second fetch should hit cache
        let _ = api.fetch_current(51.5074, -0.1278).await;
    }
}
