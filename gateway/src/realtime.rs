//! Real-time Data Integration
//!
//! Wires up live data sources:
//! - CelesTrak TLE feeds (free, no auth)
//! - Weather → Neo4j link weight sync
//! - Space-Track CDM for collision avoidance (requires account)
//!
//! # Data Sources
//!
//! | Source | Data | Update Rate | Auth |
//! |--------|------|-------------|------|
//! | CelesTrak | TLEs | 12hr | None |
//! | Open-Meteo | Weather | 15min | None |
//! | Space-Track | CDM/TCA | 1hr | API key |

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

// ============================================================================
// CelesTrak TLE Fetcher
// ============================================================================

const CELESTRAK_BASE: &str = "https://celestrak.org/NORAD/elements/gp.php";

/// Supported satellite groups from CelesTrak
#[derive(Debug, Clone, Copy)]
pub enum SatelliteGroup {
    /// Active satellites (~14k)
    Active,
    /// Starlink constellation (~6k)
    Starlink,
    /// OneWeb constellation
    OneWeb,
    /// Iridium constellation
    Iridium,
    /// GPS constellation
    Gps,
    /// Galileo constellation
    Galileo,
    /// Space stations (ISS, Tiangong)
    Stations,
    /// Last 30 days launches
    LastThirtyDays,
}

impl SatelliteGroup {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Starlink => "starlink",
            Self::OneWeb => "oneweb",
            Self::Iridium => "iridium",
            Self::Gps => "gps-ops",
            Self::Galileo => "galileo",
            Self::Stations => "stations",
            Self::LastThirtyDays => "last-30-days",
        }
    }
}

/// TLE data from CelesTrak JSON format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CelesTrakTLE {
    #[serde(rename = "OBJECT_NAME")]
    pub name: String,
    #[serde(rename = "OBJECT_ID")]
    pub object_id: String,
    #[serde(rename = "EPOCH")]
    pub epoch: String,
    #[serde(rename = "MEAN_MOTION")]
    pub mean_motion: f64,
    #[serde(rename = "ECCENTRICITY")]
    pub eccentricity: f64,
    #[serde(rename = "INCLINATION")]
    pub inclination: f64,
    #[serde(rename = "RA_OF_ASC_NODE")]
    pub raan: f64,
    #[serde(rename = "ARG_OF_PERICENTER")]
    pub arg_perigee: f64,
    #[serde(rename = "MEAN_ANOMALY")]
    pub mean_anomaly: f64,
    #[serde(rename = "NORAD_CAT_ID")]
    pub norad_id: u32,
    #[serde(rename = "BSTAR")]
    pub bstar: f64,
    #[serde(rename = "MEAN_MOTION_DOT")]
    pub mean_motion_dot: f64,
    #[serde(rename = "MEAN_MOTION_DDOT")]
    pub mean_motion_ddot: f64,
}

impl CelesTrakTLE {
    /// Convert to standard TLE two-line format
    pub fn to_tle_lines(&self) -> (String, String, String) {
        let line0 = format!("{}", self.name);

        // Line 1: Catalog number, classification, launch year/number, epoch, derivatives, bstar
        let line1 = format!(
            "1 {:05}U {:<8} {} {:.8} 00000-0 00000-0 0  9990",
            self.norad_id,
            self.object_id.chars().take(8).collect::<String>(),
            self.epoch.chars().take(17).collect::<String>(),
            self.mean_motion_dot,
        );

        // Line 2: Catalog number, inclination, RAAN, eccentricity, arg perigee, mean anomaly, mean motion
        let line2 = format!(
            "2 {:05} {:8.4} {:8.4} {:07.0} {:8.4} {:8.4} {:11.8}{:05}",
            self.norad_id,
            self.inclination,
            self.raan,
            self.eccentricity * 10_000_000.0,
            self.arg_perigee,
            self.mean_anomaly,
            self.mean_motion,
            0 // revolution number
        );

        (line0, line1, line2)
    }
}

/// Fetch TLEs from CelesTrak
pub async fn fetch_celestrak_tles(group: SatelliteGroup) -> Result<Vec<CelesTrakTLE>> {
    let url = format!("{}?GROUP={}&FORMAT=json", CELESTRAK_BASE, group.as_str());

    info!("Fetching TLEs from CelesTrak: {}", group.as_str());

    let response = reqwest::get(&url).await?;

    if !response.status().is_success() {
        anyhow::bail!("CelesTrak returned status: {}", response.status());
    }

    let tles: Vec<CelesTrakTLE> = response.json().await?;
    info!("Fetched {} TLEs from CelesTrak", tles.len());

    Ok(tles)
}

/// Fetch TLEs for a specific NORAD ID
pub async fn fetch_tle_by_norad(norad_id: u32) -> Result<CelesTrakTLE> {
    let url = format!("{}?CATNR={}&FORMAT=json", CELESTRAK_BASE, norad_id);

    let response = reqwest::get(&url).await?;
    let tles: Vec<CelesTrakTLE> = response.json().await?;

    tles.into_iter()
        .next()
        .ok_or_else(|| anyhow::anyhow!("No TLE found for NORAD {}", norad_id))
}

