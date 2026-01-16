# SX9-Orbital TODO

**Last Updated:** 2026-01-15
**Branch:** main

---

## Data Assets Available

### Cable Infrastructure (Just Added)
Located in `data/cable-infrastructure/`:

| File | Records | Description |
|------|---------|-------------|
| cable_landing_complete.json | 1,900 | Landing points with cable lists |
| cable_landing_points.json | 1,900 | Sorted by connectivity |
| cable_landing_points_geo.json | 1,900 | Coordinates only |
| submarine_cables.json | 686 | Cable definitions |

**Source:** TeleGeography SubmarineCableMap API (scraped Dec 2025)

---

## High-Level TODO

### Phase 1: Ground Station Network
- [ ] Extend `ground-stations` crate to load from JSON
- [ ] Import 1,900 cable landing points as potential FSO sites
- [ ] Filter to strategic sites (high connectivity, geographic spread)
- [ ] Target: 257 operational ground stations
- [ ] Add weather monitoring integration points

### Phase 2: Constellation Management
- [ ] Define 12-satellite constellation (3 planes)
- [ ] Implement SGP4 propagation in crate
- [ ] Build WASM module for edge/browser propagation
- [ ] Create TLE management system

### Phase 3: FSO Link Budget
- [ ] Implement link budget calculations (1550nm)
- [ ] Sat-to-sat link viability
- [ ] Sat-to-ground link viability
- [ ] Weather impact modeling

### Phase 4: Routing & Mesh
- [ ] Build constellation graph (petgraph)
- [ ] Implement Dijkstra routing
- [ ] Bird-to-bird mesh topology
- [ ] Ground station handoff logic

### Phase 5: Visualization
- [ ] Cesium integration for 3D globe
- [ ] LaserLight beam rendering
- [ ] Real-time link state updates
- [ ] Ground station markers with status

### Phase 6: CTAS Integration
- [ ] Trivariate records for all stations
- [ ] NATS event publishing
- [ ] Threat detection layer
- [ ] Jamming/anomaly recognition

---

## Crates Structure

```
crates/
├── ground-stations/     # 257 FSO ground stations [EXISTS]
├── constellation/       # 12-sat management [TODO]
├── fso-link/           # Link budget calcs [TODO]
├── orbital-routing/    # Mesh routing [TODO]
└── sgp4-wasm/          # WASM propagator [TODO]
```

---

## Data Flow

```
Cable Landing Points (1,900)
        │
        ▼
    Filter & Select
        │
        ▼
Ground Stations (257)  ◄──── Weather Data
        │
        ▼
    FSO Links
        │
        ▼
Satellite Constellation (12)
        │
        ▼
    CTAS Integration
        │
        ▼
    sx9-gateway-primary
```

---

## Quick Start

```bash
# Build all crates
cargo build --workspace

# Run ground station tests
cargo test -p ground-stations

# Check data files
ls -la data/cable-infrastructure/
```

---

## Related Repos

- **sx9** (main) - Gateway, tcache, harness
- **sx9-orbital** (this) - Orbital infrastructure
- **sx9-archive** - Legacy orbital-simulator code

---

## Notes

- Cable landing data from TeleGeography is authoritative public infrastructure
- Top connected sites (Batam, Marseille, Mumbai, Singapore) are strategic
- 1,900 points can be filtered down to 257 most strategic for FSO
- Weather data integration needed for link availability
