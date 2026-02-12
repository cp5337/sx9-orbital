# SX9-Orbital Progress Report - Afternoon Session

**Date:** 2026-02-03
**Session:** Afternoon (~1:30 PM)
**Branch:** `feat/sx9-ui-design-system` (in sx9 repo)
**Working Directory:** `/Users/cp5337/Developer/sx9-orbital`

---

## Currently Running

```bash
# Check these are running:
docker ps  # orbital-nats on 4222/8222
pgrep -f orbital-gateway  # Gateway on 18700
lsof -i :18800  # UI on 18800
```

To restart if needed:
```bash
cd /Users/cp5337/Developer/sx9-orbital
docker compose -f docker/docker-compose.yml up -d nats
cargo run -p orbital-gateway &
cd ui/cesium-orbital && npm run dev &
```

---

## Completed This Session

### 1. Fixed Data Source ✅
**File:** `ui/cesium-orbital/src/components/SpaceWorldDemo.tsx` (line 26-27)

Changed from mock data to Supabase:
```typescript
// OLD (mock):
import { useMockGroundNodes as useGroundNodes, useMockSatellites as useSatellites } from '@/hooks/useMockData';

// NEW (Supabase):
import { useGroundNodes, useSatellites } from '@/hooks/useSupabaseData';
```

### 2. Reloaded Ground Stations ✅
Ran `npx tsx src/scripts/loadStations.ts` - loaded 175 clean stations into Supabase (no more ocean stations)

### 3. Fixed Ground Station Labels ✅
**File:** `SpaceWorldDemo.tsx` (line 385-405)

Changed from `GN-XXX` to use real `station_code` field:
```typescript
const displayLabel = (node as any).station_code || node.name.slice(0, 12);
```

Also added `scaleByDistance` so labels shrink when zoomed out.

---

## Known Issues (NOT YET FIXED)

### CRITICAL - DATA QUALITY

0. **Ground station coordinates are WRONG**
   - Internet exchanges placed in highway cloverleafs
   - Need to audit/fix coordinates in `data/selected_247_smart.json`
   - Source data may have bad lat/lon from PeeringDB or other sources
   - **Action:** Review each station's coordinates against Google Maps

0b. **UUIDs displaying in UI**
   - Stop showing UUIDs to user
   - Use station_code or name instead everywhere

### HIGH PRIORITY

1. **Satellites still "MEO-001" generic names**
   - Need to seed real satellite data into Supabase `satellites` table
   - Or update the satellite generation code

2. **Quick Bird Jump buttons don't actually jump**
   - They toggle expand, not fly-to camera
   - Need to add `viewer.flyTo()` on click

3. **Flat Map uses different data source**
   - User wants same satellites as globe
   - Check `FlatMapView.tsx`

4. **Camera icons/brackets stuck with UUID white card**
   - Double-click opens stuck card
   - Need to investigate click handlers

5. **Left Panel - many broken features**
   - Dashboard, Flat Map, Network Graph, Data Tables, Satellites, Ground Stations, FSO Links, Coverage pages
   - Need to audit each one

### MEDIUM PRIORITY

6. **Right Panel drawer needs redesign**
   - User wants: glyph buttons for quick jump, expanded drawer with beam controls
   - Stats grid (2pt like VBA properties window)
   - Double-click to pop out (max 4 windows, lower-left, draggable, close on X)

7. **WebSocket backend not running (port 18400)**
   - UI falls back to simulated data
   - Gateway is on 18700, not serving WebSocket stream

---

## Resume Commands

```bash
# 1. Navigate
cd /Users/cp5337/Developer/sx9-orbital

# 2. Check services
docker ps
curl http://localhost:18700/health
curl http://localhost:18800  # UI

# 3. If services down:
docker compose -f docker/docker-compose.yml up -d nats
cargo run -p orbital-gateway &
cd ui/cesium-orbital && npm run dev &

# 4. Open browser
open http://localhost:18800

# 5. Use Playwright to screenshot
# In Claude: mcp__plugin_playwright_playwright__browser_navigate to http://localhost:18800
# Then: mcp__plugin_playwright_playwright__browser_take_screenshot
```

---

## Key Files to Edit

| Issue | File |
|-------|------|
| Satellite names | `ui/cesium-orbital/src/components/SpaceWorldDemo.tsx` |
| Quick Bird Jump | `ui/cesium-orbital/src/components/RightPanel.tsx` |
| Flat Map data | `ui/cesium-orbital/src/components/FlatMapView.tsx` |
| Left panel pages | `ui/cesium-orbital/src/components/*.tsx` |
| Supabase data | `ui/cesium-orbital/src/hooks/useSupabaseData.ts` |

---

## Architecture Reminder

```
UI (React/Cesium) :18800
    ↓
Gateway (Rust/Axum) :18700
    ├── /api/v1/weather → Open-Meteo
    ├── /api/v1/stations
    └── /api/v1/memory → sx9-tcache
    ↓
NATS JetStream :4222
    ↓
Supabase (PostgreSQL) - cloud
```

---

## Quick Context for Claude

Tell Claude:
> "Resume sx9-orbital work. Read `/Users/cp5337/Developer/sx9-orbital/PROGRESS-2026-02-03-AFTERNOON.md` for context. Services should be running on 18700 (gateway) and 18800 (UI). Use Playwright to screenshot the UI. Main issues: satellite names are generic MEO-XXX, Quick Bird Jump doesn't fly-to, Flat Map needs same data as Globe, camera bracket cards stuck."

---

*Last updated: 2026-02-03 ~13:45 EST*