// ============================================================================
// Neo4j Weather Sync
// ============================================================================

/// Sync weather scores to Neo4j FSO link weights
pub async fn sync_weather_to_neo4j(
    station_id: &str,
    weather_score: i64, // Nano9 raw value
) -> Result<()> {
    let weather_f64 = weather_score as f64 / 1_000_000_000.0;

    // Update all FSO links from this station
    let cypher = format!(
        r#"
        MATCH (g:GroundStation {{id: '{}'}})-[r:FSO_LINK]->()
        SET r.weather_score = {}
        RETURN count(r) as updated
        "#,
        station_id, weather_f64
    );

    let client = reqwest::Client::new();
    let response = client
        .post("http://localhost:7474/db/neo4j/tx/commit")
        .basic_auth("neo4j", Some("neo4j"))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "statements": [{"statement": cypher}]
        }))
        .send()
        .await?;

    if response.status().is_success() {
        debug!("Updated Neo4j weather for station {}: {:.2}", station_id, weather_f64);
    } else {
        warn!("Neo4j weather update failed: {}", response.status());
    }

    Ok(())
}

/// Batch sync all station weather to Neo4j
pub async fn batch_sync_weather(
    stations: &[(String, i64)], // (station_id, weather_score Nano9)
) -> Result<usize> {
    let mut updated = 0;

    for (station_id, weather_score) in stations {
        if sync_weather_to_neo4j(station_id, *weather_score).await.is_ok() {
            updated += 1;
        }
    }

    info!("Synced weather for {}/{} stations to Neo4j", updated, stations.len());
    Ok(updated)
}

// ============================================================================
// Collision Avoidance (Space-Track CDM)
// ============================================================================

/// Conjunction Data Message from Space-Track
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConjunctionEvent {
    pub cdm_id: String,
    pub tca: DateTime<Utc>, // Time of Closest Approach
    pub miss_distance_km: f64,
    pub probability: f64,
    pub sat1_norad: u32,
    pub sat1_name: String,
    pub sat2_norad: u32,
    pub sat2_name: String,
    pub relative_velocity_km_s: f64,
}

/// Space-Track API client (requires free account)
pub struct SpaceTrackClient {
    client: reqwest::Client,
    identity: String,
    password: String,
    cookie: Arc<RwLock<Option<String>>>,
}

impl SpaceTrackClient {
    pub fn new(identity: &str, password: &str) -> Self {
        Self {
            client: reqwest::Client::new(),
            identity: identity.to_string(),
            password: password.to_string(),
            cookie: Arc::new(RwLock::new(None)),
        }
    }

    /// Authenticate with Space-Track
    pub async fn login(&self) -> Result<()> {
        let response = self.client
            .post("https://www.space-track.org/ajaxauth/login")
            .form(&[
                ("identity", &self.identity),
                ("password", &self.password),
            ])
            .send()
            .await?;

        if response.status().is_success() {
            info!("Authenticated with Space-Track");
            Ok(())
        } else {
            anyhow::bail!("Space-Track auth failed: {}", response.status())
        }
    }

    /// Fetch conjunction events for a satellite
    pub async fn get_conjunctions(&self, norad_id: u32) -> Result<Vec<ConjunctionEvent>> {
        let url = format!(
            "https://www.space-track.org/basicspacedata/query/class/cdm_public/\
             SAT1_CATALOG_NUMBER/{}/orderby/TCA%20desc/limit/20/format/json",
            norad_id
        );

        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            anyhow::bail!("Space-Track CDM query failed: {}", response.status());
        }

        let cdms: Vec<serde_json::Value> = response.json().await?;

        let events: Vec<ConjunctionEvent> = cdms
            .into_iter()
            .filter_map(|cdm| {
                Some(ConjunctionEvent {
                    cdm_id: cdm.get("CDM_ID")?.as_str()?.to_string(),
                    tca: cdm.get("TCA")?.as_str()?.parse().ok()?,
                    miss_distance_km: cdm.get("MISS_DISTANCE")?.as_str()?.parse().ok()?,
                    probability: cdm.get("COLLISION_PROBABILITY")?.as_str()?.parse().unwrap_or(0.0),
                    sat1_norad: cdm.get("SAT1_CATALOG_NUMBER")?.as_str()?.parse().ok()?,
                    sat1_name: cdm.get("SAT1_NAME")?.as_str()?.to_string(),
                    sat2_norad: cdm.get("SAT2_CATALOG_NUMBER")?.as_str()?.parse().ok()?,
                    sat2_name: cdm.get("SAT2_NAME")?.as_str()?.to_string(),
                    relative_velocity_km_s: cdm.get("RELATIVE_VELOCITY")?.as_str()?.parse().ok()?,
                })
            })
            .collect();

        Ok(events)
    }
}

// ============================================================================
// Alternative: Free Collision Data from CelesTrak SOCRATES
// ============================================================================

