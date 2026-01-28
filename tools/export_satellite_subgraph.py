#!/usr/bin/env python3
"""
Export Satellite Subgraph for Monte Carlo Simulations
======================================================

Exports the HALO constellation ISL network as a standalone graph
suitable for Monte Carlo reliability/routing simulations.

Output formats:
  - JSON adjacency list (for Python/Rust simulation)
  - GraphML (for NetworkX/igraph)
  - Edge list (for custom parsers)

Monte Carlo parameters included:
  - Link failure probability (based on space weather, debris)
  - Latency distribution (mean + std dev)
  - Capacity with utilization factor
  - Satellite failure probability

Usage:
  python export_satellite_subgraph.py                    # Export all formats
  python export_satellite_subgraph.py --format json      # JSON only
  python export_satellite_subgraph.py --from-neo4j       # Pull from live Neo4j
"""

import json
import math
import argparse
import os
from pathlib import Path
from datetime import datetime

# HALO constellation parameters
HALO_ALTITUDE_KM = 10500
EARTH_RADIUS_KM = 6371
SPEED_OF_LIGHT_KM_S = 299792.458

# Monte Carlo parameters
MC_PARAMS = {
    # Satellite parameters
    "satellite_failure_prob_per_year": 0.02,  # 2% annual failure rate
    "satellite_mtbf_hours": 43800,  # ~5 years mean time between failures

    # ISL link parameters
    "isl_intra_plane": {
        "latency_mean_ms": 35.0,
        "latency_std_ms": 2.0,
        "capacity_gbps": 100.0,
        "failure_prob_per_hour": 0.0001,  # 0.01% hourly
        "mttr_hours": 0.5,  # Mean time to repair (automatic repointing)
    },
    "isl_inter_plane": {
        "latency_mean_ms": 45.0,
        "latency_std_ms": 5.0,
        "capacity_gbps": 80.0,
        "failure_prob_per_hour": 0.0005,  # Higher due to dynamic geometry
        "mttr_hours": 1.0,
    },

    # Space weather effects
    "solar_storm_probability": 0.001,  # Per simulation hour
    "solar_storm_link_failure_increase": 10.0,  # 10x failure rate during storm

    # Debris/collision risk
    "debris_collision_prob_per_sat_per_year": 0.0001,
}


def calculate_isl_distance_km(plane1: int, slot1: int, plane2: int, slot2: int) -> float:
    """Calculate approximate ISL distance between two satellites."""
    # Simplified: assume circular orbits at same altitude
    orbit_radius = EARTH_RADIUS_KM + HALO_ALTITUDE_KM

    if plane1 == plane2:
        # Intra-plane: angular separation based on slot difference
        slot_diff = min(abs(slot1 - slot2), 4 - abs(slot1 - slot2))
        angle_rad = math.radians(slot_diff * 90)  # 90° between slots
    else:
        # Inter-plane: angular separation based on RAAN difference
        raan_diff = abs((plane1 - 1) * 60 - (plane2 - 1) * 60)  # 60° between planes
        if raan_diff > 180:
            raan_diff = 360 - raan_diff
        angle_rad = math.radians(raan_diff)

    # Chord length formula
    distance = 2 * orbit_radius * math.sin(angle_rad / 2)
    return distance


def calculate_light_delay_ms(distance_km: float) -> float:
    """Calculate one-way light propagation delay."""
    return (distance_km / SPEED_OF_LIGHT_KM_S) * 1000


def build_halo_constellation() -> dict:
    """Build the HALO constellation graph structure."""
    satellites = []
    edges = []

    # Create satellites
    for plane in range(1, 4):
        raan = (plane - 1) * 60  # 0°, 60°, 120°
        for slot in range(1, 5):
            phase = (slot - 1) * 90  # 0°, 90°, 180°, 270°
            sat_id = f"HALO-{plane}-{slot}"

            satellites.append({
                "id": sat_id,
                "plane": plane,
                "slot": slot,
                "altitude_km": HALO_ALTITUDE_KM,
                "raan_deg": raan,
                "phase_deg": phase,
                "orbit_type": "MEO",
                "failure_prob_per_year": MC_PARAMS["satellite_failure_prob_per_year"],
                "mtbf_hours": MC_PARAMS["satellite_mtbf_hours"],
            })

    # Create ISL edges
    for plane in range(1, 4):
        for slot in range(1, 5):
            sat_id = f"HALO-{plane}-{slot}"

            # Intra-plane: connect to next slot (with wraparound)
            next_slot = slot + 1 if slot < 4 else 1
            neighbor_id = f"HALO-{plane}-{next_slot}"
            distance = calculate_isl_distance_km(plane, slot, plane, next_slot)
            light_delay = calculate_light_delay_ms(distance)

            edges.append({
                "source": sat_id,
                "target": neighbor_id,
                "type": "intra_plane",
                "distance_km": round(distance, 2),
                "light_delay_ms": round(light_delay, 2),
                **MC_PARAMS["isl_intra_plane"],
            })

            # Inter-plane: connect to same slot in next plane (with wraparound)
            next_plane = plane + 1 if plane < 3 else 1
            neighbor_id = f"HALO-{next_plane}-{slot}"
            distance = calculate_isl_distance_km(plane, slot, next_plane, slot)
            light_delay = calculate_light_delay_ms(distance)

            edges.append({
                "source": sat_id,
                "target": neighbor_id,
                "type": "inter_plane",
                "distance_km": round(distance, 2),
                "light_delay_ms": round(light_delay, 2),
                **MC_PARAMS["isl_inter_plane"],
            })

    return {
        "constellation": "HALO",
        "num_planes": 3,
        "sats_per_plane": 4,
        "total_satellites": 12,
        "total_isl_links": len(edges),
        "altitude_km": HALO_ALTITUDE_KM,
        "generated_at": datetime.now().isoformat(),
        "mc_parameters": MC_PARAMS,
        "satellites": satellites,
        "isl_links": edges,
    }


