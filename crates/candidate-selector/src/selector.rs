//! Candidate selection with zone quotas and spacing constraints

use crate::{
    haversine_km, Candidate, CandidateSource, Result, ScoredCandidate, SelectionMetadata,
    SelectionResult, SelectorError, Zone, DEDUP_THRESHOLD_KM, ZONE_QUOTAS,
};
use std::collections::HashMap;
use tracing::{debug, info};

/// Deduplicate candidates by proximity
///
/// When two candidates are within threshold_km, merge them.
/// Prefer ground_node source over cable_landing.
pub fn deduplicate(mut candidates: Vec<Candidate>, threshold_km: f64) -> Vec<Candidate> {
    info!(
        "Deduplicating {} candidates with {:.1}km threshold",
        candidates.len(),
        threshold_km
    );

    // Sort by importance: ground nodes first, then by cable count
    candidates.sort_by(|a, b| {
        let source_cmp = match (&a.source, &b.source) {
            (CandidateSource::GroundNode, CandidateSource::CableLanding) => std::cmp::Ordering::Less,
            (CandidateSource::CableLanding, CandidateSource::GroundNode) => std::cmp::Ordering::Greater,
            _ => std::cmp::Ordering::Equal,
        };
        if source_cmp != std::cmp::Ordering::Equal {
            return source_cmp;
        }
        // Higher cable count is better
        b.cable_count.unwrap_or(0).cmp(&a.cable_count.unwrap_or(0))
    });

    let mut unique: Vec<Candidate> = Vec::new();
    let mut merged_count = 0;

    for candidate in candidates {
        let mut found_match = false;

        for existing in unique.iter_mut() {
            let dist = haversine_km(
                candidate.latitude,
                candidate.longitude,
                existing.latitude,
                existing.longitude,
            );

            if dist < threshold_km {
                // Merge into existing
                existing.merge(&candidate);
                merged_count += 1;
                found_match = true;
                break;
            }
        }

        if !found_match {
            unique.push(candidate);
        }
    }

    info!(
        "Deduplicated: {} merged, {} unique candidates",
        merged_count,
        unique.len()
    );

    unique
}

/// Select top candidates by zone with spacing constraint
pub fn select_by_zone(
    mut scored: Vec<ScoredCandidate>,
    min_spacing_km: f64,
) -> Result<SelectionResult> {
    // Sort by score descending
    scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    // Group by zone
    let mut by_zone: HashMap<Zone, Vec<ScoredCandidate>> = HashMap::new();
    for s in scored {
        by_zone.entry(s.candidate.zone).or_default().push(s);
    }

    let mut selected: Vec<ScoredCandidate> = Vec::new();
    let mut zone_counts: HashMap<String, usize> = HashMap::new();

    // Select from each zone
    for (zone, quota) in ZONE_QUOTAS.iter() {
        let zone_candidates = by_zone.get(zone).map(|v| v.as_slice()).unwrap_or(&[]);

        info!(
            "Selecting {} from {:?} ({} candidates available)",
            quota,
            zone,
            zone_candidates.len()
        );

        if zone_candidates.len() < *quota {
            return Err(SelectorError::InsufficientCandidates(
                *zone,
                *quota,
                zone_candidates.len(),
            ));
        }

        let zone_selected = select_with_spacing(zone_candidates, *quota, min_spacing_km);
        zone_counts.insert(format!("{:?}", zone), zone_selected.len());
        selected.extend(zone_selected);
    }

    let total_candidates: usize = by_zone.values().map(|v| v.len()).sum();

    let metadata = SelectionMetadata {
        total_selected: selected.len(),
        zone_distribution: zone_counts,
        total_candidates,
        dedup_threshold_km: DEDUP_THRESHOLD_KM,
        min_spacing_km,
        generated_at: chrono::Utc::now().to_rfc3339(),
    };

    info!("Selected {} stations total", selected.len());

    Ok(SelectionResult { selected, metadata })
}

/// Select top N candidates with minimum spacing
fn select_with_spacing(
    candidates: &[ScoredCandidate],
    quota: usize,
    min_spacing_km: f64,
) -> Vec<ScoredCandidate> {
    let mut selected: Vec<ScoredCandidate> = Vec::new();

    for candidate in candidates {
        if selected.len() >= quota {
            break;
        }

        // Check spacing from all already-selected candidates
        let too_close = selected.iter().any(|s| {
            haversine_km(
                candidate.candidate.latitude,
                candidate.candidate.longitude,
                s.candidate.latitude,
                s.candidate.longitude,
            ) < min_spacing_km
        });

        if !too_close {
            selected.push(candidate.clone());
            debug!(
                "Selected {} (score={:.3})",
                candidate.candidate.name, candidate.score
            );
        }
    }

    if selected.len() < quota {
        // If we can't meet quota with spacing, relax constraint and fill remaining
        info!(
            "Could only select {} with spacing, filling {} more",
            selected.len(),
            quota - selected.len()
        );

        for candidate in candidates {
            if selected.len() >= quota {
                break;
            }
            if !selected.iter().any(|s| s.candidate.id == candidate.candidate.id) {
                selected.push(candidate.clone());
            }
        }
    }

    selected
}

