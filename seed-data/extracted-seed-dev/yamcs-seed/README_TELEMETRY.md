# YAMCS Telemetry Simulator - Quick Reference

## Overview

Python telemetry simulator that generates realistic ground station telemetry data for the CTAS Optical Ground Station YAMCS instance.

## Quick Start

```bash
# Basic usage (1 Hz telemetry, runs until Ctrl+C)
python3 telemetry_simulator.py

# Start in TRACKING mode with telemetry
python3 telemetry_simulator.py --tracking

# Run for 60 seconds at 2 Hz
python3 telemetry_simulator.py --rate 2.0 --duration 60

# Connect to remote YAMCS
python3 telemetry_simulator.py --host 192.168.1.100 --port 10015
```

## Command Line Options

- `--host` - YAMCS hostname (default: 127.0.0.1)
- `--port` - YAMCS TCP telemetry port (default: 10015)
- `--rate` - Telemetry update rate in Hz (default: 1.0)
- `--duration` - Run for N seconds (default: infinite)
- `--tracking` - Start in TRACKING mode (default: IDLE)

## Telemetry Parameters

### Antenna/Mount (5 parameters)

- `antenna.azimuth` - Azimuth angle (0-360°)
- `antenna.elevation` - Elevation angle (0-90°)
- `antenna.azimuth_rate` - Azimuth rate (deg/s)
- `antenna.elevation_rate` - Elevation rate (deg/s)
- `antenna.tracking_mode` - IDLE(0), SLEWING(1), TRACKING(2), STOWED(3)

### Optical Link (5 parameters)

- `link.ber` - Bit error rate
- `link.signal_strength` - Signal strength (dBm)
- `link.lock_status` - Lock status (boolean)
- `link.data_rate` - Data rate (Mbps)
- `link.packet_count` - Total packets received

### Fine Tracking (4 parameters)

- `tracking.centroid_x` - Centroid X position (pixels)
- `tracking.centroid_y` - Centroid Y position (pixels)
- `tracking.fwhm` - Full width half maximum (arcseconds)
- `tracking.guide_error` - Guide error (arcseconds)

### System Health (3 parameters)

- `system.temperature` - System temperature (°C)
- `system.uptime` - System uptime (seconds)
- `system.status` - NOMINAL(0), DEGRADED(1), FAULT(2)

## Simulation Behavior

**IDLE Mode**: Antenna stationary, no link lock
**SLEWING Mode**: Antenna moving at constant rate
**TRACKING Mode**: Antenna following sinusoidal path, link locked, telemetry active
**STOWED Mode**: Antenna stationary at stow position

## Viewing Telemetry in YAMCS

1. Start YAMCS: `docker compose -f docker-compose.dev.yml up -d`
2. Start simulator: `python3 telemetry_simulator.py --tracking`
3. Open browser: http://localhost:8090
4. Navigate to `ctas_optical` instance
5. View parameters in real-time display

## Troubleshooting

**Connection Refused**:

- Ensure YAMCS is running
- Check TCP data link is configured in `ctas_optical.yaml`
- Verify port 10015 is correct

**No Telemetry Displayed**:

- Check YAMCS logs: `docker compose logs yamcs`
- Verify XTCE file loaded without errors
- Confirm instance is started in YAMCS web UI
