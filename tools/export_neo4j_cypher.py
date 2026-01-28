#!/usr/bin/env python3
"""
Neo4j Cypher Export Script
===========================

Exports the SX9-Orbital constellation to Cypher statements that can be
imported into Neo4j without requiring a live connection.

Output: orbital_constellation.cypher

Usage:
  python export_neo4j_cypher.py                           # Export all
  python export_neo4j_cypher.py --output my_export.cypher # Custom output file
"""

import json
import argparse
from pathlib import Path
from datetime import datetime


# HALO constellation: 12 MEO satellites at 10,500km
HALO_CONSTELLATION = [
    {"id": "HALO-1-1", "name": "HALO-1-1", "plane": 1, "slot": 1, "altitude_km": 10500, "raan": 0, "phase": 0},
    {"id": "HALO-1-2", "name": "HALO-1-2", "plane": 1, "slot": 2, "altitude_km": 10500, "raan": 0, "phase": 90},
    {"id": "HALO-1-3", "name": "HALO-1-3", "plane": 1, "slot": 3, "altitude_km": 10500, "raan": 0, "phase": 180},
    {"id": "HALO-1-4", "name": "HALO-1-4", "plane": 1, "slot": 4, "altitude_km": 10500, "raan": 0, "phase": 270},
    {"id": "HALO-2-1", "name": "HALO-2-1", "plane": 2, "slot": 1, "altitude_km": 10500, "raan": 60, "phase": 0},
    {"id": "HALO-2-2", "name": "HALO-2-2", "plane": 2, "slot": 2, "altitude_km": 10500, "raan": 60, "phase": 90},
    {"id": "HALO-2-3", "name": "HALO-2-3", "plane": 2, "slot": 3, "altitude_km": 10500, "raan": 60, "phase": 180},
    {"id": "HALO-2-4", "name": "HALO-2-4", "plane": 2, "slot": 4, "altitude_km": 10500, "raan": 60, "phase": 270},
    {"id": "HALO-3-1", "name": "HALO-3-1", "plane": 3, "slot": 1, "altitude_km": 10500, "raan": 120, "phase": 0},
    {"id": "HALO-3-2", "name": "HALO-3-2", "plane": 3, "slot": 2, "altitude_km": 10500, "raan": 120, "phase": 90},
    {"id": "HALO-3-3", "name": "HALO-3-3", "plane": 3, "slot": 3, "altitude_km": 10500, "raan": 120, "phase": 180},
    {"id": "HALO-3-4", "name": "HALO-3-4", "plane": 3, "slot": 4, "altitude_km": 10500, "raan": 120, "phase": 270},
]


def escape_cypher(s: str) -> str:
    """Escape string for Cypher."""
    if s is None:
        return ""
    return str(s).replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')


def format_value(v) -> str:
    """Format a value for Cypher."""
    if v is None:
        return "null"
    elif isinstance(v, bool):
        return "true" if v else "false"
    elif isinstance(v, (int, float)):
        return str(v)
    elif isinstance(v, list):
        items = ", ".join(format_value(i) for i in v)
        return f"[{items}]"
    else:
        return f"'{escape_cypher(str(v))}'"


