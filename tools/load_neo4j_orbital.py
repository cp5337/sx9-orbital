#!/usr/bin/env python3
"""
Neo4j Orbital Constellation Loader
===================================

Loads the SX9-Orbital ground station and satellite graph to Neo4j.

Graph Structure:
  (:GroundStation {id, name, lat, lon, zone, tier, score, security_score, ...})
  (:Satellite {id, name, plane, slot, altitude_km, norad_id})
  (:CableLanding {id, name, cables[], cable_count})

  (:GroundStation)-[:FSO_LINK {margin_db, weather_score}]->(:Satellite)
  (:Satellite)-[:ISL {margin_db, latency_ms}]->(:Satellite)
  (:GroundStation)-[:NEAR_CABLE {distance_km}]->(:CableLanding)

Neo4j Connection:
  - Browser: http://localhost:7474
  - Bolt: bolt://localhost:7687
  - Auth: Set NEO4J_PASSWORD environment variable

Usage:
  python load_neo4j_orbital.py                    # Load all data
  python load_neo4j_orbital.py --stations-only    # Load only ground stations
  python load_neo4j_orbital.py --clear            # Clear existing orbital data first
"""

import json
import math
import argparse
import os
from pathlib import Path
from datetime import datetime

try:
    from neo4j import GraphDatabase
    HAS_NEO4J = True
except ImportError:
    HAS_NEO4J = False
    print("WARNING: neo4j driver not installed. Run: pip install neo4j")


