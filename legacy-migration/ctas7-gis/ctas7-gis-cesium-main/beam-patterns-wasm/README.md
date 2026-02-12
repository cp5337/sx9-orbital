# Beam Patterns WASM Module

High-performance laser beam pattern simulation engine compiled to WebAssembly for MEO satellite optical communication systems.

## Architecture

### Code Organization (Strict Line Limits)

All modules follow strict line count limits for maintainability:

- **Simple modules** (<200 lines): Core utilities, components
- **Module tier** (<350 lines): UI components, complex logic
- **Waiver required** (>500 lines): None in this codebase

### Module Structure

```
beam-patterns-wasm/
├── src/
│   ├── lib.rs                    (74 lines)  - WASM entry point
│   ├── ecs/
│   │   ├── components.rs         (142 lines) - ECS components
│   │   └── world.rs              (175 lines) - ECS world manager
│   ├── beam_patterns/
│   │   └── gaussian.rs           (137 lines) - Gaussian beam generator
│   └── utils/
│       └── console.rs            (16 lines)  - Console logging macros
```

## Features

### Ground Station Management

- **Declination Angle Presets**: 3 standard configurations
  - Basic: 5 angles (10°, 20°, 45°, 70°, 90°)
  - Operational: 8 angles (5°, 10°, 15°, 30°, 45°, 60°, 75°, 90°)
  - Precision: 15 angles (5° to 90° in fine increments)
- **Custom Angles**: 3-20 configurable angles per station
- **Per-Station Configuration**: 259 ground stations supported

### Beam Pattern Generation

- **Gaussian Beams**: Fundamental TEM00 mode
- **Atmospheric Modeling**: Cn2 turbulence effects
- **Link Budget Calculation**: Elevation-dependent performance
- **Real-time Rendering**: 800×800 resolution patterns

### ECS Architecture

Uses lightweight `hecs` ECS framework for:
- Component-based ground station modeling
- System-based computation pipelines
- Efficient state management

## Building

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-pack
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Add WASM target
rustup target add wasm32-unknown-unknown
```

### Build Commands

```bash
# Development build
npm run build:wasm:dev

# Production build (optimized)
npm run build:wasm

# Full project build
npm run build
```

## Usage

### TypeScript Integration

```typescript
import { beamEngine } from '@/wasm/beamPatternEngine';

// Initialize WASM module
await beamEngine.initialize();

// Add ground station
await beamEngine.addGroundStation({
  id: 'GN-001',
  latitude: 37.7749,
  longitude: -122.4194,
  altitude: 100,
  preset: 'operational'
});

// Generate beam pattern
const pattern = await beamEngine.generateBeamPattern(
  'gaussian',
  1550,  // wavelength (nm)
  10,    // waist radius (mm)
  1.0,   // power (W)
  1e-15, // Cn2 turbulence
  800,   // width
  800    // height
);

// Calculate link budgets
const budgets = await beamEngine.calculateLinkBudgets('GN-001');
```

### React Components

```typescript
import { GroundStationConfig } from '@/components/GroundStationConfig';
import { BeamPatternViewer } from '@/components/BeamPatternViewer';

function App() {
  return (
    <>
      <GroundStationConfig />
      <BeamPatternViewer />
    </>
  );
}
```

## Performance

- **Pattern Generation**: <100ms for 800×800 Gaussian beam
- **ECS Updates**: <16ms for 259 ground stations
- **Memory Usage**: <50MB for full ECS world with patterns
- **WASM Binary**: <500KB compressed

## Database Schema

### Tables

- `ground_station_declination_config`: Per-station angle configurations
- `declination_angle_presets`: Standard preset library
- `station_link_performance`: Historical performance tracking

### Supabase Integration

```typescript
// Load station configuration
const { data } = await supabase
  .from('ground_station_declination_config')
  .select('*')
  .eq('ground_node_id', stationId)
  .maybeSingle();

// Save configuration
await supabase
  .from('ground_station_declination_config')
  .upsert({
    ground_node_id: stationId,
    preset_type: 'operational',
    angles_deg: [5, 10, 15, 30, 45, 60, 75, 90],
    is_custom: false
  });
```

## Testing

```bash
# Run Rust tests
cd beam-patterns-wasm
cargo test

# Run TypeScript tests
npm test
```

## License

MIT