def main():
    parser = argparse.ArgumentParser(description="Export SX9-Orbital constellation to Cypher")
    parser.add_argument("--stations-file", type=Path,
                        default=Path(__file__).parent.parent / "data" / "selected_247_stations.json",
                        help="Path to selected stations JSON")
    parser.add_argument("--output", "-o", type=Path,
                        default=Path(__file__).parent.parent / "data" / "orbital_constellation.cypher",
                        help="Output Cypher file")
    args = parser.parse_args()

    if not args.stations_file.exists():
        print(f"ERROR: Stations file not found: {args.stations_file}")
        return 1

    with open(args.stations_file) as f:
        data = json.load(f)

    selected = data.get("selected", [])
    metadata = data.get("metadata", {})

    lines = []
    lines.append("// SX9-Orbital Constellation Graph Export")
    lines.append(f"// Generated: {datetime.now().isoformat()}")
    lines.append(f"// Total Stations: {len(selected)}")
    lines.append(f"// Satellites: {len(HALO_CONSTELLATION)}")
    lines.append("")

    # Clear existing data
    lines.append("// === Clear existing orbital data ===")
    lines.append("MATCH ()-[r:FSO_LINK|ISL|NEAR_CABLE]-() DELETE r;")
    lines.append("MATCH (n) WHERE n:GroundStation OR n:Satellite DETACH DELETE n;")
    lines.append("")

    # Create indexes
    lines.append("// === Create indexes ===")
    lines.append("CREATE INDEX IF NOT EXISTS FOR (g:GroundStation) ON (g.id);")
    lines.append("CREATE INDEX IF NOT EXISTS FOR (g:GroundStation) ON (g.zone);")
    lines.append("CREATE INDEX IF NOT EXISTS FOR (g:GroundStation) ON (g.country_code);")
    lines.append("CREATE INDEX IF NOT EXISTS FOR (s:Satellite) ON (s.id);")
    lines.append("CREATE INDEX IF NOT EXISTS FOR (s:Satellite) ON (s.plane);")
    lines.append("")

    # Create satellites
    lines.append("// === Create HALO Satellites ===")
    for sat in HALO_CONSTELLATION:
        lines.append(f"""CREATE (:Satellite {{
  id: '{sat['id']}',
  name: '{sat['name']}',
  plane: {sat['plane']},
  slot: {sat['slot']},
  altitude_km: {sat['altitude_km']},
  raan: {sat['raan']},
  phase: {sat['phase']},
  constellation: 'HALO',
  orbit_type: 'MEO'
}});""")
    lines.append("")

    # Create ground stations
    lines.append("// === Create Ground Stations ===")
    for entry in selected:
        c = entry.get("candidate", {})
        lines.append(f"""CREATE (:GroundStation {{
  id: {format_value(c.get('id'))},
  name: {format_value(c.get('name'))},
  latitude: {format_value(c.get('latitude'))},
  longitude: {format_value(c.get('longitude'))},
  zone: {format_value(c.get('zone'))},
  source: {format_value(c.get('source'))},
  tier: {format_value(c.get('tier'))},
  demand_gbps: {format_value(c.get('demand_gbps'))},
  weather_score: {format_value(c.get('weather_score'))},
  country_code: {format_value(c.get('country_code'))},
  security_score: {format_value(entry.get('security_score', c.get('security_score')))},
  composite_score: {format_value(entry.get('score'))},
  pop_score: {format_value(entry.get('pop_score'))},
  xai_score: {format_value(entry.get('xai_score'))},
  travel_advisory_level: {format_value(c.get('travel_advisory_level'))},
  political_stability: {format_value(c.get('political_stability'))}
}});""")
    lines.append("")

    # Create ISL links
    lines.append("// === Create ISL Links ===")
    # Intra-plane (adjacent slots)
    for plane in range(1, 4):
        for slot in range(1, 5):
            next_slot = slot + 1 if slot < 4 else 1
            s1 = f"HALO-{plane}-{slot}"
            s2 = f"HALO-{plane}-{next_slot}"
            lines.append(f"""MATCH (s1:Satellite {{id: '{s1}'}}), (s2:Satellite {{id: '{s2}'}})
CREATE (s1)-[:ISL {{type: 'intra_plane', latency_ms: 35.0, capacity_gbps: 100.0}}]->(s2);""")

    # Inter-plane (same slot, adjacent planes)
    for plane in range(1, 4):
        next_plane = plane + 1 if plane < 3 else 1
        for slot in range(1, 5):
            s1 = f"HALO-{plane}-{slot}"
            s2 = f"HALO-{next_plane}-{slot}"
            lines.append(f"""MATCH (s1:Satellite {{id: '{s1}'}}), (s2:Satellite {{id: '{s2}'}})
CREATE (s1)-[:ISL {{type: 'inter_plane', latency_ms: 45.0, capacity_gbps: 80.0}}]->(s2);""")
    lines.append("")

    # Create FSO links
    lines.append("// === Create FSO Links ===")
    lines.append("""MATCH (g:GroundStation), (s:Satellite)
CREATE (g)-[:FSO_LINK {
  weather_score: g.weather_score,
  margin_db: CASE
    WHEN g.weather_score > 0.9 THEN 6.0
    WHEN g.weather_score > 0.7 THEN 3.0
    ELSE 1.0
  END,
  capacity_gbps: 10.0,
  link_type: 'ground_to_sat'
}]->(s);""")
    lines.append("")

    # Summary statistics queries
    lines.append("// === Verification Queries ===")
    lines.append("// Run these to verify the import:")
    lines.append("// MATCH (g:GroundStation) RETURN count(g) as stations;")
    lines.append("// MATCH (s:Satellite) RETURN count(s) as satellites;")
    lines.append("// MATCH ()-[r:FSO_LINK]->() RETURN count(r) as fso_links;")
    lines.append("// MATCH ()-[r:ISL]->() RETURN count(r) as isl_links;")
    lines.append("")
    lines.append("// Zone distribution:")
    lines.append("// MATCH (g:GroundStation) RETURN g.zone, count(g) ORDER BY count(g) DESC;")
    lines.append("")
    lines.append("// Security distribution:")
    lines.append("// MATCH (g:GroundStation) RETURN avg(g.security_score), min(g.security_score), max(g.security_score);")

    # Write output
    with open(args.output, "w") as f:
        f.write("\n".join(lines))

    print(f"Exported {len(selected)} ground stations and {len(HALO_CONSTELLATION)} satellites")
    print(f"Output: {args.output}")
    print(f"\nTo import into Neo4j:")
    print(f"  cat {args.output} | cypher-shell -u neo4j -p <password>")
    print(f"  # Or paste into Neo4j Browser at http://localhost:7474")

    return 0


if __name__ == "__main__":
    exit(main())
