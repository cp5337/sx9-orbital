//! Ground Station Network Configuration
//!
//! Loads ground stations from multiple sources:
//! - Cable landing points (1,900+ locations)
//! - Equinix IBX data centers (LaserLight PoPs)
//! - Strategic FSO terminal sites
//!
//! Used for network modeling and simulation.

use serde::{Deserialize, Serialize};
use crate::GroundStationConfig;

/// Station type for classification
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StationType {
    /// Cable landing point (submarine fiber termination)
    CableLanding,
    /// Equinix IBX data center (LaserLight PoP)
    EquinixIBX,
    /// Dedicated FSO ground terminal
    FSOTerminal,
    /// Multi-purpose teleport facility
    Teleport,
    /// Research/academic station
    Research,
}

/// Extended ground station with network metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkStation {
    /// Base configuration
    pub config: GroundStationConfig,
    /// Station classification
    pub station_type: StationType,
    /// Country code (ISO 3166-1 alpha-2)
    pub country_code: Option<String>,
    /// Equinix facility code (e.g., "DC11", "LD5")
    pub equinix_code: Option<String>,
    /// Connected cable systems
    pub cable_systems: Vec<String>,
    /// Weather zone for FSO modeling
    pub weather_zone: Option<String>,
    /// Fiber connectivity score (0-1)
    pub fiber_score: f64,
}

impl NetworkStation {
    /// Create from cable landing point JSON
    pub fn from_cable_landing(
        id: &str,
        name: &str,
        latitude: f64,
        longitude: f64,
    ) -> Self {
        Self {
            config: GroundStationConfig {
                id: format!("CL-{}", id),
                name: name.to_string(),
                latitude_deg: latitude,
                longitude_deg: longitude,
                altitude_m: 10.0, // Default coastal altitude
                min_elevation_deg: 10.0,
                max_slew_rate_deg_s: 5.0,
                fov_deg: 0.1,
            },
            station_type: StationType::CableLanding,
            country_code: extract_country_code(name),
            equinix_code: None,
            cable_systems: vec![],
            weather_zone: None,
            fiber_score: 0.8, // Cable landings have good fiber
        }
    }

    /// Create Equinix IBX station
    pub fn equinix(
        code: &str,
        name: &str,
        latitude: f64,
        longitude: f64,
        country: &str,
    ) -> Self {
        Self {
            config: GroundStationConfig {
                id: format!("EQ-{}", code),
                name: format!("Equinix {} - {}", code, name),
                latitude_deg: latitude,
                longitude_deg: longitude,
                altitude_m: 50.0, // Data center elevation
                min_elevation_deg: 10.0,
                max_slew_rate_deg_s: 10.0, // Higher spec for IBX
                fov_deg: 0.05,
            },
            station_type: StationType::EquinixIBX,
            country_code: Some(country.to_string()),
            equinix_code: Some(code.to_string()),
            cable_systems: vec![],
            weather_zone: None,
            fiber_score: 1.0, // Perfect fiber connectivity
        }
    }

    /// Create FSO terminal
    pub fn fso_terminal(
        id: &str,
        name: &str,
        latitude: f64,
        longitude: f64,
        altitude_m: f64,
    ) -> Self {
        Self {
            config: GroundStationConfig {
                id: format!("FSO-{}", id),
                name: name.to_string(),
                latitude_deg: latitude,
                longitude_deg: longitude,
                altitude_m,
                min_elevation_deg: 5.0, // Lower for FSO
                max_slew_rate_deg_s: 15.0, // Fast tracking
                fov_deg: 0.01, // Tight beam
            },
            station_type: StationType::FSOTerminal,
            country_code: None,
            equinix_code: None,
            cable_systems: vec![],
            weather_zone: None,
            fiber_score: 0.5,
        }
    }
}

