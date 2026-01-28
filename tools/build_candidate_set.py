#!/usr/bin/env python3
"""
Build Unified Ground Station Candidate Set
===========================================

Merges ground nodes and cable landing points, deduplicates by proximity,
and assigns geographic zones for the 247 station down-selection.

Data Sources:
- data/all_ground_nodes_backup.json (578 nodes)
- data/cable-infrastructure/cable_landing_complete.json (1,900 landings)

Output:
- data/candidate_set.json (~800-1000 unique locations)
"""

import json
import math
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Optional
from datetime import datetime, timezone

# Paths
DATA_DIR = Path(__file__).parent.parent / "data"
GROUND_NODES_FILE = DATA_DIR / "all_ground_nodes_backup.json"
CABLE_LANDING_FILE = DATA_DIR / "cable-infrastructure" / "cable_landing_complete.json"
OUTPUT_FILE = DATA_DIR / "candidate_set.json"

# Deduplication threshold (km)
PROXIMITY_THRESHOLD_KM = 50.0

# Zone definitions (longitude ranges)
ZONES = {
    "AMERICAS": {"lon_min": -180, "lon_max": -30, "quota": 72},
    "EMEA": {"lon_min": -30, "lon_max": 60, "quota": 85},
    "APAC": {"lon_min": 60, "lon_max": 180, "quota": 90},
}


