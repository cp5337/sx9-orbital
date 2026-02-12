//! Simulation State Machine
//!
//! Lock-free state storage with ground-station-wasm controllers.
//! Same logic compiles native (here) or WASM (Cloudflare edge).
//!
//! Zone A/B compliant: <50μs reads, <100μs writes via ring buffer.
//! All values use Nano9 fixed-point (9 decimal places) for deterministic routing.

use ground_station_wasm::{
    DoorController, DoorState, TrackingLoop,
    GroundStationConfig, SatellitePosition,
    tracking::TrackingState,
};
use sx9_atlas_bus::Ring;
use sx9_foundation_primitives::parking_lot::RwLock;
use sx9_foundation_primitives::{Nano9, NANO};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicI64, AtomicU64, AtomicU8, Ordering};
use std::sync::Arc;

/// Max stations (u8 index)
pub const MAX_STATIONS: usize = 256;

/// Event ring capacity
pub const EVENT_RING_SIZE: usize = 1024;

// ============================================================================
// State Events (via atlas-bus Ring)
// ============================================================================

#[derive(Debug, Clone, Copy)]
#[repr(C)]
pub enum StateEvent {
    /// Weather update for a station (Nano9 raw value)
    Weather { station: u8, score: i64 },

    /// Door command
    DoorOpen { station: u8 },
    DoorClose { station: u8 },

    /// Tracking command
    TrackAcquire { station: u8, satellite: u8 },
    TrackRelease { station: u8 },

    /// Simulation tick (all stations)
    Tick { delta_ms: u16 },
}

// ============================================================================
// Atomic State Arrays (struct-of-arrays, cache-friendly)
// ============================================================================

/// Raw atomic state - fast reads, written by sim tick only
/// All numeric values are Nano9 (i64 scaled by 10^9)
pub struct AtomicStationState {
    pub door_state: [AtomicU8; MAX_STATIONS],
    pub door_position: [AtomicI64; MAX_STATIONS],   // 0 to NANO (0.0-1.0)
    pub tracking_state: [AtomicU8; MAX_STATIONS],
    pub azimuth: [AtomicI64; MAX_STATIONS],         // Nano9 radians
    pub elevation: [AtomicI64; MAX_STATIONS],       // Nano9 radians
    pub weather: [AtomicI64; MAX_STATIONS],         // Nano9 (0.0-1.0)
    pub target_sat: [AtomicU8; MAX_STATIONS],       // 0xFF = none
    pub link_margin: [AtomicI64; MAX_STATIONS],     // Nano9 dB
}

impl AtomicStationState {
    pub fn new() -> Self {
        const ZERO_U8: AtomicU8 = AtomicU8::new(0);
        const ZERO_I64: AtomicI64 = AtomicI64::new(0);
        const NO_SAT: AtomicU8 = AtomicU8::new(0xFF);
        const ONE_NANO: AtomicI64 = AtomicI64::new(NANO);          // 1.0
        const HALF_PI: AtomicI64 = AtomicI64::new(1_570_796_326);  // π/2 (zenith)

        Self {
            door_state: [ZERO_U8; MAX_STATIONS],
            door_position: [ZERO_I64; MAX_STATIONS],
            tracking_state: [ZERO_U8; MAX_STATIONS],
            azimuth: [ZERO_I64; MAX_STATIONS],
            elevation: [HALF_PI; MAX_STATIONS],  // Start at zenith
            weather: [ONE_NANO; MAX_STATIONS],   // Perfect weather default
            target_sat: [NO_SAT; MAX_STATIONS],
            link_margin: [ZERO_I64; MAX_STATIONS],
        }
    }

    // Fast readers (Zone A - <50ns)
    #[inline]
    pub fn get_door_state(&self, idx: u8) -> DoorState {
        match self.door_state[idx as usize].load(Ordering::Relaxed) {
            0 => DoorState::Closed,
            1 => DoorState::Opening,
            2 => DoorState::Open,
            3 => DoorState::Closing,
            _ => DoorState::Fault,
        }
    }

