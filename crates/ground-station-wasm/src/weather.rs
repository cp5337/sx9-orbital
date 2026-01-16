//! Weather API Integration for FSO Link Quality
//!
//! Integrates with weather services to assess FSO link viability:
//! - Cloud cover (primary FSO blocker)
//! - Visibility (atmospheric turbulence)
//! - Precipitation (rain/snow causes scattering)
//! - Wind (affects pointing stability)

use serde::{Deserialize, Serialize};

/// Weather conditions affecting FSO link quality
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherConditions {
    /// Location identifier
    pub station_id: String,
    /// Cloud cover percentage (0-100)
    pub cloud_cover_pct: f64,
    /// Visibility in km
    pub visibility_km: f64,
    /// Precipitation probability (0-1)
    pub precip_probability: f64,
    /// Precipitation intensity (mm/h)
    pub precip_intensity: f64,
    /// Wind speed (m/s)
    pub wind_speed_ms: f64,
    /// Temperature (Celsius)
    pub temperature_c: f64,
    /// Humidity (0-100)
    pub humidity_pct: f64,
    /// Unix timestamp
    pub timestamp: i64,
}

/// FSO weather quality score (0-1, 1 = optimal)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsoWeatherScore {
    pub station_id: String,
    /// Overall quality score (0-1)
    pub quality: f64,
    /// Cloud impact (0-1, 1 = no clouds)
    pub cloud_score: f64,
    /// Visibility impact (0-1, 1 = clear)
    pub visibility_score: f64,
    /// Precipitation impact (0-1, 1 = no precip)
    pub precip_score: f64,
    /// Turbulence/wind impact (0-1, 1 = calm)
    pub turbulence_score: f64,
    /// Whether link is viable at all
    pub link_viable: bool,
    /// Reason if not viable
    pub degradation_reason: Option<String>,
}

impl WeatherConditions {
    /// Calculate FSO weather quality score
    pub fn to_fso_score(&self) -> FsoWeatherScore {
        // Cloud cover is primary FSO blocker
        // 0% = perfect, 100% = total blockage
        let cloud_score = 1.0 - (self.cloud_cover_pct / 100.0).min(1.0);

        // Visibility: < 1km is critical, > 20km is excellent
        let visibility_score = match self.visibility_km {
            v if v < 1.0 => 0.1,
            v if v < 5.0 => 0.3 + 0.2 * (v - 1.0) / 4.0,
            v if v < 10.0 => 0.5 + 0.2 * (v - 5.0) / 5.0,
            v if v < 20.0 => 0.7 + 0.2 * (v - 10.0) / 10.0,
            _ => 0.9,
        };

        // Precipitation: any significant precip blocks FSO
        let precip_score = if self.precip_intensity > 0.5 {
            0.1 // Heavy precip = almost total blockage
        } else if self.precip_intensity > 0.1 {
            0.3 + 0.4 * (1.0 - self.precip_intensity / 0.5)
        } else if self.precip_probability > 0.5 {
            0.7 // High probability but not yet precipitating
        } else {
            1.0 - self.precip_probability * 0.3
        };

        // Wind affects pointing stability
        // > 20 m/s is problematic for fine pointing
        let turbulence_score = match self.wind_speed_ms {
            w if w > 25.0 => 0.3,
            w if w > 15.0 => 0.5 + 0.2 * (25.0 - w) / 10.0,
            w if w > 10.0 => 0.7 + 0.2 * (15.0 - w) / 5.0,
            _ => 0.9 + 0.1 * (10.0 - self.wind_speed_ms) / 10.0,
        };

        // Weighted composite score
        let quality = 0.40 * cloud_score
            + 0.25 * visibility_score
            + 0.25 * precip_score
            + 0.10 * turbulence_score;

        // Determine if link is viable
        let (link_viable, degradation_reason) = if cloud_score < 0.2 {
            (false, Some("Heavy cloud cover".to_string()))
        } else if visibility_score < 0.3 {
            (false, Some("Poor visibility".to_string()))
        } else if precip_score < 0.2 {
            (false, Some("Active precipitation".to_string()))
        } else if quality < 0.3 {
            (false, Some("Multiple degradation factors".to_string()))
        } else {
            (true, None)
        };

        FsoWeatherScore {
            station_id: self.station_id.clone(),
            quality,
            cloud_score,
            visibility_score,
            precip_score,
            turbulence_score,
            link_viable,
            degradation_reason,
        }
    }
}

/// Weather data provider interface
pub trait WeatherProvider: Send + Sync {
    /// Get current weather for a location
    fn get_current(&self, lat: f64, lon: f64) -> Option<WeatherConditions>;

    /// Get forecast for next N hours
    fn get_forecast(&self, lat: f64, lon: f64, hours: usize) -> Vec<WeatherConditions>;
}

/// Mock weather provider for testing/demo
pub struct MockWeatherProvider;

impl MockWeatherProvider {
    pub fn new() -> Self {
        Self
    }