/// Extract country code from station name
fn extract_country_code(name: &str) -> Option<String> {
    // Common patterns: "City, Country" or "City, State, Country"
    let parts: Vec<&str> = name.split(", ").collect();
    let country = parts.last()?;

    // Map common country names to ISO codes
    match country.to_lowercase().as_str() {
        "united states" | "usa" => Some("US".to_string()),
        "united kingdom" | "uk" => Some("GB".to_string()),
        "south africa" => Some("ZA".to_string()),
        "australia" => Some("AU".to_string()),
        "singapore" => Some("SG".to_string()),
        "japan" => Some("JP".to_string()),
        "germany" => Some("DE".to_string()),
        "france" => Some("FR".to_string()),
        "brazil" => Some("BR".to_string()),
        "india" => Some("IN".to_string()),
        "united arab emirates" | "uae" => Some("AE".to_string()),
        "netherlands" => Some("NL".to_string()),
        "hong kong" => Some("HK".to_string()),
        "maldives" => Some("MV".to_string()),
        "isle of man" => Some("IM".to_string()),
        _ => None,
    }
}

/// Equinix IBX locations with LaserLight PoPs (known/planned)
pub fn equinix_laserlight_pops() -> Vec<NetworkStation> {
    vec![
        // Confirmed LaserLight PoPs
        NetworkStation::equinix("DC11", "Ashburn", 39.0437, -77.4875, "US"),

        // Planned expansion (from press releases)
        NetworkStation::equinix("LD5", "London Slough", 51.5145, -0.5690, "GB"),
        NetworkStation::equinix("TY2", "Tokyo", 35.6762, 139.6503, "JP"),
        NetworkStation::equinix("SP4", "Sao Paulo", -23.5505, -46.6333, "BR"),
        NetworkStation::equinix("SY1", "Sydney", -33.8688, 151.2093, "AU"),
        NetworkStation::equinix("DX1", "Dubai", 25.2048, 55.2708, "AE"),
        NetworkStation::equinix("AM3", "Amsterdam", 52.3676, 4.9041, "NL"),
        NetworkStation::equinix("FR5", "Frankfurt", 50.1109, 8.6821, "DE"),
        NetworkStation::equinix("SG1", "Singapore", 1.3521, 103.8198, "SG"),
        NetworkStation::equinix("HK1", "Hong Kong", 22.3193, 114.1694, "HK"),

        // Additional strategic locations
        NetworkStation::equinix("CH1", "Chicago", 41.8781, -87.6298, "US"),
        NetworkStation::equinix("SV5", "Silicon Valley", 37.3861, -122.0839, "US"),
        NetworkStation::equinix("NY5", "New York", 40.7128, -74.0060, "US"),
        NetworkStation::equinix("LA1", "Los Angeles", 34.0522, -118.2437, "US"),
        NetworkStation::equinix("PA3", "Paris", 48.8566, 2.3522, "FR"),
        NetworkStation::equinix("ML1", "Melbourne", -37.8136, 144.9631, "AU"),
    ]
}

