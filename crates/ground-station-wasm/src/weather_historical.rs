//! Historical Weather Data Fetcher
//!
//! Uses Open-Meteo Archive API (free, no key required) to fetch historical weather
//! for ground station locations. Builds weather patterns for ANN training.
//!
//! API: https://archive-api.open-meteo.com/v1/archive
//!
//! # Usage
//!
//! ```rust,ignore
//! let fetcher = HistoricalWeatherFetcher::new();
//! let pattern = fetcher.fetch_station_pattern("GS-1", 40.7128, -74.0060, 365).await?;
//! ```

use crate::weather::{WeatherConditions, FsoWeatherScore};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Configuration for historical data fetch
#[derive(Debug, Clone)]
pub struct HistoricalConfig {
    /// Number of days to fetch (default: 365)
    pub days: u32,
    /// Request timeout in seconds
    pub timeout_sec: u64,
}

impl Default for HistoricalConfig {
    fn default() -> Self {
        Self {
            days: 365,
            timeout_sec: 30,
        }
    }
}

/// Open-Meteo Archive API response
#[derive(Debug, Deserialize)]
struct ArchiveResponse {
    hourly: ArchiveHourly,
}

#[derive(Debug, Deserialize)]
struct ArchiveHourly {
    time: Vec<String>,
    #[serde(default)]
    cloud_cover: Vec<f64>,
    #[serde(default)]
    precipitation: Vec<f64>,
    #[serde(default)]
    wind_speed_10m: Vec<f64>,
    #[serde(default)]
    temperature_2m: Vec<f64>,
    #[serde(default)]
    relative_humidity_2m: Vec<f64>,
    #[serde(default)]
    weather_code: Vec<i32>,
}

/// Weather pattern statistics for a station
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherPattern {
    pub station_id: String,
    pub latitude: f64,
    pub longitude: f64,

    /// Average FSO score by hour of day (0-23)
    pub hourly_avg_score: [f64; 24],
    /// Std dev of FSO score by hour
    pub hourly_std_score: [f64; 24],

    /// Average FSO score by month (0-11)
    pub monthly_avg_score: [f64; 12],
    /// Std dev by month
    pub monthly_std_score: [f64; 12],

    /// Overall availability (fraction of hours link-viable)
    pub availability: f64,

    /// Score statistics
    pub avg_score: f64,
    pub min_score: f64,
    pub max_score: f64,
    pub score_variance: f64,

    /// Best hours for FSO (top 6 hours by average score)
    pub best_hours: Vec<u8>,
    /// Worst hours
    pub worst_hours: Vec<u8>,

    /// Best months (0-11)
    pub best_months: Vec<u8>,
    /// Worst months
    pub worst_months: Vec<u8>,

    /// Data quality
    pub total_hours_analyzed: u32,
    pub data_start_date: String,
    pub data_end_date: String,
}

/// Historical weather data fetcher
pub struct HistoricalWeatherFetcher {
    client: reqwest::Client,
    config: HistoricalConfig,
}

impl HistoricalWeatherFetcher {
    pub fn new() -> Self {
        Self::with_config(HistoricalConfig::default())
    }

    pub fn with_config(config: HistoricalConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(config.timeout_sec))
            .build()
            .expect("Failed to create HTTP client");

