//! Data loading from JSON files

use crate::{Candidate, Result, SelectorError};
use serde::Deserialize;
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use tracing::info;

/// Validate latitude is in valid range
fn is_valid_latitude(lat: f64) -> bool {
    (-90.0..=90.0).contains(&lat) && lat.is_finite()
}

/// Validate longitude is in valid range
fn is_valid_longitude(lon: f64) -> bool {
    (-180.0..=180.0).contains(&lon) && lon.is_finite()
}

/// Sanitize ID to prevent injection (alphanumeric, dash, underscore only)
fn sanitize_id(id: String) -> String {
    id.chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .take(128) // Max length
        .collect()
}

/// Sanitize name (allow more chars but still limit)
fn sanitize_name(name: String) -> String {
    name.chars()
        .filter(|c| c.is_alphanumeric() || " -_.,()&'".contains(*c))
        .take(256)
        .collect()
}

/// Raw ground node from JSON
#[derive(Debug, Deserialize)]
struct RawGroundNode {
    id: Option<String>,
    name: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    tier: Option<u8>,
    demand_gbps: Option<f64>,
    weather_score: Option<f64>,
}

/// Raw cable landing point from JSON
#[derive(Debug, Deserialize)]
struct RawCableLanding {
    id: Option<String>,
    name: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    cable_count: Option<u32>,
    cables: Option<Vec<String>>,
}

/// Container for cable landing JSON
#[derive(Debug, Deserialize)]
struct CableLandingFile {
    landing_points: Option<Vec<RawCableLanding>>,
    #[serde(flatten)]
    points: Option<Vec<RawCableLanding>>,
}

/// Load ground nodes from JSON file
pub fn load_ground_nodes(path: impl AsRef<Path>) -> Result<Vec<Candidate>> {
    let path = path.as_ref();
    info!("Loading ground nodes from {:?}", path);

    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let nodes: Vec<RawGroundNode> = serde_json::from_reader(reader)?;

    let mut candidates = Vec::new();
    let mut skipped = 0;

    for (i, node) in nodes.into_iter().enumerate() {
        let lat = match node.latitude {
            Some(l) if is_valid_latitude(l) => l,
            Some(_) => {
                skipped += 1;
                continue; // Invalid latitude range
            }
            None => {
                skipped += 1;
                continue;
            }
        };
        let lon = match node.longitude {
            Some(l) if is_valid_longitude(l) => l,
            Some(_) => {
                skipped += 1;
                continue; // Invalid longitude range
            }
            None => {
                skipped += 1;
                continue;
            }
        };

        let id = sanitize_id(node.id.unwrap_or_else(|| format!("gn-{}", i)));
        let name = sanitize_name(node.name.unwrap_or_else(|| "Unknown".to_string()));

        candidates.push(Candidate::from_ground_node(
            id,
            name,
            lat,
            lon,
            node.tier,
            node.demand_gbps,
            node.weather_score,
        ));
    }

    info!(
        "Loaded {} ground nodes ({} skipped for missing coords)",
        candidates.len(),
        skipped
    );

    Ok(candidates)
}

/// Load cable landing points from JSON file
pub fn load_cable_landings(path: impl AsRef<Path>) -> Result<Vec<Candidate>> {
    let path = path.as_ref();
    info!("Loading cable landings from {:?}", path);

    let file = File::open(path)?;
    let reader = BufReader::new(file);

    // Try parsing as object with landing_points field first
    let raw: serde_json::Value = serde_json::from_reader(reader)?;

    let points: Vec<RawCableLanding> = if let Some(lp) = raw.get("landing_points") {
        serde_json::from_value(lp.clone())?
    } else if raw.is_array() {
        serde_json::from_value(raw)?
    } else {
        return Err(SelectorError::NoCandidates);
    };

    let mut candidates = Vec::new();
    let mut skipped = 0;

    for (i, point) in points.into_iter().enumerate() {
        let lat = match point.latitude {
            Some(l) => l,
            None => {
                skipped += 1;
                continue;
            }
        };
        let lon = match point.longitude {
            Some(l) => l,
            None => {
                skipped += 1;
                continue;
            }
        };

        let id = point.id.unwrap_or_else(|| format!("cl-{}", i));
        let name = point.name.unwrap_or_else(|| "Unknown".to_string());
        let cable_count = point.cable_count.unwrap_or(0);
        let cables = point.cables.unwrap_or_default();

        candidates.push(Candidate::from_cable_landing(
            id, name, lat, lon, cable_count, cables,
        ));
    }

    info!(
        "Loaded {} cable landings ({} skipped for missing coords)",
        candidates.len(),
        skipped
    );

    Ok(candidates)
}

/// Load and merge all candidate sources
pub fn load_all_candidates(
    ground_nodes_path: impl AsRef<Path>,
    cable_landings_path: impl AsRef<Path>,
) -> Result<Vec<Candidate>> {
    let ground_nodes = load_ground_nodes(ground_nodes_path)?;
    let cable_landings = load_cable_landings(cable_landings_path)?;

    let mut all = ground_nodes;
    all.extend(cable_landings);

    info!("Total raw candidates: {}", all.len());

    Ok(all)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_load_ground_nodes() {
        let json = r#"[
            {"id": "gn-1", "name": "Test Node", "latitude": 40.0, "longitude": -74.0, "tier": 1, "weather_score": 0.9},
            {"id": "gn-2", "name": "No Coords"}
        ]"#;

        let mut file = NamedTempFile::new().unwrap();
        file.write_all(json.as_bytes()).unwrap();

        let candidates = load_ground_nodes(file.path()).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].id, "gn-1");
    }

    #[test]
    fn test_load_cable_landings() {
        let json = r#"{
            "landing_points": [
                {"id": "cl-1", "name": "Miami", "latitude": 25.7617, "longitude": -80.1918, "cable_count": 5}
            ]
        }"#;

        let mut file = NamedTempFile::new().unwrap();
        file.write_all(json.as_bytes()).unwrap();

        let candidates = load_cable_landings(file.path()).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].cable_count, Some(5));
    }
}