    /// Generate realistic weather based on latitude
    pub fn generate_for_location(&self, station_id: &str, lat: f64, lon: f64) -> WeatherConditions {
        let abs_lat = lat.abs();

        // Desert/arid regions have better weather
        let (cloud_base, visibility_base) = if abs_lat > 15.0 && abs_lat < 35.0 {
            (20.0, 30.0) // Subtropical arid - best
        } else if abs_lat < 15.0 {
            (50.0, 15.0) // Tropical - cloudy
        } else if abs_lat < 55.0 {
            (40.0, 20.0) // Temperate - variable
        } else {
            (60.0, 10.0) // High latitude - poor
        };

        // Add some variation based on longitude (simulate time of day effects)
        let hour_factor = (lon.to_radians().sin() + 1.0) / 2.0;

        WeatherConditions {
            station_id: station_id.to_string(),
            cloud_cover_pct: (cloud_base + hour_factor * 20.0).min(100.0),
            visibility_km: visibility_base + hour_factor * 10.0,
            precip_probability: if cloud_base > 40.0 { 0.2 } else { 0.05 },
            precip_intensity: 0.0,
            wind_speed_ms: 5.0 + hour_factor * 10.0,
            temperature_c: 20.0 - abs_lat * 0.5,
            humidity_pct: 40.0 + cloud_base * 0.5,
            timestamp: chrono::Utc::now().timestamp(),
        }
    }
}

impl Default for MockWeatherProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl WeatherProvider for MockWeatherProvider {
    fn get_current(&self, lat: f64, lon: f64) -> Option<WeatherConditions> {
        Some(self.generate_for_location("mock", lat, lon))
    }

    fn get_forecast(&self, lat: f64, lon: f64, hours: usize) -> Vec<WeatherConditions> {
        (0..hours)
            .map(|h| {
                let mut wx = self.generate_for_location("mock", lat, lon);
                wx.timestamp += (h as i64) * 3600;
                // Add some forecast uncertainty
                wx.cloud_cover_pct = (wx.cloud_cover_pct + (h as f64) * 2.0).min(100.0);
                wx
            })
            .collect()
    }
}

/// Open-Meteo API provider (free, no API key required)
#[cfg(feature = "weather-api")]
pub struct OpenMeteoProvider {
    client: reqwest::Client,
    base_url: String,
}

#[cfg(feature = "weather-api")]
impl OpenMeteoProvider {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
            base_url: "https://api.open-meteo.com/v1".to_string(),
        }
    }

    pub async fn fetch_weather(&self, lat: f64, lon: f64) -> Result<WeatherConditions, String> {
        let url = format!(
            "{}/forecast?latitude={}&longitude={}&current=cloud_cover,visibility,precipitation,wind_speed_10m,temperature_2m,relative_humidity_2m&forecast_hours=1",
            self.base_url, lat, lon
        );

        // Would make actual HTTP request here
        // Placeholder for now
        Err("Not implemented".to_string())
    }
}

/// Weather impact on FSO link budget
pub fn apply_weather_to_link(
    base_margin_db: f64,
    weather: &FsoWeatherScore,
) -> (f64, bool) {
    if !weather.link_viable {
        return (-100.0, false);
    }

    // Weather reduces margin
    // quality of 1.0 = no reduction
    // quality of 0.5 = -6 dB reduction
    // quality of 0.3 = -10 dB reduction
    let weather_loss_db = -10.0 * (1.0 - weather.quality).log10().max(-20.0);

    let adjusted_margin = base_margin_db - weather_loss_db;
    let viable = adjusted_margin > 0.0;

    (adjusted_margin, viable)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clear_weather_score() {
        let wx = WeatherConditions {
            station_id: "test".to_string(),
            cloud_cover_pct: 5.0,
            visibility_km: 50.0,
            precip_probability: 0.0,
            precip_intensity: 0.0,
            wind_speed_ms: 3.0,
            temperature_c: 20.0,
            humidity_pct: 40.0,
            timestamp: 0,
        };

        let score = wx.to_fso_score();
        assert!(score.quality > 0.9, "Clear weather should have high score: {}", score.quality);
        assert!(score.link_viable, "Link should be viable in clear weather");
    }

    #[test]
    fn test_cloudy_weather_blocks_link() {
        let wx = WeatherConditions {
            station_id: "test".to_string(),
            cloud_cover_pct: 95.0,
            visibility_km: 5.0,
            precip_probability: 0.5,
            precip_intensity: 0.0,
            wind_speed_ms: 10.0,
            temperature_c: 15.0,
            humidity_pct: 80.0,
            timestamp: 0,
        };

        let score = wx.to_fso_score();
        assert!(!score.link_viable, "Heavy cloud cover should block link");
        assert!(score.cloud_score < 0.2, "Cloud score should be low");
    }

    #[test]
    fn test_precipitation_blocks_link() {
        let wx = WeatherConditions {
            station_id: "test".to_string(),
            cloud_cover_pct: 80.0,
            visibility_km: 3.0,
            precip_probability: 0.9,
            precip_intensity: 2.0, // Heavy rain
            wind_speed_ms: 15.0,
            temperature_c: 10.0,
            humidity_pct: 90.0,
            timestamp: 0,
        };

        let score = wx.to_fso_score();
        assert!(!score.link_viable, "Heavy precipitation should block link");
    }

    #[test]
    fn test_mock_provider_latitude_variation() {
        let provider = MockWeatherProvider::new();

        // Desert latitude (should be good weather)
        let desert_wx = provider.generate_for_location("desert", 25.0, 0.0);
        let desert_score = desert_wx.to_fso_score();

        // Tropical latitude (should be more cloudy)
        let tropical_wx = provider.generate_for_location("tropical", 5.0, 0.0);
        let tropical_score = tropical_wx.to_fso_score();

        assert!(
            desert_score.quality > tropical_score.quality,
            "Desert should have better weather than tropics"
        );
    }
}
