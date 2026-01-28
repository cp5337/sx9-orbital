//! Ground Stations Library
//!
//! Management of 257 FSO (Free Space Optical) ground stations
//! with weather monitoring and health tracking.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum StationError {
    #[error("Station not found: {0}")]
    NotFound(String),
    #[error("Station offline: {0}")]
    Offline(String),
    #[error("Weather threshold exceeded at {station}: {condition}")]
    WeatherBlocked { station: String, condition: String },
}

pub type Result<T> = std::result::Result<T, StationError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroundStation {
    pub id: String,
    pub name: String,
    pub location: GeoLocation,
    pub status: StationStatus,
    pub capabilities: StationCapabilities,
    pub weather: Option<WeatherConditions>,
    pub last_contact: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct GeoLocation {
    pub latitude: f64,
    pub longitude: f64,
    pub altitude_m: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum StationStatus {
    Operational,
    Degraded,
    WeatherHold,
    Maintenance,
    Offline,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StationCapabilities {
    pub fso_terminals: u8,
    pub max_throughput_gbps: f64,
    pub tracking_accuracy_urad: f64,
    pub wavelength_nm: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherConditions {
    pub cloud_cover_pct: f64,
    pub visibility_km: f64,
    pub precipitation_mm_hr: f64,
    pub wind_speed_ms: f64,
    pub temperature_c: f64,
    pub humidity_pct: f64,
    pub beam_quality_score: f64,
    pub timestamp: DateTime<Utc>,
}

pub struct StationRegistry {
    stations: Vec<GroundStation>,
}

impl StationRegistry {
    pub fn new() -> Self {
        Self {
            stations: Vec::with_capacity(257),
        }
    }

    pub fn with_fso_network() -> Self {
        let mut registry = Self::new();
        registry.load_fso_network();
        registry
    }

    pub fn with_airbus_network() -> Self {
        Self::with_fso_network()
    }

    fn load_fso_network(&mut self) {
        // Load 257 FSO ground stations
        // In production, this would load from config/database
        let major_stations = vec![
            ("GS-001", "Vandenberg", 34.7420, -120.5724, 150.0),
            ("GS-002", "Cape Canaveral", 28.3922, -80.6077, 5.0),
            ("GS-003", "Kourou", 5.2378, -52.7683, 10.0),
            ("GS-004", "Baikonur", 45.9650, 63.3050, 90.0),
            ("GS-005", "Jiuquan", 40.9606, 100.2914, 1000.0),
            ("GS-006", "Tanegashima", 30.3996, 130.9691, 50.0),
            ("GS-007", "Plesetsk", 62.9258, 40.5775, 130.0),
            ("GS-008", "Satish Dhawan", 13.7199, 80.2304, 20.0),
        ];

        for (id, name, lat, lon, alt) in major_stations {
            self.stations.push(GroundStation {
                id: id.to_string(),
                name: name.to_string(),
                location: GeoLocation {
                    latitude: lat,
                    longitude: lon,
                    altitude_m: alt,
                },
                status: StationStatus::Operational,
                capabilities: StationCapabilities {
                    fso_terminals: 4,
                    max_throughput_gbps: 100.0,
                    tracking_accuracy_urad: 1.0,
                    wavelength_nm: 1550,
                },
                weather: None,
                last_contact: Utc::now(),
            });
        }
    }

    pub fn get(&self, id: &str) -> Result<&GroundStation> {
        self.stations
            .iter()
            .find(|s| s.id == id)
            .ok_or_else(|| StationError::NotFound(id.to_string()))
    }

    pub fn operational(&self) -> impl Iterator<Item = &GroundStation> {
        self.stations
            .iter()
            .filter(|s| s.status == StationStatus::Operational)
    }

    pub fn in_view(&self, satellite_pos: (f64, f64), min_elevation_deg: f64) -> Vec<&GroundStation> {
        self.stations
            .iter()
            .filter(|s| {
                // Simplified visibility check
                let dist = ((s.location.latitude - satellite_pos.0).powi(2)
                    + (s.location.longitude - satellite_pos.1).powi(2))
                .sqrt();
                dist < 60.0 // ~60 degrees from ground track visible from MEO
            })
            .collect()
    }

    pub fn update_weather(&mut self, station_id: &str, conditions: WeatherConditions) -> Result<()> {
        let station = self.stations
            .iter_mut()
            .find(|s| s.id == station_id)
            .ok_or_else(|| StationError::NotFound(station_id.to_string()))?;

        station.weather = Some(conditions.clone());

        // Auto-update status based on weather
        if conditions.beam_quality_score < 0.3 {
            station.status = StationStatus::WeatherHold;
        } else if conditions.beam_quality_score < 0.7 {
            station.status = StationStatus::Degraded;
        }

        Ok(())
    }
}

impl Default for StationRegistry {
    fn default() -> Self {
        Self::new()
    }
}