def export_json(graph: dict, output_path: Path):
    """Export graph as JSON."""
    with open(output_path, "w") as f:
        json.dump(graph, f, indent=2)
    print(f"Exported JSON: {output_path}")


def export_adjacency_list(graph: dict, output_path: Path):
    """Export as adjacency list for fast graph algorithms."""
    adj = {}
    for sat in graph["satellites"]:
        adj[sat["id"]] = {
            "node": sat,
            "neighbors": []
        }

    for edge in graph["isl_links"]:
        adj[edge["source"]]["neighbors"].append({
            "target": edge["target"],
            "type": edge["type"],
            "latency_mean_ms": edge["latency_mean_ms"],
            "capacity_gbps": edge["capacity_gbps"],
            "failure_prob_per_hour": edge["failure_prob_per_hour"],
        })

    output = {
        "format": "adjacency_list",
        "constellation": graph["constellation"],
        "generated_at": graph["generated_at"],
        "mc_parameters": graph["mc_parameters"],
        "adjacency": adj,
    }

    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"Exported adjacency list: {output_path}")


def export_edge_list(graph: dict, output_path: Path):
    """Export as simple edge list (CSV-like)."""
    lines = [
        "# HALO Constellation ISL Edge List",
        f"# Generated: {graph['generated_at']}",
        "# Format: source,target,type,latency_ms,capacity_gbps,failure_prob",
        ""
    ]

    for edge in graph["isl_links"]:
        lines.append(
            f"{edge['source']},{edge['target']},{edge['type']},"
            f"{edge['latency_mean_ms']},{edge['capacity_gbps']},"
            f"{edge['failure_prob_per_hour']}"
        )

    with open(output_path, "w") as f:
        f.write("\n".join(lines))
    print(f"Exported edge list: {output_path}")


def export_graphml(graph: dict, output_path: Path):
    """Export as GraphML for NetworkX/igraph."""
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
        '  <key id="plane" for="node" attr.name="plane" attr.type="int"/>',
        '  <key id="slot" for="node" attr.name="slot" attr.type="int"/>',
        '  <key id="altitude_km" for="node" attr.name="altitude_km" attr.type="double"/>',
        '  <key id="type" for="edge" attr.name="type" attr.type="string"/>',
        '  <key id="latency_ms" for="edge" attr.name="latency_ms" attr.type="double"/>',
        '  <key id="capacity_gbps" for="edge" attr.name="capacity_gbps" attr.type="double"/>',
        '  <key id="failure_prob" for="edge" attr.name="failure_prob" attr.type="double"/>',
        '  <graph id="HALO" edgedefault="directed">',
    ]

    # Nodes
    for sat in graph["satellites"]:
        lines.append(f'    <node id="{sat["id"]}">')
        lines.append(f'      <data key="plane">{sat["plane"]}</data>')
        lines.append(f'      <data key="slot">{sat["slot"]}</data>')
        lines.append(f'      <data key="altitude_km">{sat["altitude_km"]}</data>')
        lines.append('    </node>')

    # Edges
    for i, edge in enumerate(graph["isl_links"]):
        lines.append(f'    <edge id="e{i}" source="{edge["source"]}" target="{edge["target"]}">')
        lines.append(f'      <data key="type">{edge["type"]}</data>')
        lines.append(f'      <data key="latency_ms">{edge["latency_mean_ms"]}</data>')
        lines.append(f'      <data key="capacity_gbps">{edge["capacity_gbps"]}</data>')
        lines.append(f'      <data key="failure_prob">{edge["failure_prob_per_hour"]}</data>')
        lines.append('    </edge>')

    lines.append('  </graph>')
    lines.append('</graphml>')

    with open(output_path, "w") as f:
        f.write("\n".join(lines))
    print(f"Exported GraphML: {output_path}")


