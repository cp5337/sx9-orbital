# SX9 Orbital - Laser Light Communications Satellite Constellation

Space-based optical communications platform for defense and government.

## Constellation: HALO (Laser Light Communications)

| Parameter | Value |
|-----------|-------|
| Birds | 12 (8 primary + 4 spare) |
| Orbit | MEO 10,500 km |
| Configuration | Walker Delta 3/4 (3 planes, 4 sats each) |
| Inter-satellite Links | FSO laser crosslinks |
| Ground Links | FSO to 257 stations |
| Throughput | 4.8 Tbps system capacity |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           sx9-orbital                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  SPACE SEGMENT                      GROUND SEGMENT                      │
│  ┌─────────────────────────┐       ┌─────────────────────────────────┐ │
│  │  12 MEO Satellites      │       │  257 Airbus FSO Ground Stations │ │
│  │  Walker Delta 3/4       │◄─────►│  Global Distribution            │ │
│  │  10,500 km altitude     │  FSO  │  Edge Compute Nodes             │ │
│  │  Optical Crosslinks     │       │  Weather Monitoring             │ │
│  └─────────────────────────┘       └─────────────────────────────────┘ │
│                                                                         │
│  CONTROL PLANE                      DATA PLANE                          │
│  ┌─────────────────────────┐       ┌─────────────────────────────────┐ │
│  │  Mission Control        │       │  ANN/CNN Routing Engine         │ │
│  │  Collision Avoidance    │       │  5-Year Weather Backtest        │ │
│  │  Health Monitoring      │       │  HFT-Style Optimization         │ │
│  │  CTAS Threat Integration│       │  Beam Quality Scoring           │ │
│  └─────────────────────────┘       └─────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Start gateway API
cargo run -p orbital-gateway

# API available at http://localhost:21600
```

## Crates

- **orbital-mechanics**: SGP4, coordinate transforms, Walker Delta
- **beam-routing**: ANN/CNN weather-aware routing
- **ground-stations**: 257 Airbus FSO station management
- **collision-avoidance**: UCLA integration

## Compliance

| Standard | Status |
|----------|--------|
| ITAR | Required |
| EAR | Required |
| CMMC Level 2 | Required |
| cATO | Required |
| FIPS 140-3 | Required |

## References

- RFC-9000A: DoD DevSecOps Alignment
- Infrastructure Sheet: `forge/SX9-ORBITAL-Infrastructure-Sheet.md`