/// Export selection result to GeoJSON
pub fn to_geojson(result: &SelectionResult) -> serde_json::Value {
    let features: Vec<serde_json::Value> = result
        .selected
        .iter()
        .map(|s| {
            serde_json::json!({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [s.candidate.longitude, s.candidate.latitude]
                },
                "properties": {
                    "id": s.candidate.id,
                    "name": s.candidate.name,
                    "zone": format!("{:?}", s.candidate.zone),
                    "score": s.score,
                    "pop_score": s.pop_score,
                    "pop_proximity_score": s.pop_proximity_score,
                    "xai_score": s.xai_score,
                    "weather_score": s.weather_score,
                    "network_score": s.network_score,
                    "security_score": s.security_score,
                    "tier": s.candidate.tier,
                    "cable_count": s.candidate.cable_count,
                    "country_code": s.candidate.country_code,
                    "source": format!("{:?}", s.candidate.source)
                }
            })
        })
        .collect();

    serde_json::json!({
        "type": "FeatureCollection",
        "features": features,
        "metadata": result.metadata
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::CandidateSource;

    fn make_candidate(id: &str, lat: f64, lon: f64, source: CandidateSource) -> Candidate {
        Candidate {
            id: id.to_string(),
            name: id.to_string(),
            latitude: lat,
            longitude: lon,
            zone: Zone::from_longitude(lon),
            source,
            tier: Some(1),
            demand_gbps: Some(50.0),
            weather_score: Some(0.9),
            cable_count: Some(5),
            cables: None,
            merged_from: None,
            country_code: None,
            travel_advisory_level: None,
            political_stability: None,
            rule_of_law: None,
            corruption_control: None,
            security_score: None,
            nearest_ixp_km: None,
            nearest_equinix_km: None,
            nearest_financial_km: None,
            infrastructure_tier: None,
        }
    }

    fn make_scored(candidate: Candidate, score: f64) -> ScoredCandidate {
        ScoredCandidate {
            candidate,
            score,
            pop_score: 0.8,
            pop_proximity_score: 0.7,
            xai_score: 0.5,
            weather_score: 0.9,
            network_score: 0.6,
            security_score: 0.8,
            infrastructure_score: 0.7,
        }
    }

    #[test]
    fn test_deduplicate_merges_nearby() {
        let candidates = vec![
            make_candidate("gn-1", 40.0, -74.0, CandidateSource::GroundNode),
            make_candidate("cl-1", 40.01, -74.01, CandidateSource::CableLanding), // ~1.5km away
        ];

        let deduped = deduplicate(candidates, 50.0);
        assert_eq!(deduped.len(), 1);
        assert_eq!(deduped[0].id, "gn-1"); // Ground node preferred
        assert!(deduped[0].merged_from.is_some());
    }

    #[test]
    fn test_deduplicate_keeps_distant() {
        let candidates = vec![
            make_candidate("gn-1", 40.0, -74.0, CandidateSource::GroundNode),
            make_candidate("gn-2", 41.0, -75.0, CandidateSource::GroundNode), // ~140km away
        ];

        let deduped = deduplicate(candidates, 50.0);
        assert_eq!(deduped.len(), 2);
    }

    #[test]
    fn test_spacing_constraint() {
        // Two candidates very close together
        let scored = vec![
            make_scored(make_candidate("a", 40.0, -74.0, CandidateSource::GroundNode), 0.9),
            make_scored(make_candidate("b", 40.001, -74.001, CandidateSource::GroundNode), 0.85),
            make_scored(make_candidate("c", 41.0, -75.0, CandidateSource::GroundNode), 0.8),
        ];

        let selected = select_with_spacing(&scored, 2, 50.0);
        assert_eq!(selected.len(), 2);
        // Should select a (highest) and c (not too close), skip b
        assert!(selected.iter().any(|s| s.candidate.id == "a"));
        assert!(selected.iter().any(|s| s.candidate.id == "c"));
    }
}
