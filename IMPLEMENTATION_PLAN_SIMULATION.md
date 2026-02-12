# SX9-Orbital Simulation Implementation Plan

**Goal:** Build routing simulation infrastructure for HFT-grade constellation routing with ground station state machines.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  State Management (Mutable - for tinkering)                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Gateway Memory (Rust)                                   │   │
│  │  - Ground station WASM state (door, slew, tracking)     │   │
│  │  - Satellite positions (updated per tick)               │   │
│  │  - Link quality (weather × geometry)                    │   │
│  │  - Exposed via REST API for tinkering                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Neo4j (Immutable Topology)                             │   │
│  │  - Ground station configs (lat, lon, tier, zone)        │   │
│  │  - Satellite orbital params (TLE, plane, slot)          │   │
│  │  - Link definitions (FSO, ISL, capacity)                │   │
│  │  - Routing queries (Dijkstra, A*)                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Simulation Output (Time-series)                        │   │
│  │  - DuckDB/Parquet for analysis                          │   │
│  │  - Route decisions, latencies, costs                    │   │
│  │  - State transitions (door open/close events)           │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Neo4j Topology (Immutable)

### 1.1 Clean existing data
```cypher
// Remove duplicate ground stations
MATCH (g:GroundStation)
WITH g.name as name, collect(g) as nodes
WHERE size(nodes) > 1
FOREACH (n in tail(nodes) | DETACH DELETE n);
```

### 1.2 Ground Station Schema
```cypher
(:GroundStation {
  // Identity
  id: String,           // "NYSE-MAHWAH" or "GS-001"
  name: String,

  // Location (immutable)
  latitude: Float,
  longitude: Float,
  altitude_m: Float,
  zone: String,         // "Americas", "EMEA", "APAC"

  // Configuration (immutable)
  tier: Integer,        // 0=critical, 1=primary, 2=secondary
  min_elevation_deg: Float,
  max_slew_rate_deg_s: Float,
  door_transition_sec: Float,

  // Weather baseline (from GEE/historical)
  annual_clear_sky_pct: Float,
  annual_sunshine_hours: Float,

  // Source tracking
  source: String,       // "terraform", "financial_infra", "peeringdb"
  validated: Boolean
})
```

### 1.3 Satellite Schema
```cypher
(:Satellite {
  // Identity
  id: String,           // "alpha", "beta", etc.
  name: String,         // "ALPHA", "BETA"
  norad_id: Integer,

  // Orbital params (for SGP4)
  tle_line1: String,
  tle_line2: String,
  plane: Integer,
  slot: Integer,
  altitude_km: Float,
  inclination_deg: Float,

  // Constellation
  constellation: String  // "HALO"
})
```

### 1.4 Link Schema
```cypher
// FSO Link (ground to satellite)
(:GroundStation)-[:FSO_LINK {
  id: String,
  base_margin_db: Float,
  max_throughput_gbps: Float,
  base_latency_ms: Float
}]->(:Satellite)

// ISL (satellite to satellite)
(:Satellite)-[:ISL {
  id: String,
  margin_db: Float,
  throughput_gbps: Float,
  latency_ms: Float
}]->(:Satellite)
```

---

## Phase 2: Gateway State API (Mutable)

### 2.1 State Endpoints for Tinkering

```
GET  /api/v1/state/stations              # All station states
GET  /api/v1/state/stations/{id}         # Single station state
PUT  /api/v1/state/stations/{id}         # Update station state

GET  /api/v1/state/satellites            # All satellite positions
GET  /api/v1/state/links                 # All link qualities

POST /api/v1/sim/tick                    # Advance simulation by N seconds
POST /api/v1/sim/weather                 # Inject weather event
POST /api/v1/sim/route                   # Calculate optimal route
```

### 2.2 Station State Object (in memory)
```rust
pub struct GroundStationState {
    pub id: String,

    // WASM state machine
    pub door_state: DoorState,      // Closed|Opening|Open|Closing|Fault
    pub door_position: f64,         // 0.0-1.0
    pub tracking_state: TrackingState, // Idle|Acquiring|Tracking|LostSignal

    // Pointing
    pub azimuth_deg: f64,
    pub elevation_deg: f64,
    pub target_satellite: Option<String>,

    // Link quality
    pub weather_score: f64,         // 0.0-1.0 (live or injected)
    pub link_margin_db: f64,

    // Timestamps
    pub last_update_ms: u64,
}
```

### 2.3 Tinker Examples

