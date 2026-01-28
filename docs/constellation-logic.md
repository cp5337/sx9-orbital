## Constellation and Logic Summary

This document captures the constellation configuration and the current logic decisions
implemented in the UI and gateway, along with the planned state machine and routing
approach. The intent is to keep the frontend dumb while the gateway/ground side
drives link state and routing decisions.

### Constellation baseline

- Demo constellation: GPS-style MEO, 12 satellites.
- Plane layout: 3 planes × 4 satellites per plane.
- Parameters (demo defaults):
  - Altitude: ~20,200 km
  - Inclination: 55°
  - RAAN spacing: 120°
  - Mean anomaly spacing: 90°
- A Supabase migration seeds this configuration and inserts orbital elements:
  - `ui/cesium-orbital/supabase/migrations/20260127194500_add_gps_demo_constellation.sql`
- This baseline is flexible and can be adjusted (planes, inclination, altitude)
  without changing the frontend.

### Ground station data sources

- Primary ground nodes dataset:
  - `data/all_ground_nodes_backup.json`
- Submarine cable landing points (relevant but not necessarily GS):
  - `data/cable-infrastructure/cable_landing_points_geo.json`
  - `data/cable-infrastructure/cable_landing_complete.json`
- Ground station registry in backend:
  - `crates/ground-stations` (FSO network, 257 stations)
  - Gateway now serves real registry data instead of hard-coded samples.

### State machine (link choreography)

We will model links as a deterministic state machine:

1. Acquire: station slews to target (sat or ground).
2. Authenticate: auth stream starts.
3. Handshake: optical link established.
4. Maintain: tracking + telemetry + QoS monitoring.
5. Degrade: QoS falls (geometry, weather, pointing).
6. Terminate: link ends.
7. Reset: station closes/slews to neutral or next target.

This is implemented ground-side (WASM/gateway) and emitted to the UI as link_state events.

### Beam edge and QoS modeling

- Use a signed delta around closest-approach:
  - delta < 0 inbound, delta = 0 focal, delta > 0 outbound.
- Define beam edges as first-class states:
  - ragged_edge: low QoS, suitable for short packets/handshake.
  - sla_sweetspot: default target for SLA delivery.
  - sla_reduction: below sweetspot, still usable under degradation.
  - no_qos: link not viable.
- QoS is computed from elevation/declination + range + weather, then mapped to phases.

### Visibility and beam correctness

Frontend visual logic:
- FSO links are rendered with dynamic positions (CallbackProperty).
- Sat-ground links only render when satellite is above the station’s horizon.
- Sat-sat links are hidden when the line-of-sight intersects Earth.
- Radiation belts no longer occlude beams.

### Routing logic (ground-driven)

The frontend is intentionally dumb. The gateway/ground side will:
- Compute QoS, SLA satisfaction, and reroute decisions.
- Emit `link_state` events over WebSocket to drive UI rendering.
- Use a sliding window and QoS targets for "cheapest within SLA".
- Keep routing separate from Earth rotation or rendering logic.

### WebSocket link state payload

Example:

{
  "type": "link_state",
  "data": {
    "link_id": "sat-1_gs-2",
    "link_type": "sat-ground",
    "source_id": "sat-1",
    "target_id": "gn-2",
    "phase": "maintain",
    "margin_db": 6.5,
    "active": true
  }
}

### Next steps

- Add a gateway stream that uses ground-station WASM to emit link_state.
- Define a formal QoS scoring function and SLA thresholds.
- Incorporate cable landing adjacency into station selection scoring.
*** End Patch"}"}}}`}Expected dict`