        Self { client, config }
    }

    /// Fetch historical weather and compute pattern for a station
    pub async fn fetch_station_pattern(
        &self,
        station_id: &str,
        lat: f64,
        lon: f64,
    ) -> Result<WeatherPattern, String> {
        // Calculate date range
        let end_date = chrono::Utc::now().date_naive();
        let start_date = end_date - chrono::Duration::days(self.config.days as i64);

        let url = format!(
            "https://archive-api.open-meteo.com/v1/archive?\
            latitude={:.6}&longitude={:.6}&\
            start_date={}&end_date={}&\
            hourly=cloud_cover,precipitation,wind_speed_10m,temperature_2m,relative_humidity_2m,weather_code&\
            timezone=UTC",
            lat, lon,
            start_date.format("%Y-%m-%d"),
            end_date.format("%Y-%m-%d")
        );

        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("API error: {}", response.status()));
        }

        let data: ArchiveResponse = response
            .json()
            .await
            .map_err(|e| format!("Parse error: {}", e))?;

        // Process hourly data into FSO scores
        self.compute_pattern(station_id, lat, lon, &data, &start_date.to_string(), &end_date.to_string())
    }

    /// Compute weather pattern from hourly data
    fn compute_pattern(
        &self,
        station_id: &str,
        lat: f64,
        lon: f64,
        data: &ArchiveResponse,
        start_date: &str,
        end_date: &str,
    ) -> Result<WeatherPattern, String> {
        let n = data.hourly.time.len();
        if n == 0 {
            return Err("No data returned".to_string());
        }

        // Collect scores by hour and month
        let mut hourly_scores: Vec<Vec<f64>> = vec![Vec::new(); 24];
        let mut monthly_scores: Vec<Vec<f64>> = vec![Vec::new(); 12];
        let mut all_scores: Vec<f64> = Vec::with_capacity(n);
        let mut viable_hours = 0u32;

        for i in 0..n {
            // Parse timestamp to get hour and month
            let ts = &data.hourly.time[i];
            let hour = ts[11..13].parse::<usize>().unwrap_or(0);
            let month = ts[5..7].parse::<usize>().unwrap_or(1) - 1; // 0-indexed

            // Build weather conditions
            let cloud = data.hourly.cloud_cover.get(i).copied().unwrap_or(50.0);
            let precip = data.hourly.precipitation.get(i).copied().unwrap_or(0.0);
            let wind = data.hourly.wind_speed_10m.get(i).copied().unwrap_or(5.0);
            let temp = data.hourly.temperature_2m.get(i).copied().unwrap_or(20.0);
            let humid = data.hourly.relative_humidity_2m.get(i).copied().unwrap_or(50.0);
            let weather_code = data.hourly.weather_code.get(i).copied().unwrap_or(0);

            // Estimate visibility from weather code
            let visibility = match weather_code {
                0..=3 => 50.0,
                45..=48 => 1.0,   // Fog
                51..=67 => 8.0,   // Drizzle/rain
                71..=86 => 3.0,   // Snow
                95..=99 => 3.0,   // Thunderstorm
                _ => 20.0,
            };

            // Estimate precip probability from code
            let precip_prob = match weather_code {
                0..=3 => 0.0,
                45..=48 => 0.1,
                51..=67 => 0.8,
                71..=86 => 0.9,
                95..=99 => 0.95,
                _ => 0.2,
            };

            let conditions = WeatherConditions {
                station_id: station_id.to_string(),
                cloud_cover_pct: cloud,
                visibility_km: visibility,
                precip_probability: precip_prob,
                precip_intensity: precip,
                wind_speed_ms: wind / 3.6, // km/h to m/s
                temperature_c: temp,
                humidity_pct: humid,
                timestamp: 0,
                annual_sunshine_hours: None,
                clear_days_per_year: None,
                clear_nights_per_year: None,
                precip_days_per_year: None,
                is_daytime: None,
                air_quality_index: None,
                pm25_ugm3: None,
                pm10_ugm3: None,
            };

            let fso = conditions.to_fso_score();
            let score = fso.quality;

            all_scores.push(score);
            hourly_scores[hour].push(score);
            monthly_scores[month].push(score);

            if fso.link_viable {
                viable_hours += 1;
            }
        }

        // Compute statistics
        let availability = viable_hours as f64 / n as f64;

        let avg_score = all_scores.iter().sum::<f64>() / all_scores.len() as f64;
        let min_score = all_scores.iter().cloned().fold(f64::MAX, f64::min);
        let max_score = all_scores.iter().cloned().fold(f64::MIN, f64::max);

        let variance = all_scores.iter()
            .map(|s| (s - avg_score).powi(2))
            .sum::<f64>() / all_scores.len() as f64;

        // Hourly averages and std devs
        let mut hourly_avg_score = [0.0f64; 24];
        let mut hourly_std_score = [0.0f64; 24];
        for h in 0..24 {
            if !hourly_scores[h].is_empty() {
                let avg = hourly_scores[h].iter().sum::<f64>() / hourly_scores[h].len() as f64;
                hourly_avg_score[h] = avg;
                hourly_std_score[h] = (hourly_scores[h].iter()
                    .map(|s| (s - avg).powi(2))
                    .sum::<f64>() / hourly_scores[h].len() as f64).sqrt();
            }
        }

        // Monthly averages and std devs
        let mut monthly_avg_score = [0.0f64; 12];
        let mut monthly_std_score = [0.0f64; 12];
        for m in 0..12 {
            if !monthly_scores[m].is_empty() {
                let avg = monthly_scores[m].iter().sum::<f64>() / monthly_scores[m].len() as f64;
                monthly_avg_score[m] = avg;
                monthly_std_score[m] = (monthly_scores[m].iter()
                    .map(|s| (s - avg).powi(2))
                    .sum::<f64>() / monthly_scores[m].len() as f64).sqrt();
            }
        }

        // Find best/worst hours
        let mut hour_ranked: Vec<(u8, f64)> = hourly_avg_score.iter()
            .enumerate()
            .map(|(h, s)| (h as u8, *s))
            .collect();
        hour_ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        let best_hours: Vec<u8> = hour_ranked.iter().take(6).map(|(h, _)| *h).collect();
        let worst_hours: Vec<u8> = hour_ranked.iter().rev().take(6).map(|(h, _)| *h).collect();

        // Find best/worst months
        let mut month_ranked: Vec<(u8, f64)> = monthly_avg_score.iter()
            .enumerate()
            .map(|(m, s)| (m as u8, *s))
            .collect();
        month_ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        let best_months: Vec<u8> = month_ranked.iter().take(3).map(|(m, _)| *m).collect();
        let worst_months: Vec<u8> = month_ranked.iter().rev().take(3).map(|(m, _)| *m).collect();

        Ok(WeatherPattern {
            station_id: station_id.to_string(),
            latitude: lat,
            longitude: lon,
            hourly_avg_score,
            hourly_std_score,
            monthly_avg_score,
            monthly_std_score,
            availability,
            avg_score,
            min_score,
            max_score,
            score_variance: variance,
            best_hours,
            worst_hours,
            best_months,
            worst_months,
            total_hours_analyzed: n as u32,
            data_start_date: start_date.to_string(),
            data_end_date: end_date.to_string(),
        })
    }

    /// Fetch patterns for multiple stations in parallel
    pub async fn fetch_batch(
        &self,
        stations: &[(String, f64, f64)], // (id, lat, lon)
    ) -> HashMap<String, Result<WeatherPattern, String>> {
        use futures::future::join_all;

        let futures: Vec<_> = stations.iter()
            .map(|(id, lat, lon)| {
                let id = id.clone();
                let lat = *lat;
                let lon = *lon;
                async move {
                    let result = self.fetch_station_pattern(&id, lat, lon).await;
                    (id, result)
                }
            })
            .collect();

        join_all(futures).await.into_iter().collect()
    }
}

impl Default for HistoricalWeatherFetcher {
    fn default() -> Self {
        Self::new()
    }
}

// NOTE: satellite_ann module integration removed - module doesn't exist yet
// When satellite_ann is implemented, add:
// impl From<WeatherPattern> for crate::satellite_ann::WeatherPattern { ... }

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fetch_historical() {
        let fetcher = HistoricalWeatherFetcher::with_config(HistoricalConfig {
            days: 30, // Just 30 days for test
            timeout_sec: 60,
        });

        // New York City
        let result = fetcher.fetch_station_pattern("NYC", 40.7128, -74.0060).await;

        match result {
            Ok(pattern) => {
                println!("Pattern for NYC:");
                println!("  Availability: {:.1}%", pattern.availability * 100.0);
                println!("  Avg score: {:.3}", pattern.avg_score);
                println!("  Best hours: {:?}", pattern.best_hours);
                println!("  Best months: {:?}", pattern.best_months);
                assert!(pattern.availability >= 0.0 && pattern.availability <= 1.0);
            }
            Err(e) => {
                // Network errors acceptable in CI
                println!("API error (may be expected): {}", e);
            }
        }
    }
}