    #[inline]
    pub fn get_door_position(&self, idx: u8) -> Nano9 {
        Nano9::raw(self.door_position[idx as usize].load(Ordering::Relaxed))
    }

    #[inline]
    pub fn get_tracking_state(&self, idx: u8) -> TrackingState {
        match self.tracking_state[idx as usize].load(Ordering::Relaxed) {
            0 => TrackingState::Idle,
            1 => TrackingState::Acquiring,
            2 => TrackingState::Tracking,
            _ => TrackingState::LostSignal,
        }
    }

    #[inline]
    pub fn get_weather(&self, idx: u8) -> Nano9 {
        Nano9::raw(self.weather[idx as usize].load(Ordering::Relaxed))
    }

    #[inline]
    pub fn get_pointing(&self, idx: u8) -> (Nano9, Nano9) {
        let az = Nano9::raw(self.azimuth[idx as usize].load(Ordering::Relaxed));
        let el = Nano9::raw(self.elevation[idx as usize].load(Ordering::Relaxed));
        (az, el)
    }

    #[inline]
    pub fn get_target(&self, idx: u8) -> Option<u8> {
        let v = self.target_sat[idx as usize].load(Ordering::Relaxed);
        if v == 0xFF { None } else { Some(v) }
    }

    #[inline]
    pub fn get_link_margin(&self, idx: u8) -> Nano9 {
        Nano9::raw(self.link_margin[idx as usize].load(Ordering::Relaxed))
    }

    /// Weather threshold for link readiness (0.3 = 300_000_000)
    const WEATHER_THRESHOLD: i64 = 300_000_000;

    #[inline]
    pub fn is_link_ready(&self, idx: u8) -> bool {
        self.get_door_state(idx) == DoorState::Open
            && self.get_tracking_state(idx) == TrackingState::Tracking
            && self.weather[idx as usize].load(Ordering::Relaxed) > Self::WEATHER_THRESHOLD
    }

    // Writers (called from sim tick only)
    #[inline]
    pub fn set_door_state(&self, idx: u8, state: DoorState) {
        let v = match state {
            DoorState::Closed => 0,
            DoorState::Opening => 1,
            DoorState::Open => 2,
            DoorState::Closing => 3,
            DoorState::Fault => 4,
        };
        self.door_state[idx as usize].store(v, Ordering::Release);
    }

    #[inline]
    pub fn set_door_position(&self, idx: u8, pos: Nano9) {
        self.door_position[idx as usize].store(pos.raw_value(), Ordering::Release);
    }

    #[inline]
    pub fn set_tracking_state(&self, idx: u8, state: TrackingState) {
        let v = match state {
            TrackingState::Idle => 0,
            TrackingState::Acquiring => 1,
            TrackingState::Tracking => 2,
            TrackingState::LostSignal => 3,
        };
        self.tracking_state[idx as usize].store(v, Ordering::Release);
    }

    #[inline]
    pub fn set_weather(&self, idx: u8, score: Nano9) {
        self.weather[idx as usize].store(score.raw_value(), Ordering::Release);
    }

    #[inline]
    pub fn set_pointing(&self, idx: u8, az: Nano9, el: Nano9) {
        self.azimuth[idx as usize].store(az.raw_value(), Ordering::Release);
        self.elevation[idx as usize].store(el.raw_value(), Ordering::Release);
    }

    #[inline]
    pub fn set_target(&self, idx: u8, sat: Option<u8>) {
        self.target_sat[idx as usize].store(sat.unwrap_or(0xFF), Ordering::Release);
    }

    #[inline]
    pub fn set_link_margin(&self, idx: u8, margin: Nano9) {
        self.link_margin[idx as usize].store(margin.raw_value(), Ordering::Release);
    }
}