# HALO constellation: 12 MEO satellites at 10,500km
# 3 planes, 4 satellites per plane, 90° spacing
HALO_CONSTELLATION = [
    # Plane 1 (0° RAAN)
    {"id": "HALO-1-1", "name": "HALO-1-1", "plane": 1, "slot": 1, "altitude_km": 10500, "raan": 0, "phase": 0},
    {"id": "HALO-1-2", "name": "HALO-1-2", "plane": 1, "slot": 2, "altitude_km": 10500, "raan": 0, "phase": 90},
    {"id": "HALO-1-3", "name": "HALO-1-3", "plane": 1, "slot": 3, "altitude_km": 10500, "raan": 0, "phase": 180},
    {"id": "HALO-1-4", "name": "HALO-1-4", "plane": 1, "slot": 4, "altitude_km": 10500, "raan": 0, "phase": 270},
    # Plane 2 (60° RAAN)
    {"id": "HALO-2-1", "name": "HALO-2-1", "plane": 2, "slot": 1, "altitude_km": 10500, "raan": 60, "phase": 0},
    {"id": "HALO-2-2", "name": "HALO-2-2", "plane": 2, "slot": 2, "altitude_km": 10500, "raan": 60, "phase": 90},
    {"id": "HALO-2-3", "name": "HALO-2-3", "plane": 2, "slot": 3, "altitude_km": 10500, "raan": 60, "phase": 180},
    {"id": "HALO-2-4", "name": "HALO-2-4", "plane": 2, "slot": 4, "altitude_km": 10500, "raan": 60, "phase": 270},
    # Plane 3 (120° RAAN)
    {"id": "HALO-3-1", "name": "HALO-3-1", "plane": 3, "slot": 1, "altitude_km": 10500, "raan": 120, "phase": 0},
    {"id": "HALO-3-2", "name": "HALO-3-2", "plane": 3, "slot": 2, "altitude_km": 10500, "raan": 120, "phase": 90},
    {"id": "HALO-3-3", "name": "HALO-3-3", "plane": 3, "slot": 3, "altitude_km": 10500, "raan": 120, "phase": 180},
    {"id": "HALO-3-4", "name": "HALO-3-4", "plane": 3, "slot": 4, "altitude_km": 10500, "raan": 120, "phase": 270},
]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two points in km."""
    R = 6371.0  # Earth radius in km
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = math.sin(dlat / 2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


class OrbitalNeo4jLoader:
    """Load orbital constellation graph to Neo4j."""

    def __init__(self, uri: str = "bolt://localhost:7687", user: str = "neo4j", password: str = None):
        if not HAS_NEO4J:
            raise RuntimeError("neo4j driver not installed. Run: pip install neo4j")
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def clear_orbital_data(self):
        """Clear all existing orbital constellation nodes and relationships."""
        with self.driver.session() as session:
            # Delete relationships first
            result = session.run("""
                MATCH ()-[r:FSO_LINK|ISL|NEAR_CABLE]-()
                DELETE r
                RETURN count(r) as deleted_rels
            """)
            rels = result.single()["deleted_rels"]

            # Delete nodes
            result = session.run("""
                MATCH (n)
                WHERE n:GroundStation OR n:Satellite OR n:CableLanding
                DETACH DELETE n
                RETURN count(n) as deleted_nodes
            """)
            nodes = result.single()["deleted_nodes"]

            print(f"Cleared {nodes} nodes and {rels} relationships")

    def create_indexes(self):
        """Create indexes for optimal query performance."""
        with self.driver.session() as session:
            # Ground station indexes
            session.run("CREATE INDEX IF NOT EXISTS FOR (g:GroundStation) ON (g.id)")
            session.run("CREATE INDEX IF NOT EXISTS FOR (g:GroundStation) ON (g.zone)")
            session.run("CREATE INDEX IF NOT EXISTS FOR (g:GroundStation) ON (g.country_code)")
            session.run("CREATE INDEX IF NOT EXISTS FOR (g:GroundStation) ON (g.security_score)")

            # Satellite indexes
            session.run("CREATE INDEX IF NOT EXISTS FOR (s:Satellite) ON (s.id)")
            session.run("CREATE INDEX IF NOT EXISTS FOR (s:Satellite) ON (s.plane)")

            print("Created indexes")

    def load_ground_stations(self, stations_file: Path) -> int:
        """Load selected ground stations from JSON."""
        with open(stations_file) as f:
            data = json.load(f)

        selected = data.get("selected", [])
        count = 0

        with self.driver.session() as session:
            for entry in selected:
                candidate = entry.get("candidate", {})

                # Create GroundStation node
                session.run("""
                    CREATE (g:GroundStation {
                        id: $id,
                        name: $name,
                        latitude: $latitude,
                        longitude: $longitude,
                        zone: $zone,
                        source: $source,
                        tier: $tier,
                        demand_gbps: $demand_gbps,
                        weather_score: $weather_score,
                        country_code: $country_code,
                        travel_advisory_level: $travel_advisory_level,
                        political_stability: $political_stability,
                        rule_of_law: $rule_of_law,
                        corruption_control: $corruption_control,
                        security_score: $security_score,
                        composite_score: $composite_score,
                        pop_score: $pop_score,
                        pop_proximity_score: $pop_proximity_score,
                        xai_score: $xai_score,
                        network_score: $network_score,
                        loaded_at: datetime()
                    })
                """,
                    id=candidate.get("id", ""),
                    name=candidate.get("name", ""),
                    latitude=candidate.get("latitude", 0),
                    longitude=candidate.get("longitude", 0),
                    zone=candidate.get("zone", ""),
                    source=candidate.get("source", ""),
                    tier=candidate.get("tier"),
                    demand_gbps=candidate.get("demand_gbps"),
                    weather_score=candidate.get("weather_score"),
                    country_code=candidate.get("country_code"),
                    travel_advisory_level=candidate.get("travel_advisory_level"),
                    political_stability=candidate.get("political_stability"),
                    rule_of_law=candidate.get("rule_of_law"),
                    corruption_control=candidate.get("corruption_control"),
                    security_score=entry.get("security_score", candidate.get("security_score")),
                    composite_score=entry.get("score", 0),
                    pop_score=entry.get("pop_score", 0),
                    pop_proximity_score=entry.get("pop_proximity_score", 0),
                    xai_score=entry.get("xai_score", 0),
                    network_score=entry.get("network_score", 0),
                )
                count += 1

                if count % 50 == 0:
                    print(f"  Loaded {count} ground stations...")

        print(f"Loaded {count} ground stations to Neo4j")
        return count

    def load_satellites(self) -> int:
        """Load HALO constellation satellites."""
        count = 0

        with self.driver.session() as session:
            for sat in HALO_CONSTELLATION:
                session.run("""
                    CREATE (s:Satellite {
                        id: $id,
                        name: $name,
                        plane: $plane,
                        slot: $slot,
                        altitude_km: $altitude_km,
                        raan: $raan,
                        phase: $phase,
                        constellation: 'HALO',
                        orbit_type: 'MEO',
                        loaded_at: datetime()
                    })
                """,
                    id=sat["id"],
                    name=sat["name"],
                    plane=sat["plane"],
                    slot=sat["slot"],
                    altitude_km=sat["altitude_km"],
                    raan=sat["raan"],
                    phase=sat["phase"],
                )
                count += 1

        print(f"Loaded {count} satellites to Neo4j")
        return count

    def create_isl_links(self) -> int:
        """Create inter-satellite links (ISL) between adjacent satellites."""
        count = 0

        with self.driver.session() as session:
            # Intra-plane ISLs (connect adjacent slots within same plane)
            result = session.run("""
                MATCH (s1:Satellite), (s2:Satellite)
                WHERE s1.plane = s2.plane
                  AND s2.slot = s1.slot + 1
                CREATE (s1)-[r:ISL {
                    type: 'intra_plane',
                    latency_ms: 35.0,
                    capacity_gbps: 100.0
                }]->(s2)
                RETURN count(r) as created
            """)
            count += result.single()["created"]

            # Wrap-around ISL (slot 4 to slot 1 in same plane)
            result = session.run("""
                MATCH (s1:Satellite {slot: 4}), (s2:Satellite {slot: 1})
                WHERE s1.plane = s2.plane
                CREATE (s1)-[r:ISL {
                    type: 'intra_plane',
                    latency_ms: 35.0,
                    capacity_gbps: 100.0
                }]->(s2)
                RETURN count(r) as created
            """)
            count += result.single()["created"]

            # Inter-plane ISLs (connect satellites between adjacent planes)
            result = session.run("""
                MATCH (s1:Satellite), (s2:Satellite)
                WHERE s1.plane + 1 = s2.plane
                  AND s1.slot = s2.slot
                CREATE (s1)-[r:ISL {
                    type: 'inter_plane',
                    latency_ms: 45.0,
                    capacity_gbps: 80.0
                }]->(s2)
                RETURN count(r) as created
            """)
            count += result.single()["created"]

            # Wrap-around inter-plane (plane 3 to plane 1)
            result = session.run("""
                MATCH (s1:Satellite {plane: 3}), (s2:Satellite {plane: 1})
                WHERE s1.slot = s2.slot
                CREATE (s1)-[r:ISL {
                    type: 'inter_plane',
                    latency_ms: 45.0,
                    capacity_gbps: 80.0
                }]->(s2)
                RETURN count(r) as created
            """)
            count += result.single()["created"]

        print(f"Created {count} ISL links")
        return count

    def create_fso_links(self) -> int:
        """Create FSO links between ground stations and satellites.

        Each ground station can connect to any satellite within line-of-sight.
        For MEO at 10,500km, most ground stations see multiple satellites.
        """
        count = 0

        with self.driver.session() as session:
            # Create FSO links from each ground station to all satellites
            # In reality, visibility depends on elevation angle, but we simplify
            # by creating links to all satellites with weather-dependent margin
            result = session.run("""
                MATCH (g:GroundStation), (s:Satellite)
                CREATE (g)-[r:FSO_LINK {
                    weather_score: g.weather_score,
                    margin_db: CASE
                        WHEN g.weather_score > 0.9 THEN 6.0
                        WHEN g.weather_score > 0.7 THEN 3.0
                        ELSE 1.0
                    END,
                    capacity_gbps: 10.0,
                    link_type: 'ground_to_sat'
                }]->(s)
                RETURN count(r) as created
            """)
            count = result.single()["created"]

        print(f"Created {count} FSO links")
        return count

    def get_statistics(self) -> dict:
        """Get graph statistics."""
        stats = {}

        with self.driver.session() as session:
            # Node counts
            result = session.run("MATCH (g:GroundStation) RETURN count(g) as count")
            stats["ground_stations"] = result.single()["count"]

            result = session.run("MATCH (s:Satellite) RETURN count(s) as count")
            stats["satellites"] = result.single()["count"]

            # Relationship counts
            result = session.run("MATCH ()-[r:FSO_LINK]->() RETURN count(r) as count")
            stats["fso_links"] = result.single()["count"]

            result = session.run("MATCH ()-[r:ISL]->() RETURN count(r) as count")
            stats["isl_links"] = result.single()["count"]

            # Zone distribution
            result = session.run("""
                MATCH (g:GroundStation)
                RETURN g.zone as zone, count(g) as count
                ORDER BY count DESC
            """)
            stats["zones"] = {r["zone"]: r["count"] for r in result}

            # Security score distribution
            result = session.run("""
                MATCH (g:GroundStation)
                RETURN
                    avg(g.security_score) as avg_security,
                    min(g.security_score) as min_security,
                    max(g.security_score) as max_security
            """)
            record = result.single()
            stats["security_avg"] = record["avg_security"]
            stats["security_min"] = record["min_security"]
            stats["security_max"] = record["max_security"]

        return stats


def main():
    parser = argparse.ArgumentParser(description="Load SX9-Orbital constellation to Neo4j")
    parser.add_argument("--uri", default="bolt://localhost:7687", help="Neo4j URI")
    parser.add_argument("--user", default="neo4j", help="Neo4j username")
    parser.add_argument("--password", default=os.environ.get("NEO4J_PASSWORD", ""), help="Neo4j password (or set NEO4J_PASSWORD env var)")
    parser.add_argument("--stations-file", type=Path,
                        default=Path(__file__).parent.parent / "data" / "selected_247_stations.json",
                        help="Path to selected stations JSON")
    parser.add_argument("--stations-only", action="store_true", help="Load only ground stations")
    parser.add_argument("--clear", action="store_true", help="Clear existing orbital data first")
    parser.add_argument("--no-links", action="store_true", help="Skip creating FSO and ISL links")
    args = parser.parse_args()

    if not args.stations_file.exists():
        print(f"ERROR: Stations file not found: {args.stations_file}")
        print("Run the candidate-selector first: cargo run -p candidate-selector")
        return 1

    loader = OrbitalNeo4jLoader(args.uri, args.user, args.password)

    try:
        if args.clear:
            print("\n=== Clearing existing orbital data ===")
            loader.clear_orbital_data()

        print("\n=== Creating indexes ===")
        loader.create_indexes()

        print("\n=== Loading ground stations ===")
        loader.load_ground_stations(args.stations_file)

        if not args.stations_only:
            print("\n=== Loading HALO satellites ===")
            loader.load_satellites()

            if not args.no_links:
                print("\n=== Creating ISL links ===")
                loader.create_isl_links()

                print("\n=== Creating FSO links ===")
                loader.create_fso_links()

        print("\n=== Graph Statistics ===")
        stats = loader.get_statistics()
        print(f"  Ground Stations: {stats['ground_stations']}")
        print(f"  Satellites: {stats['satellites']}")
        print(f"  FSO Links: {stats['fso_links']}")
        print(f"  ISL Links: {stats['isl_links']}")
        print(f"  Zone Distribution: {stats['zones']}")
        print(f"  Security Score: avg={stats['security_avg']:.3f}, min={stats['security_min']:.3f}, max={stats['security_max']:.3f}")

        print("\n=== Sample Cypher Queries ===")
        print("""
