#!/usr/bin/env python3
"""
Fetch IXP and Facility Locations from PeeringDB

Focused extraction of lat/lon coordinates for orbital ground station planning.
Outputs a lean GeoJSON suitable for FSO link budget calculations.

Usage:
    python fetch_ixp_locations.py
    python fetch_ixp_locations.py --output data/ixp_locations.json
    python fetch_ixp_locations.py --geocode-cables  # Also fix cable landing points
"""

import json
import requests
import argparse
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, asdict
from datetime import datetime, timezone

# PeeringDB API endpoints
PEERINGDB_BASE = "https://www.peeringdb.com/api"
IXP_ENDPOINT = f"{PEERINGDB_BASE}/ix"
FAC_ENDPOINT = f"{PEERINGDB_BASE}/fac"

# Output paths
DEFAULT_OUTPUT = Path(__file__).parent.parent / "data" / "ixp_locations.json"
CABLE_LANDING_FILE = Path(__file__).parent.parent / "data" / "cable-infrastructure" / "cable_landing_points.json"


@dataclass
class IXPLocation:
    """Minimal IXP location for orbital planning"""
    id: int
    name: str
    city: str
    country: str
    latitude: Optional[float]
    longitude: Optional[float]
    net_count: int  # Connected networks (importance metric)
    source: str = "peeringdb-ix"


@dataclass
class FacilityLocation:
    """Minimal facility location for orbital planning"""
    id: int
    name: str
    city: str
    country: str
    latitude: Optional[float]
    longitude: Optional[float]
    net_count: int  # Networks at facility
    ix_count: int   # IXPs at facility
    source: str = "peeringdb-fac"


def fetch_ixp_locations() -> list[IXPLocation]:
    """Fetch IXP locations from PeeringDB"""
    print("Fetching IXP data from PeeringDB...")

    try:
        resp = requests.get(IXP_ENDPOINT, timeout=60)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  ERROR fetching IXPs: {e}")
        return []

    ixps = []
    for ix in data.get("data", []):
        # Skip if no location data
        city = ix.get("city", "")
        country = ix.get("country", "")
        if not city or not country:
            continue

        ixps.append(IXPLocation(
            id=ix.get("id", 0),
            name=ix.get("name", ""),
            city=city,
            country=country,
            latitude=None,  # IXPs don't have direct lat/lon
            longitude=None,
            net_count=ix.get("net_count", 0),
        ))

    print(f"  Found {len(ixps)} IXPs with location data")
    return ixps


def fetch_facility_locations(min_networks: int = 5) -> list[FacilityLocation]:
    """
    Fetch facility locations from PeeringDB.
    Only returns facilities with coordinates and minimum network count.
    """
    print(f"Fetching facility data (min {min_networks} networks)...")

    try:
        resp = requests.get(FAC_ENDPOINT, timeout=120)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  ERROR fetching facilities: {e}")
        return []

    facilities = []
    skipped_no_coords = 0
    skipped_low_networks = 0

    for fac in data.get("data", []):
        lat = fac.get("latitude")
        lon = fac.get("longitude")
        net_count = fac.get("net_count", 0)

        # Skip facilities without coordinates
        if lat is None or lon is None:
            skipped_no_coords += 1
            continue

        # Skip low-importance facilities
        if net_count < min_networks:
            skipped_low_networks += 1
            continue

        facilities.append(FacilityLocation(
            id=fac.get("id", 0),
            name=fac.get("name", ""),
            city=fac.get("city", ""),
            country=fac.get("country", ""),
            latitude=float(lat),
            longitude=float(lon),
            net_count=net_count,
            ix_count=fac.get("ix_count", 0),
        ))

    print(f"  Found {len(facilities)} facilities with coordinates")
    print(f"  Skipped: {skipped_no_coords} no coords, {skipped_low_networks} low networks")
    return facilities


def build_city_lookup(facilities: list[FacilityLocation]) -> dict[str, tuple[float, float]]:
    """
    Build city -> (lat, lon) lookup from facilities.
    Uses the facility with most networks as the canonical location.
    """
    city_best: dict[str, FacilityLocation] = {}

    for fac in facilities:
        key = f"{fac.city.lower()}, {fac.country.lower()}"
        if key not in city_best or fac.net_count > city_best[key].net_count:
            city_best[key] = fac

    return {k: (v.latitude, v.longitude) for k, v in city_best.items()}


def geocode_cable_landing_points(city_lookup: dict[str, tuple[float, float]]) -> int:
    """
    Update cable landing points with coordinates from facility data.
    Returns count of points updated.
    """
    if not CABLE_LANDING_FILE.exists():
        print(f"  Cable file not found: {CABLE_LANDING_FILE}")
        return 0

    print(f"Geocoding cable landing points...")

    with open(CABLE_LANDING_FILE) as f:
        cable_data = json.load(f)

    updated = 0
    landing_points = cable_data.get("landing_points", [])

    for point in landing_points:
        if point.get("coords_valid"):
            continue

        # Try to match by city name
        name = point.get("name", "").lower()
        country = point.get("country", "").lower()

        # Try exact match first
        key = f"{name.split(',')[0].strip()}, {country}"
        if key in city_lookup:
            lat, lon = city_lookup[key]
            point["latitude"] = lat
            point["longitude"] = lon
            point["coords_valid"] = True
            point["coord_source"] = "peeringdb-facility"
            updated += 1
            continue

        # Try city name variations
        city_part = name.split(",")[0].strip()
        for lookup_key, coords in city_lookup.items():
            if city_part in lookup_key:
                point["latitude"] = coords[0]
                point["longitude"] = coords[1]
                point["coords_valid"] = True
                point["coord_source"] = "peeringdb-facility-fuzzy"
                updated += 1
                break

    if updated > 0:
        with open(CABLE_LANDING_FILE, "w") as f:
            json.dump(cable_data, f, indent=2)
        print(f"  Updated {updated} cable landing points")
    else:
        print(f"  No cable landing points updated")

    return updated