impl Default for AtomicStationState {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Station Controller (wraps WASM state machines)
// ============================================================================

/// Per-station controller using ground-station-wasm logic
pub struct StationController {
    pub config: GroundStationConfig,
    pub door: DoorController,
    pub door_state: DoorState,
    pub tracking: TrackingLoop,
}

impl StationController {
    pub fn new(config: GroundStationConfig) -> Self {
        Self {
            door: DoorController::new(),
            door_state: DoorState::Closed,
            tracking: TrackingLoop::new(config.max_slew_rate_deg_s),
            config,
        }
    }

    /// Tick the state machine
    pub fn tick(&mut self, delta_ns: i64, weather_score: Nano9, sat_pos: Option<SatellitePosition>) {
        let delta_sec = delta_ns as f64 / NANO as f64;
        let weather_f64 = weather_score.to_f64();

        // Update door
        self.door.tick(&mut self.door_state, delta_sec);

        // Update tracking
        self.tracking.tick(&self.config, sat_pos, weather_f64, delta_sec);
    }
}

// ============================================================================
// Simulation Core
// ============================================================================

/// Main simulation state manager
pub struct SimulationCore {
    /// Event ring (lock-free SPSC from atlas-bus)
    pub events: Ring<StateEvent, EVENT_RING_SIZE>,

    /// Atomic state arrays (fast reads)
    pub state: Arc<AtomicStationState>,

    /// Station controllers (behind RwLock, only accessed in tick)
    controllers: RwLock<Vec<StationController>>,

    /// Station ID mapping (public for route handlers)
    pub station_ids: RwLock<Vec<String>>,

    /// Simulation time (nanoseconds for precision)
    sim_time_ns: AtomicI64,
}

impl SimulationCore {
    pub fn new() -> Self {
        Self {
            events: Ring::new(),
            state: Arc::new(AtomicStationState::new()),
            controllers: RwLock::new(Vec::new()),
            station_ids: RwLock::new(Vec::new()),
            sim_time_ns: AtomicI64::new(0),
        }
    }

    /// Register a station, returns index
    pub fn register_station(&self, id: String, config: GroundStationConfig) -> u8 {
        let mut ids = self.station_ids.write();
        let mut controllers = self.controllers.write();

        let idx = ids.len() as u8;
        ids.push(id);
        controllers.push(StationController::new(config));

        idx
    }

    /// Get station index by ID
    pub fn station_index(&self, id: &str) -> Option<u8> {
        self.station_ids.read().iter().position(|s| s == id).map(|i| i as u8)
    }

    /// Inject event (lock-free, from any thread)
    #[inline]
    pub fn inject(&self, event: StateEvent) -> bool {
        self.events.push(event)
    }

    /// Run simulation tick - drains events, updates controllers, syncs to atomic state
    pub fn tick(&self, delta_ms: u32) {
        // Drain events
        while let Some(event) = self.events.pop() {
            self.apply_event(event);
        }

        // Convert ms to nanoseconds (Nano9 scale)
        let delta_ns = delta_ms as i64 * 1_000_000;
        let mut controllers = self.controllers.write();

        for (idx, ctrl) in controllers.iter_mut().enumerate() {
            let weather = self.state.get_weather(idx as u8);

            // Get satellite position if tracking
            let sat_pos = self.state.get_target(idx as u8).map(|sat_idx| {
                // TODO: Get actual satellite position from constellation
                SatellitePosition {
                    norad_id: 99000 + sat_idx as u32,
                    latitude_deg: 0.0,
                    longitude_deg: 0.0,
                    altitude_km: 10500.0,
                    epoch_unix: chrono::Utc::now().timestamp(),
                }
            });

            ctrl.tick(delta_ns, weather, sat_pos);

            // Sync to atomic state (convert f64 from WASM to Nano9)
            self.state.set_door_state(idx as u8, ctrl.door_state);
            self.state.set_door_position(idx as u8, Nano9::from_f64(ctrl.door.position()));
            self.state.set_tracking_state(idx as u8, ctrl.tracking.state);

            let pointing = ctrl.tracking.pointing();
            self.state.set_pointing(
                idx as u8,
                Nano9::from_f64(pointing.azimuth_deg * std::f64::consts::PI / 180.0),
                Nano9::from_f64(pointing.elevation_deg * std::f64::consts::PI / 180.0),
            );
            self.state.set_link_margin(idx as u8, Nano9::from_f64(ctrl.tracking.link_margin()));
        }

        // Update sim time
        self.sim_time_ns.fetch_add(delta_ns, Ordering::Relaxed);
    }

