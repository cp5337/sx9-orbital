# GLAF Data Flow: Hot/Cold Path with Legion ECS

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BERNOULLI ZONES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ZONE A (<50μs)          │  ZONE B (50μs-1ms)    │  ZONE C/D (1ms-60s)      │
│  ─────────────────       │  ─────────────────    │  ─────────────────       │
│  Legion ECS              │  GLAF petgraph        │  Neo4j queries           │
│  Ring Buffer (Atlas)     │  HFT Adjudicator      │  Monte Carlo sim         │
│  Crystal/SDT sync        │  Route scoring        │  Weather updates         │
│  Hash routing            │  k-shortest paths     │  LLM analysis            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Hot Path (Zone A - Legion ECS)

**Latency Budget: <50μs**

### Components (Data)

```rust
/// Ground station state - hot data updated every tick
#[derive(Clone, Copy, Debug)]
pub struct GsState {
    pub azimuth_deg: f64,           // 9-decimal precision
    pub elevation_deg: f64,         // 9-decimal precision
    pub door_state: u8,             // 0=closed, 1=opening, 2=open, 3=closing
    pub tracking_sat: u32,          // NORAD ID or 0
    pub link_margin_db: f64,        // 9-decimal precision
    pub weather_score: f64,         // 9-decimal precision
    pub last_tick_ns: u64,          // SDT timestamp
}

/// Satellite ephemeris - propagated every tick
#[derive(Clone, Copy, Debug)]
pub struct SatEphem {
    pub lat_deg: f64,               // 9-decimal precision
    pub lon_deg: f64,               // 9-decimal precision
    pub alt_km: f64,                // 9-decimal precision
    pub velocity_kmps: f64,         // For Doppler
    pub plane_id: u8,               // Orbital plane
    pub epoch_ns: u64,              // SDT timestamp
}

/// Link state - hot path routing data
#[derive(Clone, Copy, Debug)]
pub struct LinkState {
    pub source_id: u32,             // Entity ID (not string)
    pub target_id: u32,             // Entity ID (not string)
    pub margin_db: f64,             // 9-decimal precision
    pub active: bool,
    pub link_type: u8,              // 0=ISL, 1=FSO
}

/// Route decision cache - HFT result
#[derive(Clone, Copy, Debug)]
pub struct RouteDecisionCache {
    pub source_id: u32,
    pub dest_id: u32,
    pub decision: u8,               // 0=Buy, 1=Spread, 2=Sell
    pub score: f64,                 // 9-decimal precision
    pub valid_until_ns: u64,        // TTL in SDT time
}
```

### Systems (Logic)

```rust
/// System execution order (hot path)
///
/// 1. PropagateEphemeris   - Update satellite positions
/// 2. UpdateLinkGeometry   - Recalculate slant ranges/angles
/// 3. SlewController       - Move antennas toward targets
/// 4. LinkMarginCalc       - Compute link budgets
/// 5. RouteAdjudicate      - Buy/Spread/Sell decisions
/// 6. EmitStateChanges     - Push to ring buffer (Atlas Bus)

#[system(for_each)]
fn propagate_ephemeris(sat: &mut SatEphem, #[resource] clock: &SdtClock) {
    // SGP4/SDP4 propagation - Zone A only
    // Output: updated lat/lon/alt/velocity
}

#[system(for_each)]
fn slew_controller(
    gs: &mut GsState,
    target: &SatEphem,
    #[resource] config: &SlewConfig,
) {
    // PID control loop - Zone A only
    // 9-decimal precision for crystal alignment
}

#[system]
fn route_adjudicate(
    world: &mut SubWorld,
    #[resource] thresholds: &RouteThresholds,
    #[resource] route_cache: &mut RouteCache,
) {
    // Hot path adjudication using pre-computed graph
    // Only Buy/Spread/Sell - no path finding here
}
```

### Ring Buffer Interface (Atlas Bus)

```rust
/// Hot path emits to ring buffer, cold path consumes
pub struct AtlasFrame {
    pub timestamp_ns: u64,          // SDT synchronized
    pub frame_type: FrameType,
    pub payload: [u8; 256],         // Fixed size for cache line
}

pub enum FrameType {
    GsStateUpdate,                  // Ground station changed
    SatEphemUpdate,                 // Satellite position changed
    LinkStateChange,                // Link up/down/degraded
    RouteDecision,                  // Buy/Spread/Sell emitted
    WeatherAlert,                   // Weather score dropped
}
```

## Cold Path (Zone C/D - Neo4j + GLAF)

**Latency Budget: 1ms - 60s**

### Responsibilities