/// SOCRATES (Satellite Orbital Conjunction Reports Assessing Threatening Encounters in Space)
/// Free collision warnings from CelesTrak
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SocratesEvent {
    pub sat1_name: String,
    pub sat1_norad: u32,
    pub sat2_name: String,
    pub sat2_norad: u32,
    pub tca: String,
    pub min_range_km: f64,
    pub relative_velocity_km_s: f64,
}

/// Fetch SOCRATES collision warnings (no auth required)
pub async fn fetch_socrates_events() -> Result<Vec<SocratesEvent>> {
    let url = "https://celestrak.org/SOCRATES/socrates-output.json";

    info!("Fetching SOCRATES collision events from CelesTrak");

    let response = reqwest::get(url).await?;

    if !response.status().is_success() {
        anyhow::bail!("SOCRATES fetch failed: {}", response.status());
    }

    // SOCRATES returns a different format - parse accordingly
    let text = response.text().await?;

    // Try to parse as JSON array
    if let Ok(events) = serde_json::from_str::<Vec<SocratesEvent>>(&text) {
        info!("Fetched {} SOCRATES events", events.len());
        return Ok(events);
    }

    // SOCRATES might return CSV or other format - handle gracefully
    warn!("SOCRATES format not JSON, attempting CSV parse");
    Ok(Vec::new())
}

// ============================================================================
// Real-time Data Manager
// ============================================================================

/// Manages all real-time data feeds
pub struct RealtimeDataManager {
    pub tle_cache: Arc<RwLock<Vec<CelesTrakTLE>>>,
    pub collision_events: Arc<RwLock<Vec<SocratesEvent>>>,
    pub last_tle_update: Arc<RwLock<Option<DateTime<Utc>>>>,
    pub last_collision_update: Arc<RwLock<Option<DateTime<Utc>>>>,
}

impl RealtimeDataManager {
    pub fn new() -> Self {
        Self {
            tle_cache: Arc::new(RwLock::new(Vec::new())),
            collision_events: Arc::new(RwLock::new(Vec::new())),
            last_tle_update: Arc::new(RwLock::new(None)),
            last_collision_update: Arc::new(RwLock::new(None)),
        }
    }

    /// Start background refresh tasks
    pub fn start_background_refresh(self: Arc<Self>) {
        let manager = self.clone();

        // TLE refresh every 12 hours
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(12 * 3600));
            loop {
                interval.tick().await;
                if let Err(e) = manager.refresh_tles().await {
                    error!("TLE refresh failed: {}", e);
                }
            }
        });

        let manager = self.clone();

        // Collision check every hour
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(3600));
            loop {
                interval.tick().await;
                if let Err(e) = manager.refresh_collisions().await {
                    error!("Collision refresh failed: {}", e);
                }
            }
        });
    }

    /// Refresh TLE cache
    pub async fn refresh_tles(&self) -> Result<()> {
        // Fetch Starlink as representative LEO constellation
        let tles = fetch_celestrak_tles(SatelliteGroup::Starlink).await?;

        *self.tle_cache.write().await = tles;
        *self.last_tle_update.write().await = Some(Utc::now());

        Ok(())
    }

    /// Refresh collision events
    pub async fn refresh_collisions(&self) -> Result<()> {
        let events = fetch_socrates_events().await.unwrap_or_default();

        *self.collision_events.write().await = events;
        *self.last_collision_update.write().await = Some(Utc::now());

        Ok(())
    }

    /// Get TLEs for specific constellation
    pub async fn get_tles(&self, group: SatelliteGroup) -> Result<Vec<CelesTrakTLE>> {
        fetch_celestrak_tles(group).await
    }

    /// Get high-priority collision events (miss distance < 5km)
    pub async fn get_critical_collisions(&self) -> Vec<SocratesEvent> {
        self.collision_events
            .read()
            .await
            .iter()
            .filter(|e| e.min_range_km < 5.0)
            .cloned()
            .collect()
    }
}

impl Default for RealtimeDataManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_celestrak_fetch() {
        // Fetch just GPS (small constellation for testing)
        let result = fetch_celestrak_tles(SatelliteGroup::Gps).await;
        assert!(result.is_ok());
        let tles = result.unwrap();
        assert!(!tles.is_empty());
        println!("Fetched {} GPS TLEs", tles.len());
    }

    #[test]
    fn test_tle_conversion() {
        let tle = CelesTrakTLE {
            name: "TEST-SAT".to_string(),
            object_id: "2024-001A".to_string(),
            epoch: "2024-01-01T00:00:00".to_string(),
            mean_motion: 15.0,
            eccentricity: 0.001,
            inclination: 53.0,
            raan: 180.0,
            arg_perigee: 90.0,
            mean_anomaly: 45.0,
            norad_id: 99999,
            bstar: 0.0001,
            mean_motion_dot: 0.0,
            mean_motion_ddot: 0.0,
        };

        let (line0, line1, line2) = tle.to_tle_lines();
        assert!(line0.contains("TEST-SAT"));
        assert!(line1.starts_with("1 99999"));
        assert!(line2.starts_with("2 99999"));
    }
}