```bash
# Get current state of a station
curl http://localhost:18700/api/v1/state/stations/NYSE-MAHWAH

# Inject bad weather at a station
curl -X PUT http://localhost:18700/api/v1/state/stations/NYSE-MAHWAH \
  -d '{"weather_score": 0.2}'

# Open the door manually
curl -X PUT http://localhost:18700/api/v1/state/stations/NYSE-MAHWAH \
  -d '{"door_state": "Opening"}'

# Advance simulation 10 seconds
curl -X POST http://localhost:18700/api/v1/sim/tick \
  -d '{"delta_sec": 10.0}'

# Calculate route with current state
curl -X POST http://localhost:18700/api/v1/sim/route \
  -d '{"from": "NYSE-MAHWAH", "to": "LSE-SLOUGH", "sla_ms": 50}'
```

---

## Phase 3: Routing Simulation

### 3.1 Route Decision Cascade

```
1. FEASIBILITY
   ├── Source station: door open? tracking?
   ├── Visible satellites from source
   ├── Weather score > threshold
   └── Filter to feasible first hops

2. PATH FINDING (Neo4j)
   ├── Dijkstra with current link costs
   ├── Cost = f(latency, weather, congestion)
   └── Return candidate paths

3. SLA CHECK
   ├── Total latency < SLA deadline
   ├── Failure probability < threshold
   └── Filter to SLA-compliant paths

4. COST OPTIMIZATION
   ├── Among SLA-compliant paths
   ├── Find cheapest
   └── Check if lower QoS tier works

5. ROUTE DECISION
   └── Execute or queue
```

### 3.2 Route Response
```json
{
  "path": ["NYSE-MAHWAH", "alpha", "beta", "LSE-SLOUGH"],
  "hops": 3,
  "latency_ms": 42.5,
  "sla_met": true,
  "cost_units": 2.3,
  "qos_tier": "Silver",
  "alternatives": [
    {
      "path": ["NYSE-MAHWAH", "alpha", "LSE-SLOUGH"],
      "latency_ms": 48.2,
      "cost_units": 1.8,
      "qos_tier": "Bronze"
    }
  ],
  "weather_impacts": [
    {"station": "NYSE-MAHWAH", "score": 0.85}
  ]
}
```

---

## Phase 4: Data Loading

### 4.1 Candidate Sources
- `selected_247_smart.json` - 175 curated financial/infrastructure
- `foundation_candidates.json` - larger candidate pool
- `peeringdb_ixps.json` - internet exchange points
- Terraform 247 - original selection

### 4.2 Selection Criteria (Multi-factor)
1. **Geographic coverage** - minimize max distance to any point
2. **Weather baseline** - annual clear sky percentage (GEE)
3. **Infrastructure tier** - data center quality
4. **Financial proximity** - distance to exchanges/trading
5. **Latency geometry** - optimal satellite visibility

### 4.3 Load Script
```bash
# Load ground stations to Neo4j
cargo run -p orbital-glaf --example load_stations -- \
  --source /path/to/candidates.json \
  --limit 247 \
  --neo4j bolt://localhost:7687

# Generate ISL topology for HALO
cargo run -p orbital-glaf --example generate_isl -- \
  --constellation halo \
  --neo4j bolt://localhost:7687
```

---

## Phase 5: Satellite ANN (Future)

Each satellite becomes an independent routing agent:

```rust
pub struct SatelliteANN {
    pub id: String,

    // Neural network weights (learned)
    weights: Vec<f64>,

    // Inputs
    // - Visible ground stations + weather scores
    // - ISL latencies to neighbors
    // - Payload SLA requirements
    // - Current congestion

    // Output
    // - Next hop decision (ground station or neighbor sat)
}
```

Train via:
- Historical routing decisions
- Reinforcement learning on simulation
- Federated learning across constellation

---

## Implementation Order

### Week 1: Foundation
- [ ] Clean Neo4j duplicates
- [ ] Load 175 stations from selected_247_smart.json
- [ ] Add WASM state fields to gateway
- [ ] Implement state GET/PUT endpoints

### Week 2: Routing
- [ ] Implement route calculation endpoint
- [ ] Add SLA/QoS tier logic
- [ ] Cost optimization (cheaper within SLA)
- [ ] Weather injection for testing

### Week 3: Simulation
- [ ] Tick-based simulation loop
- [ ] DuckDB output for time-series
- [ ] Multi-route comparison
- [ ] Batch simulation runner

### Week 4: Analysis
- [ ] Polars notebooks for analysis
- [ ] Station selection optimization
- [ ] Compare 247 candidates
- [ ] GEE weather data integration

---

## Quick Start (Today)

```bash
# 1. Gateway is already running on :18700

# 2. Clean Neo4j and load fresh data
cd /Users/cp5337/Developer/sx9-orbital
# (run load script - to be created)

# 3. Test state API
curl http://localhost:18700/api/v1/state/stations | jq '.[0]'

# 4. Test routing
curl -X POST http://localhost:18700/api/v1/sim/route \
  -d '{"from": "station-1", "to": "station-2", "sla_ms": 100}'
```

---

*Generated: 2026-02-11*
*Task: SX9-133 Reference Design Alignment*