/// South Africa stations (Digital Parks Africa / LaserLight Africa)
pub fn south_africa_stations() -> Vec<NetworkStation> {
    vec![
        // LaserLight Africa - Centurion/Samrand (Digital Parks Africa)
        NetworkStation {
            config: GroundStationConfig {
                id: "DPA-CTN".to_string(),
                name: "Digital Parks Africa Centurion".to_string(),
                latitude_deg: -25.8603,
                longitude_deg: 28.1894,
                altitude_m: 1400.0, // Highveld elevation
                min_elevation_deg: 10.0,
                max_slew_rate_deg_s: 10.0,
                fov_deg: 0.05,
            },
            station_type: StationType::FSOTerminal,
            country_code: Some("ZA".to_string()),
            equinix_code: None,
            cable_systems: vec!["Terrestrial".to_string()],
            weather_zone: Some("highveld".to_string()),
            fiber_score: 0.9,
        },
        // Johannesburg Metro
        NetworkStation {
            config: GroundStationConfig {
                id: "JNB-METRO".to_string(),
                name: "Johannesburg Metro".to_string(),
                latitude_deg: -26.2041,
                longitude_deg: 28.0473,
                altitude_m: 1753.0,
                min_elevation_deg: 10.0,
                max_slew_rate_deg_s: 10.0,
                fov_deg: 0.05,
            },
            station_type: StationType::Teleport,
            country_code: Some("ZA".to_string()),
            equinix_code: None,
            cable_systems: vec![],
            weather_zone: Some("highveld".to_string()),
            fiber_score: 0.85,
        },
        // Cape Town (Teraco)
        NetworkStation {
            config: GroundStationConfig {
                id: "CPT-TC".to_string(),
                name: "Cape Town Teraco".to_string(),
                latitude_deg: -33.9249,
                longitude_deg: 18.4241,
                altitude_m: 15.0,
                min_elevation_deg: 10.0,
                max_slew_rate_deg_s: 10.0,
                fov_deg: 0.05,
            },
            station_type: StationType::Teleport,
            country_code: Some("ZA".to_string()),
            equinix_code: None,
            cable_systems: vec!["WACS".to_string(), "SAT-3".to_string(), "ACE".to_string()],
            weather_zone: Some("coastal".to_string()),
            fiber_score: 0.95,
        },
        // Durban (Raxio)
        NetworkStation {
            config: GroundStationConfig {
                id: "DUR-RX".to_string(),
                name: "Durban Raxio".to_string(),
                latitude_deg: -29.8587,
                longitude_deg: 31.0218,
                altitude_m: 10.0,
                min_elevation_deg: 10.0,
                max_slew_rate_deg_s: 10.0,
                fov_deg: 0.05,
            },
            station_type: StationType::Teleport,
            country_code: Some("ZA".to_string()),
            equinix_code: None,
            cable_systems: vec!["SEACOM".to_string(), "EASSy".to_string()],
            weather_zone: Some("coastal".to_string()),
            fiber_score: 0.9,
        },
    ]
}

/// Strategic HALO Centre locations (LaserLight NOCs)
pub fn halo_centres() -> Vec<NetworkStation> {
    vec![
        // Dover, Kent UK (confirmed)
        NetworkStation {
            config: GroundStationConfig {
                id: "HALO-UK".to_string(),
                name: "HALO Centre Dover".to_string(),
                latitude_deg: 51.1279,
                longitude_deg: 1.3134,
                altitude_m: 20.0,
                min_elevation_deg: 5.0,
                max_slew_rate_deg_s: 15.0,
                fov_deg: 0.01,
            },
            station_type: StationType::FSOTerminal,
            country_code: Some("GB".to_string()),
            equinix_code: None,
            cable_systems: vec!["Multiple UK-EU".to_string()],
            weather_zone: Some("coastal".to_string()),
            fiber_score: 1.0,
        },
        // Australia (beta operational)
        NetworkStation {
            config: GroundStationConfig {
                id: "HALO-AU".to_string(),
                name: "HALO Centre Australia".to_string(),
                latitude_deg: -31.9505,
                longitude_deg: 115.8605,
                altitude_m: 50.0,
                min_elevation_deg: 5.0,
                max_slew_rate_deg_s: 15.0,
                fov_deg: 0.01,
            },
            station_type: StationType::FSOTerminal,
            country_code: Some("AU".to_string()),
            equinix_code: None,
            cable_systems: vec![],
            weather_zone: Some("arid".to_string()),
            fiber_score: 0.9,
        },
        // Chile (planned)
        NetworkStation {
            config: GroundStationConfig {
                id: "HALO-CL".to_string(),
                name: "HALO Centre Chile".to_string(),
                latitude_deg: -33.4489,
                longitude_deg: -70.6693,
                altitude_m: 500.0,
                min_elevation_deg: 5.0,
                max_slew_rate_deg_s: 15.0,
                fov_deg: 0.01,
            },
            station_type: StationType::FSOTerminal,
            country_code: Some("CL".to_string()),
            equinix_code: None,
            cable_systems: vec!["SAm-1".to_string(), "SAC".to_string()],
            weather_zone: Some("coastal".to_string()),
            fiber_score: 0.85,
        },
        // Spain (planned)
        NetworkStation {
            config: GroundStationConfig {
                id: "HALO-ES".to_string(),
                name: "HALO Centre Spain".to_string(),
                latitude_deg: 40.4168,
                longitude_deg: -3.7038,
                altitude_m: 650.0,
                min_elevation_deg: 5.0,
                max_slew_rate_deg_s: 15.0,
                fov_deg: 0.01,
            },
            station_type: StationType::FSOTerminal,
            country_code: Some("ES".to_string()),
            equinix_code: None,
            cable_systems: vec![],
            weather_zone: Some("continental".to_string()),
            fiber_score: 0.9,
        },
    ]
}

