# CTAS7 Legacy Migration to sx9-orbital

**Date:** 2026-02-02
**Source:** Desktop ABE-DropZone archives (Oct-Nov 2025)
**Status:** Extracted, pending integration

---

## Extracted Content

### 1. ctas7-gis-cesium-main (Oct 17, 2025)

**Ground Station & Orbital:**
| File | Size | Purpose |
|------|------|---------|
| `src/components/GroundStationConfig.tsx` | 12KB | Ground station configuration UI |
| `src/services/orbitalAnimation.ts` | 10KB | Orbital animation service |
| `src/utils/orbitalMechanics.ts` | 10KB | Orbital mechanics calculations |
| `src/utils/orbitalZones.ts` | 7KB | Orbital zone definitions |

**Weather & Atmospheric:**
| File | Size | Purpose |
|------|------|---------|
| `src/services/weatherService.ts` | 3KB | OpenWeatherMap API, weather scoring |
| `src/services/atmosphericService.ts` | 4KB | Atmospheric conditions for FSO |

**Beam Patterns (Rust WASM):**
| File | Size | Purpose |
|------|------|---------|
| `beam-patterns-wasm/src/beam_patterns/bessel.rs` | 4KB | Bessel beam pattern math |
| `beam-patterns-wasm/src/beam_patterns/gaussian.rs` | 4KB | Gaussian beam pattern math |
| `beam-patterns-wasm/src/ecs/components.rs` | 4KB | ECS components for beams |
| `beam-patterns-wasm/src/ecs/world.rs` | 5KB | ECS world management |

**Services:**
| File | Size | Purpose |
|------|------|---------|
| `src/services/beamPatternService.ts` | 5KB | Beam pattern service |
| `src/services/beamRoutingEngine.ts` | 7KB | Beam routing engine |
| `src/services/cesiumWorldManager.ts` | 12KB | Cesium 3D world management |
| `src/services/telemetryBridge.ts` | 2KB | Telemetry bridge |
| `src/services/websocketService.ts` | 3KB | WebSocket service |

**Database Migrations:**
| File | Purpose |
|------|---------|
| `20251013233828_create_spaceworld_schema.sql` | Space world schema |
| `20251014015645_add_beam_orbital_radiation_schema.sql` | Beam/orbital/radiation |
| `20251014060000_add_declination_config.sql` | Declination config |
| `20251014062804_add_satellite_inclination.sql` | Satellite inclination |

**Docker:**
- `Dockerfile` - Production
- `Dockerfile.dev` - Development
- `docker-compose.yml` - Container orchestration

---

### 2. GLAF Docker Stack (Nov 2025)

From `ctas7-glaf-three.txt`:

```yaml
services:
  glaf:
    ports: 18018 (UI), 18019 (API)
    env:
      - SURREALDB_URL=ws://surrealdb:8000
      - SUPABASE_URL=http://supabase:5432
      - SLED_PATH=/data/sled
      - SLEDIS_URL=redis://sledis:6379

  surrealdb:
    image: surrealdb/surrealdb:latest
    command: start --user root --pass root
    ports: 8000

  supabase:
    image: supabase/postgres:latest
    ports: 5432

  sledis:
    image: redis:7-alpine
```

---

## LOST Content

**ctas7-command-center repo (DELETED):**
- `mcp/nodes/surreal_telemetry_live.rs` - SurrealDB telemetry Rust code
- Collision detection code (referenced but not found)
- Space-Track/Celestrak API integration (referenced but not found)

---

## Integration Tasks

1. [ ] Review beam-patterns-wasm Rust code for sx9-orbital integration
2. [ ] Integrate weatherService.ts with current orbital ground station selection
3. [ ] Apply Supabase migrations to orbital schema
4. [ ] Adapt GLAF docker stack for current infrastructure
5. [ ] Port GroundStationConfig.tsx to current UI framework
6. [ ] Implement collision detection (was in lost ctas7-command-center)

---

## Best Athlete Evaluation

| OLD (Oct-Nov 2025) | CURRENT sx9-orbital | Decision |
|--------------------|---------------------|----------|
| beam-patterns-wasm (Rust) | N/A | **ADOPT** - Valuable Rust WASM |
| weatherService.ts | N/A | **ADOPT** - Weather API needed |
| orbitalMechanics.ts | Existing orbital math | **COMPARE** |
| GroundStationConfig.tsx | 247 stations JSON | **MERGE** |
| SurrealDB docker | N/A | **ADOPT** - Database stack |
| Collision detection | N/A | **REBUILD** - Code lost |

---

### 3. ctas7-graph-viewer (Nov 10, 2025)

| File | Size | Purpose |
|------|------|---------|
| `lib/graph-data.ts` | 9KB | Graph data structures |
| `components/graph-canvas.tsx` | 11KB | Graph visualization canvas |
| `components/node-details-panel.tsx` | 10KB | Node details panel |
| `app/page.tsx` | 10KB | Main page with graph |

---

### 4. ctas7-streaming-service (Nov 10, 2025)

| File | Size | Purpose |
|------|------|---------|
| `src/index.ts` | 8KB | Main entry point |
| `src/streaming.ts` | 4KB | Streaming logic |
| `src/data-aggregator.ts` | 4KB | Data aggregation |
| `src/cache.ts` | 3KB | Caching layer |
| `src/http-client.ts` | 2KB | HTTP client |
| `src/types.ts` | 2KB | Type definitions |
| `src/metrics.ts` | 1KB | Metrics collection |
| `src/normalizers.ts` | 1KB | Data normalizers |
| `src/config.ts` | 1KB | Configuration |
| `src/logger.ts` | 0.3KB | Logger |

---

### 5. ctas7-hsrt-conversation.txt (Nov 2025)

AI conversation dump containing embedded code snippets:
- Monte Carlo simulation (Python)
- HMM Persona architecture (Rust)
- Latent Matroid theory (Rust)
- Docker compose YAML
- Research paper LaTeX
- HSRT (High Speed Routing) specs

---

## Best Athlete Final Results

| Component | OLD (Nov 2025) | NEW (Jan 2026) | Winner |
|-----------|----------------|----------------|--------|
| Trivariate Hash | Python CTAS-HASH | Rust sx9-foundation-core | **NEW** |
| ExploitDB API | ctas-v7.3.1 UI | sx9-ops-main + 350MB data | **NEW** |
| Shodan API | ctas-v7.3.1 UI | sx9-ops-main | **SAME** |
| GeoIP | ctas-v7.3.1 | sx9-ops-main + GeoLite2 | **NEW** |
| Beam Patterns WASM | ctas7-gis-cesium | sx9-orbital/ui (migrated) | **DONE** |
| Ground Stations | React UI only | Rust crate (257 FSO) | **NEW** |
| Collision Avoidance | LOST | Rust crate (UCLA CTAS) | **NEW** |
| Graph Viewer | ctas7-graph-viewer | ? | **EVALUATE** |
| Streaming Service | ctas7-streaming-service | ? | **EVALUATE** |
| SurrealDB Docker | ctas7-glaf-three.txt | Not in orbital | **ADOPT** |
| HMM/Matroid Code | ctas7-hsrt-conversation | sx9-glaf-algo | **COMPARE** |

---

**Next Steps:**
1. Port SurrealDB docker stack to sx9-orbital
2. Evaluate graph-viewer for Cesium integration
3. Evaluate streaming-service for telemetry pipeline
4. Extract HMM/Matroid code from conversation file if needed