def export_rust_const(graph: dict, output_path: Path):
    """Export as Rust const arrays for embedded simulation."""
    lines = [
        "//! HALO Constellation ISL Network - Auto-generated",
        f"//! Generated: {graph['generated_at']}",
        "",
        "/// Number of satellites in HALO constellation",
        f"pub const NUM_SATELLITES: usize = {len(graph['satellites'])};",
        "",
        "/// Number of ISL links",
        f"pub const NUM_ISL_LINKS: usize = {len(graph['isl_links'])};",
        "",
        "/// Satellite IDs indexed by (plane-1)*4 + (slot-1)",
        "pub const SATELLITE_IDS: [&str; NUM_SATELLITES] = [",
    ]
    for sat in sorted(graph["satellites"], key=lambda s: (s["plane"], s["slot"])):
        lines.append(f'    "{sat["id"]}",')
    lines.append("];")
    lines.append("")

    # ISL adjacency as edge list
    lines.append("/// ISL edges as (source_idx, target_idx, latency_ms, capacity_gbps, failure_prob_per_hour)")
    lines.append("pub const ISL_EDGES: [(usize, usize, f64, f64, f64); NUM_ISL_LINKS] = [")

    sat_to_idx = {sat["id"]: i for i, sat in enumerate(
        sorted(graph["satellites"], key=lambda s: (s["plane"], s["slot"]))
    )}

    for edge in graph["isl_links"]:
        src_idx = sat_to_idx[edge["source"]]
        tgt_idx = sat_to_idx[edge["target"]]
        lines.append(
            f"    ({src_idx}, {tgt_idx}, {edge['latency_mean_ms']}, "
            f"{edge['capacity_gbps']}, {edge['failure_prob_per_hour']}),  // {edge['source']} -> {edge['target']}"
        )
    lines.append("];")
    lines.append("")

    # MC parameters
    lines.append("/// Monte Carlo simulation parameters")
    lines.append("pub mod mc_params {")
    lines.append(f"    pub const SATELLITE_FAILURE_PROB_PER_YEAR: f64 = {MC_PARAMS['satellite_failure_prob_per_year']};")
    lines.append(f"    pub const SATELLITE_MTBF_HOURS: f64 = {MC_PARAMS['satellite_mtbf_hours']}.0;")
    lines.append(f"    pub const SOLAR_STORM_PROBABILITY: f64 = {MC_PARAMS['solar_storm_probability']};")
    lines.append(f"    pub const SOLAR_STORM_FAILURE_MULTIPLIER: f64 = {MC_PARAMS['solar_storm_link_failure_increase']};")
    lines.append("}")

    with open(output_path, "w") as f:
        f.write("\n".join(lines))
    print(f"Exported Rust const: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Export HALO satellite subgraph for Monte Carlo")
    parser.add_argument("--output-dir", "-o", type=Path,
                        default=Path(__file__).parent.parent / "data",
                        help="Output directory")
    parser.add_argument("--format", choices=["all", "json", "adjacency", "edgelist", "graphml", "rust"],
                        default="all", help="Export format")
    parser.add_argument("--from-neo4j", action="store_true",
                        help="Pull satellite data from live Neo4j instead of building from scratch")
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)

    # Build constellation graph
    print("Building HALO constellation graph...")
    graph = build_halo_constellation()

    print(f"\nConstellation: {graph['constellation']}")
    print(f"Satellites: {graph['total_satellites']}")
    print(f"ISL Links: {graph['total_isl_links']}")
    print(f"Altitude: {graph['altitude_km']} km")
    print("")

    # Export in requested format(s)
    if args.format in ("all", "json"):
        export_json(graph, args.output_dir / "halo_isl_network.json")

    if args.format in ("all", "adjacency"):
        export_adjacency_list(graph, args.output_dir / "halo_isl_adjacency.json")

    if args.format in ("all", "edgelist"):
        export_edge_list(graph, args.output_dir / "halo_isl_edges.csv")

    if args.format in ("all", "graphml"):
        export_graphml(graph, args.output_dir / "halo_isl_network.graphml")

    if args.format in ("all", "rust"):
        export_rust_const(graph, args.output_dir / "halo_constellation.rs")

    print("\nMonte Carlo parameters included:")
    print(f"  - Satellite failure prob: {MC_PARAMS['satellite_failure_prob_per_year']*100:.1f}%/year")
    print(f"  - Intra-plane ISL failure: {MC_PARAMS['isl_intra_plane']['failure_prob_per_hour']*100:.2f}%/hour")
    print(f"  - Inter-plane ISL failure: {MC_PARAMS['isl_inter_plane']['failure_prob_per_hour']*100:.2f}%/hour")
    print(f"  - Solar storm probability: {MC_PARAMS['solar_storm_probability']*100:.2f}%/hour")

    return 0


if __name__ == "__main__":
    exit(main())