1. **Path Finding** - k-shortest paths via Neo4j GDS or GLAF petgraph
2. **Monte Carlo** - Link failure simulation
3. **Weather Updates** - External API polling
4. **Graph Maintenance** - Add/remove nodes, update link properties
5. **Analytics** - Route history, performance metrics

### Cold Path Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Atlas Bus   │────>│  Cold Path   │────>│   Neo4j      │
│  (consume)   │     │  Processor   │     │   Graph      │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                     │
       │                    v                     │
       │             ┌──────────────┐             │
       │             │    GLAF      │<────────────┘
       │             │  petgraph    │
       │             └──────────────┘
       │                    │
       │                    v
       │             ┌──────────────┐
       └────────────>│  Route Cache │ (write back to hot path)
                     │  Refresh     │
                     └──────────────┘
```

### Cold Path Operations

```rust
/// Cold path processor - runs in separate thread/task
pub struct ColdPathProcessor {
    neo4j: Neo4jClient,
    glaf: ConstellationGraph,
    atlas_rx: AtlasReceiver,
}

impl ColdPathProcessor {
    /// Triggered by hot path when route cache miss
    async fn compute_routes(&mut self, source: &str, dest: &str, k: usize) -> Vec<ScoredRoute> {
        // 1. Try Neo4j GDS k-shortest paths
        // 2. Fallback to GLAF petgraph if Neo4j slow
        // 3. Score routes with full weather data
        // 4. Push results back to hot path cache
    }

    /// Periodic Monte Carlo simulation
    async fn run_monte_carlo(&mut self, iterations: usize) -> MonteCarloResult {
        // Zone D operation - can take seconds
        // Simulates link failures, weather events
        // Updates route reliability metrics
    }

    /// Process weather updates
    async fn update_weather(&mut self, station_id: &str, score: f64) {
        // 1. Update Neo4j link properties
        // 2. Invalidate affected route cache entries
        // 3. Emit WeatherAlert to Atlas Bus
    }
}
```

## Data Flow Diagram

```
                                 HOT PATH (Zone A)
                    ┌─────────────────────────────────────────┐
                    │                                         │
   SDT Clock ──────>│  Legion ECS World                      │
                    │  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
   Crystal Sync ───>│  │ GsState │  │SatEphem │  │LinkState│ │
                    │  └────┬────┘  └────┬────┘  └────┬────┘ │
                    │       │            │            │       │
                    │       v            v            v       │
                    │  ┌────────────────────────────────────┐ │
                    │  │         Systems Pipeline           │ │
                    │  │  Propagate→Slew→Margin→Adjudicate │ │
                    │  └────────────────┬───────────────────┘ │
                    │                   │                     │
                    └───────────────────┼─────────────────────┘
                                        │
                                        v
                              ┌──────────────────┐
                              │    Atlas Bus     │
                              │  (Ring Buffer)   │
                              └────────┬─────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    v                  v                  v
             ┌──────────┐      ┌──────────────┐    ┌──────────┐
             │   UI     │      │  Cold Path   │    │  Logs/   │
             │ (Dumb)   │      │  Processor   │    │ Metrics  │
             └──────────┘      └──────┬───────┘    └──────────┘
                                      │
                               ┌──────┴──────┐
                               v             v
                        ┌──────────┐  ┌──────────┐
                        │  Neo4j   │  │   GLAF   │
                        │  Graph   │  │ petgraph │
                        └──────────┘  └──────────┘
```

## Weight Constants (9-Decimal Precision)

All weights aligned for crystal resonator and SDT:

```rust
// Hot path scoring (inline, no allocation)
pub const W_MARGIN: f64 = 0.350000000;
pub const W_LATENCY: f64 = 0.250000000;
pub const W_HOPS: f64 = 0.200000000;
pub const W_WEATHER: f64 = 0.200000000;

// Thresholds
pub const THRESH_BUY: f64 = 0.800000000;
pub const THRESH_SPREAD: f64 = 0.500000000;
pub const MIN_MARGIN_DB: f64 = 3.000000000;
```

## Entity ID Mapping

Hot path uses u32 entity IDs, cold path uses String IDs:

```rust
/// Bidirectional mapping maintained by cold path
pub struct EntityRegistry {
    id_to_string: HashMap<u32, String>,   // Hot→Cold lookup
    string_to_id: HashMap<String, u32>,   // Cold→Hot lookup
    next_id: AtomicU32,
}
```

## Implementation Priority

1. **Phase 1**: Legion ECS world with GsState, SatEphem, LinkState
2. **Phase 2**: Atlas Bus ring buffer for hot→cold communication
3. **Phase 3**: Cold path processor with Neo4j integration
4. **Phase 4**: Route cache refresh loop (cold writes to hot)
5. **Phase 5**: Monte Carlo simulation (Zone D)