# Count nodes
MATCH (g:GroundStation) RETURN count(g) as stations;
MATCH (s:Satellite) RETURN count(s) as satellites;

# Find high-security US stations
MATCH (g:GroundStation)
WHERE g.country_code = 'US' AND g.security_score > 0.8
RETURN g.name, g.security_score, g.zone
ORDER BY g.security_score DESC
LIMIT 10;

# Find path between two ground stations via satellite
MATCH path = shortestPath(
  (a:GroundStation {zone: 'Americas'})-[:FSO_LINK|ISL*]-(b:GroundStation {zone: 'Apac'})
)
RETURN path LIMIT 1;

# Weather-degraded FSO links (potential outages)
MATCH (g:GroundStation)-[l:FSO_LINK]->(s:Satellite)
WHERE l.weather_score < 0.7
RETURN g.name, g.country_code, l.weather_score
ORDER BY l.weather_score
LIMIT 20;

# Stations by security tier
MATCH (g:GroundStation)
WITH g,
     CASE
       WHEN g.security_score >= 0.85 THEN 'Tier1-LowRisk'
       WHEN g.security_score >= 0.70 THEN 'Tier2-Moderate'
       WHEN g.security_score >= 0.50 THEN 'Tier3-Elevated'
       ELSE 'Tier4-HighRisk'
     END as risk_tier
RETURN risk_tier, count(g) as station_count
ORDER BY station_count DESC;

# Find satellite with most ground station connections
MATCH (s:Satellite)<-[:FSO_LINK]-(g:GroundStation)
RETURN s.name, count(g) as connections
ORDER BY connections DESC
LIMIT 5;
        """)

    finally:
        loader.close()

    return 0


if __name__ == "__main__":
    exit(main())