def to_geojson(facilities: list[FacilityLocation], ixps: list[IXPLocation]) -> dict:
    """Convert to GeoJSON FeatureCollection"""
    features = []

    # Add facilities as points
    for fac in facilities:
        if fac.latitude is None or fac.longitude is None:
            continue
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [fac.longitude, fac.latitude]
            },
            "properties": {
                "id": f"fac-{fac.id}",
                "name": fac.name,
                "city": fac.city,
                "country": fac.country,
                "net_count": fac.net_count,
                "ix_count": fac.ix_count,
                "type": "facility",
                "source": fac.source
            }
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "generated": datetime.now(timezone.utc).isoformat(),
            "facility_count": len(facilities),
            "ixp_count": len(ixps),
            "source": "peeringdb.com"
        }
    }


def to_orbital_format(facilities: list[FacilityLocation]) -> list[dict]:
    """
    Convert to sx9-orbital ground node format.
    Compatible with all_ground_nodes_backup.json schema.
    """
    nodes = []
    for fac in facilities:
        if fac.latitude is None or fac.longitude is None:
            continue

        # Calculate tier based on network count
        if fac.net_count >= 100:
            tier = 1
        elif fac.net_count >= 30:
            tier = 2
        else:
            tier = 3

        nodes.append({
            "id": f"pdb-fac-{fac.id}",
            "name": fac.name,
            "latitude": fac.latitude,
            "longitude": fac.longitude,
            "tier": tier,
            "demand_gbps": min(fac.net_count * 0.5, 100),  # Estimate
            "weather_score": 0.85,  # Default, needs weather API
            "status": "reference",  # Not operational, just reference data
            "facility_id": fac.id,
            "source": "peeringdb",
            "net_count": fac.net_count,
            "ix_count": fac.ix_count,
            "city": fac.city,
            "country": fac.country
        })

    return nodes


def main():
    parser = argparse.ArgumentParser(description="Fetch IXP/Facility locations from PeeringDB")
    parser.add_argument("--output", "-o", type=Path, default=DEFAULT_OUTPUT,
                        help="Output file path")
    parser.add_argument("--format", "-f", choices=["geojson", "orbital", "both"], default="both",
                        help="Output format")
    parser.add_argument("--min-networks", "-n", type=int, default=5,
                        help="Minimum networks for facility inclusion")
    parser.add_argument("--geocode-cables", action="store_true",
                        help="Also update cable landing points with coordinates")
    args = parser.parse_args()

    print("=" * 60)
    print("PeeringDB Location Fetcher for SX9-Orbital")
    print("=" * 60)

    # Fetch data
    ixps = fetch_ixp_locations()
    facilities = fetch_facility_locations(min_networks=args.min_networks)

    if not facilities:
        print("ERROR: No facility data retrieved")
        return 1

    # Geocode cables if requested
    if args.geocode_cables:
        city_lookup = build_city_lookup(facilities)
        geocode_cable_landing_points(city_lookup)

    # Ensure output directory exists
    args.output.parent.mkdir(parents=True, exist_ok=True)

    # Write output
    if args.format in ("geojson", "both"):
        geojson_file = args.output.with_suffix(".geojson")
        geojson = to_geojson(facilities, ixps)
        with open(geojson_file, "w") as f:
            json.dump(geojson, f, indent=2)
        print(f"\nWrote GeoJSON: {geojson_file}")
        print(f"  {len(geojson['features'])} features")

    if args.format in ("orbital", "both"):
        orbital_file = args.output.with_suffix(".json")
        nodes = to_orbital_format(facilities)
        output = {
            "ground_nodes": nodes,
            "metadata": {
                "generated": datetime.now(timezone.utc).isoformat(),
                "source": "peeringdb.com",
                "count": len(nodes)
            }
        }
        with open(orbital_file, "w") as f:
            json.dump(output, f, indent=2)
        print(f"\nWrote orbital format: {orbital_file}")
        print(f"  {len(nodes)} ground nodes")

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  IXPs:       {len(ixps)}")
    print(f"  Facilities: {len(facilities)} (with coords, ≥{args.min_networks} networks)")

    # Top facilities by network count
    top = sorted(facilities, key=lambda x: x.net_count, reverse=True)[:10]
    print(f"\n  Top 10 facilities by network count:")
    for fac in top:
        print(f"    {fac.net_count:4d} nets | {fac.name[:40]:<40} | {fac.city}, {fac.country}")

    return 0


if __name__ == "__main__":
    exit(main())