@dataclass
class Candidate:
    """A candidate ground station location."""
    id: str
    name: str
    latitude: float
    longitude: float
    zone: str
    source: str  # "ground_node" or "cable_landing"

    # From ground nodes
    tier: Optional[int] = None
    demand_gbps: Optional[float] = None
    weather_score: Optional[float] = None

    # From cable landings
    cable_count: Optional[int] = None
    cables: Optional[list] = None

    # Merged from both (if deduped)
    merged_sources: Optional[list] = None


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two points in km."""
    R = 6371.0  # Earth radius in km

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = math.sin(dlat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    return R * c


def assign_zone(lon: float) -> str:
    """Assign geographic zone based on longitude."""
    for zone_name, zone_def in ZONES.items():
        if zone_def["lon_min"] <= lon < zone_def["lon_max"]:
            return zone_name
    # Handle edge case at 180/-180
    return "APAC"


def load_ground_nodes() -> list[Candidate]:
    """Load ground nodes from JSON."""
    print(f"Loading ground nodes from {GROUND_NODES_FILE}")

    with open(GROUND_NODES_FILE) as f:
        nodes = json.load(f)

    candidates = []
    for node in nodes:
        lat = node.get("latitude")
        lon = node.get("longitude")

        if lat is None or lon is None:
            continue

        candidates.append(Candidate(
            id=node.get("id", f"gn-{len(candidates)}"),
            name=node.get("name", "Unknown"),
            latitude=lat,
            longitude=lon,
            zone=assign_zone(lon),
            source="ground_node",
            tier=node.get("tier"),
            demand_gbps=node.get("demand_gbps"),
            weather_score=node.get("weather_score"),
        ))

    print(f"  Loaded {len(candidates)} ground nodes")
    return candidates


def load_cable_landings() -> list[Candidate]:
    """Load cable landing points from JSON."""
    print(f"Loading cable landings from {CABLE_LANDING_FILE}")

    with open(CABLE_LANDING_FILE) as f:
        data = json.load(f)

    points = data.get("landing_points", data)

    candidates = []
    for point in points:
        lat = point.get("latitude")
        lon = point.get("longitude")

        if lat is None or lon is None:
            continue

        candidates.append(Candidate(
            id=point.get("id", f"cl-{len(candidates)}"),
            name=point.get("name", "Unknown"),
            latitude=lat,
            longitude=lon,
            zone=assign_zone(lon),
            source="cable_landing",
            cable_count=point.get("cable_count", 0),
            cables=point.get("cables", []),
        ))

    print(f"  Loaded {len(candidates)} cable landings")
    return candidates


def deduplicate_candidates(candidates: list[Candidate], threshold_km: float) -> list[Candidate]:
    """
    Deduplicate candidates by proximity.
    When two candidates are within threshold_km, merge them.
    Prefer ground_node source over cable_landing.
    """
    print(f"Deduplicating with {threshold_km}km threshold...")

    # Sort by importance: ground nodes first, then by cable count
    def importance(c: Candidate) -> tuple:
        source_priority = 0 if c.source == "ground_node" else 1
        cable_priority = -(c.cable_count or 0)
        return (source_priority, cable_priority)

    sorted_candidates = sorted(candidates, key=importance)

    unique = []
    merged_count = 0

    for candidate in sorted_candidates:
        # Check if near any existing unique candidate
        found_match = False
        for existing in unique:
            dist = haversine_km(
                candidate.latitude, candidate.longitude,
                existing.latitude, existing.longitude
            )

            if dist < threshold_km:
                # Merge into existing
                found_match = True
                merged_count += 1

                # Track merged sources
                if existing.merged_sources is None:
                    existing.merged_sources = [existing.source]
                existing.merged_sources.append(candidate.source)

                # Merge cable info if existing doesn't have it
                if existing.cable_count is None and candidate.cable_count:
                    existing.cable_count = candidate.cable_count
                    existing.cables = candidate.cables
                elif existing.cable_count and candidate.cable_count:
                    # Combine cable counts
                    existing.cable_count = max(existing.cable_count, candidate.cable_count)

                # Merge weather score if existing doesn't have it
                if existing.weather_score is None and candidate.weather_score:
                    existing.weather_score = candidate.weather_score

                break

        if not found_match:
            unique.append(candidate)

    print(f"  Merged {merged_count} duplicates")
    print(f"  Unique candidates: {len(unique)}")

    return unique


def summarize_by_zone(candidates: list[Candidate]) -> dict:
    """Summarize candidate counts by zone."""
    zone_counts = {"AMERICAS": 0, "EMEA": 0, "APAC": 0}

    for c in candidates:
        if c.zone in zone_counts:
            zone_counts[c.zone] += 1

    return zone_counts


def main():
    print("=" * 60)
    print("Building Ground Station Candidate Set")
    print("=" * 60)

    # Load both sources
    ground_nodes = load_ground_nodes()
    cable_landings = load_cable_landings()

    # Combine
    all_candidates = ground_nodes + cable_landings
    print(f"\nTotal raw candidates: {len(all_candidates)}")

    # Deduplicate
    unique_candidates = deduplicate_candidates(all_candidates, PROXIMITY_THRESHOLD_KM)

    # Zone summary
    zone_counts = summarize_by_zone(unique_candidates)
    print(f"\nZone distribution:")
    for zone, count in zone_counts.items():
        quota = ZONES[zone]["quota"]
        print(f"  {zone}: {count} candidates (quota: {quota})")

    # Write output
    output = {
        "candidates": [asdict(c) for c in unique_candidates],
        "metadata": {
            "generated": datetime.now(timezone.utc).isoformat(),
            "total_candidates": len(unique_candidates),
            "zone_distribution": zone_counts,
            "sources": {
                "ground_nodes": len(ground_nodes),
                "cable_landings": len(cable_landings),
            },
            "dedup_threshold_km": PROXIMITY_THRESHOLD_KM,
        }
    }

    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nWrote {OUTPUT_FILE}")
    print(f"  {len(unique_candidates)} unique candidate locations")

    # Show top candidates by cable count
    print("\nTop 10 candidates by cable count:")
    by_cables = sorted(unique_candidates, key=lambda c: c.cable_count or 0, reverse=True)[:10]
    for c in by_cables:
        print(f"  {c.cable_count or 0:3d} cables | {c.name[:40]:<40} | {c.zone}")

    return 0


if __name__ == "__main__":
    exit(main())