/// Empower Space Alliance partners (ATLAS Space Operations network)
pub fn atlas_stations() -> Vec<NetworkStation> {
    vec![
        // ATLAS primary locations (GSaaS network)
        NetworkStation {
            config: GroundStationConfig {
                id: "ATLAS-MI".to_string(),
                name: "ATLAS Traverse City".to_string(),
                latitude_deg: 44.7631,
                longitude_deg: -85.6206,
                altitude_m: 200.0,
                min_elevation_deg: 5.0,
                max_slew_rate_deg_s: 20.0,
                fov_deg: 0.01,
            },
            station_type: StationType::FSOTerminal,
            country_code: Some("US".to_string()),
            equinix_code: None,
            cable_systems: vec![],
            weather_zone: Some("continental".to_string()),
            fiber_score: 0.7,
        },
        // Additional ATLAS locations would go here
        // (Freedom network has ~20 antennas globally)
    ]
}

/// Load all strategic stations for LaserLight network modeling
pub fn load_strategic_stations() -> Vec<NetworkStation> {
    let mut stations = Vec::new();

    // Equinix IBX locations (primary LaserLight PoPs)
    stations.extend(equinix_laserlight_pops());

    // South Africa (LaserLight Africa expansion)
    stations.extend(south_africa_stations());

    // HALO Centre NOCs
    stations.extend(halo_centres());

    // ATLAS Space Operations (Empower Space Alliance)
    stations.extend(atlas_stations());

    stations
}

/// Station statistics
#[derive(Debug, Clone, Serialize)]
pub struct StationStats {
    pub total: usize,
    pub by_type: std::collections::HashMap<String, usize>,
    pub by_country: std::collections::HashMap<String, usize>,
    pub avg_fiber_score: f64,
}

impl StationStats {
    pub fn from_stations(stations: &[NetworkStation]) -> Self {
        use std::collections::HashMap;

        let mut by_type: HashMap<String, usize> = HashMap::new();
        let mut by_country: HashMap<String, usize> = HashMap::new();
        let mut fiber_sum = 0.0;

        for s in stations {
            let type_str = format!("{:?}", s.station_type);
            *by_type.entry(type_str).or_insert(0) += 1;

            if let Some(ref cc) = s.country_code {
                *by_country.entry(cc.clone()).or_insert(0) += 1;
            }

            fiber_sum += s.fiber_score;
        }

        Self {
            total: stations.len(),
            by_type,
            by_country,
            avg_fiber_score: if stations.is_empty() { 0.0 } else { fiber_sum / stations.len() as f64 },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_strategic_stations() {
        let stations = load_strategic_stations();
        assert!(stations.len() >= 20, "Should have at least 20 strategic stations");

        // Check we have Equinix stations
        let equinix_count = stations.iter()
            .filter(|s| s.station_type == StationType::EquinixIBX)
            .count();
        assert!(equinix_count >= 10, "Should have Equinix stations");

        // Check we have South Africa
        let za_count = stations.iter()
            .filter(|s| s.country_code.as_deref() == Some("ZA"))
            .count();
        assert!(za_count >= 3, "Should have South African stations");
    }

    #[test]
    fn test_station_stats() {
        let stations = load_strategic_stations();
        let stats = StationStats::from_stations(&stations);

        println!("Station statistics: {:?}", stats);
        assert!(stats.total > 0);
        assert!(stats.avg_fiber_score > 0.5);
    }

    #[test]
    fn test_equinix_dc11() {
        let pops = equinix_laserlight_pops();
        let dc11 = pops.iter().find(|s| s.equinix_code.as_deref() == Some("DC11"));
        assert!(dc11.is_some(), "DC11 should be first LaserLight PoP");

        let dc11 = dc11.unwrap();
        assert!(dc11.config.latitude_deg > 38.0 && dc11.config.latitude_deg < 40.0);
    }
}