    fn apply_event(&self, event: StateEvent) {
        match event {
            StateEvent::Weather { station, score } => {
                self.state.set_weather(station, Nano9::raw(score));
            }
            StateEvent::DoorOpen { station } => {
                let mut controllers = self.controllers.write();
                if let Some(ctrl) = controllers.get_mut(station as usize) {
                    ctrl.door.open(&mut ctrl.door_state);
                }
            }
            StateEvent::DoorClose { station } => {
                let mut controllers = self.controllers.write();
                if let Some(ctrl) = controllers.get_mut(station as usize) {
                    ctrl.door.close(&mut ctrl.door_state);
                }
            }
            StateEvent::TrackAcquire { station, satellite } => {
                self.state.set_target(station, Some(satellite));
            }
            StateEvent::TrackRelease { station } => {
                self.state.set_target(station, None);
                let mut controllers = self.controllers.write();
                if let Some(ctrl) = controllers.get_mut(station as usize) {
                    ctrl.tracking.release();
                }
            }
            StateEvent::Tick { delta_ms } => {
                self.tick(delta_ms as u32);
            }
        }
    }

    /// Get simulation time in milliseconds
    pub fn sim_time_ms(&self) -> u32 {
        (self.sim_time_ns.load(Ordering::Relaxed) / 1_000_000) as u32
    }

    /// Get simulation time as Nano9 seconds
    pub fn sim_time(&self) -> Nano9 {
        Nano9::raw(self.sim_time_ns.load(Ordering::Relaxed))
    }

    /// Get snapshot for API response
    pub fn snapshot(&self, station: u8) -> StationSnapshot {
        let (az, el) = self.state.get_pointing(station);
        StationSnapshot {
            door_state: format!("{:?}", self.state.get_door_state(station)),
            door_position: self.state.get_door_position(station).raw_value(),
            tracking_state: format!("{:?}", self.state.get_tracking_state(station)),
            azimuth: az.raw_value(),
            elevation: el.raw_value(),
            weather_score: self.state.get_weather(station).raw_value(),
            link_margin: self.state.get_link_margin(station).raw_value(),
            target_satellite: self.state.get_target(station),
            link_ready: self.state.is_link_ready(station),
        }
    }
}

impl Default for SimulationCore {
    fn default() -> Self {
        Self::new()
    }
}

/// Station snapshot for API responses (all values are raw Nano9 i64)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StationSnapshot {
    pub door_state: String,
    pub door_position: i64,      // Nano9: 0 to 1_000_000_000
    pub tracking_state: String,
    pub azimuth: i64,            // Nano9 radians
    pub elevation: i64,          // Nano9 radians
    pub weather_score: i64,      // Nano9: 0 to 1_000_000_000
    pub link_margin: i64,        // Nano9 dB
    pub target_satellite: Option<u8>,
    pub link_ready: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_atomic_state() {
        let state = AtomicStationState::new();

        // Default values
        assert_eq!(state.get_door_state(0), DoorState::Closed);
        assert_eq!(state.get_weather(0).raw_value(), NANO); // 1.0

        // Write and read
        state.set_weather(0, Nano9::raw(500_000_000)); // 0.5
        assert_eq!(state.get_weather(0).raw_value(), 500_000_000);
    }

    #[test]
    fn test_event_ring() {
        let sim = SimulationCore::new();

        // Inject events with Nano9 values
        assert!(sim.inject(StateEvent::Weather { station: 0, score: 500_000_000 }));
        assert!(sim.inject(StateEvent::DoorOpen { station: 0 }));

        // Events queued
        assert!(sim.events.pop().is_some());
        assert!(sim.events.pop().is_some());
        assert!(sim.events.pop().is_none());
    }
}
