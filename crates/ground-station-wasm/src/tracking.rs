//! Tracking Loop
//!
//! Coordinates slew, door, and link budget for active tracking.

use crate::{
    SlewController, DoorController, DoorState,
    PointingAngles, SatellitePosition, GroundStationConfig,
    calculate_look_angles, link_budget,
};

/// Tracking state
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TrackingState {
    Idle,
    Acquiring,   // Slewing to target
    Tracking,    // Actively tracking
    LostSignal,  // Below horizon or link failed
}

/// Tracking loop controller
pub struct TrackingLoop {
    pub state: TrackingState,
    pub target: Option<SatellitePosition>,
    slew: SlewController,
    door: DoorController,
    door_state: DoorState,
    current_pointing: PointingAngles,
    link_margin_db: f64,
}

impl TrackingLoop {
    pub fn new(max_slew_rate: f64) -> Self {
        Self {
            state: TrackingState::Idle,
            target: None,
            slew: SlewController::new(max_slew_rate),
            door: DoorController::new(),
            door_state: DoorState::Closed,
            current_pointing: PointingAngles {
                azimuth_deg: 0.0,
                elevation_deg: 90.0,
                range_km: 0.0,
                doppler_shift_hz: 0.0,
            },
            link_margin_db: 0.0,
        }
    }

    /// Start tracking a satellite
    pub fn acquire(&mut self, sat: SatellitePosition, config: &GroundStationConfig) {
        let target_pointing = calculate_look_angles(
            config.latitude_deg,
            config.longitude_deg,
            config.altitude_m / 1000.0,
            sat.latitude_deg,
            sat.longitude_deg,
            sat.altitude_km,
        );

        if target_pointing.elevation_deg >= config.min_elevation_deg {
            self.target = Some(sat);
            self.state = TrackingState::Acquiring;
            self.door.open(&mut self.door_state);
        }
    }

    /// Stop tracking
    pub fn release(&mut self) {
        self.target = None;
        self.state = TrackingState::Idle;
        self.door.close(&mut self.door_state);
    }

    /// Update tracking (call each tick)
    pub fn tick(
        &mut self,
        config: &GroundStationConfig,
        sat_position: Option<SatellitePosition>,
        weather_score: f64,
        delta_sec: f64,
    ) {
        // Update door
        self.door.tick(&mut self.door_state, delta_sec);

        match self.state {
            TrackingState::Idle => {
                // Nothing to do
            }

            TrackingState::Acquiring => {
                if let Some(sat) = sat_position.or(self.target) {
                    let target_pointing = calculate_look_angles(
                        config.latitude_deg,
                        config.longitude_deg,
                        config.altitude_m / 1000.0,
                        sat.latitude_deg,
                        sat.longitude_deg,
                        sat.altitude_km,
                    );

                    // Check still visible
                    if target_pointing.elevation_deg < config.min_elevation_deg {
                        self.state = TrackingState::LostSignal;
                        return;
                    }

                    // Slew towards target
                    self.current_pointing = self.slew.step(
                        &self.current_pointing,
                        &target_pointing,
                        delta_sec,
                    );

                    // Check if acquired
                    if self.slew.is_settled(&self.current_pointing, &target_pointing)
                        && self.door.is_ready(&self.door_state)
                    {
                        self.state = TrackingState::Tracking;
                    }
                }
            }

            TrackingState::Tracking => {
                if let Some(sat) = sat_position.or(self.target) {
                    let target_pointing = calculate_look_angles(
                        config.latitude_deg,
                        config.longitude_deg,
                        config.altitude_m / 1000.0,
                        sat.latitude_deg,
                        sat.longitude_deg,
                        sat.altitude_km,
                    );

                    // Check still visible
                    if target_pointing.elevation_deg < config.min_elevation_deg {
                        self.state = TrackingState::LostSignal;
                        self.door.close(&mut self.door_state);
                        return;
                    }

                    // Continue tracking
                    self.current_pointing = self.slew.step(
                        &self.current_pointing,
                        &target_pointing,
                        delta_sec,
                    );

                    // Update link budget
                    self.link_margin_db = link_budget::calculate_margin(
                        target_pointing.elevation_deg,
                        weather_score,
                    );

                    // Check link quality
                    if self.link_margin_db < 0.0 {
                        // Link failed but still visible - degrade to acquiring
                        self.state = TrackingState::Acquiring;
                    }
                } else {
                    self.state = TrackingState::LostSignal;
                }
            }

            TrackingState::LostSignal => {
                self.door.close(&mut self.door_state);
                if self.door_state == DoorState::Closed {
                    self.state = TrackingState::Idle;
                    self.target = None;
                }
            }
        }
    }

    /// Get current pointing angles
    pub fn pointing(&self) -> &PointingAngles {
        &self.current_pointing
    }

    /// Get current link margin
    pub fn link_margin(&self) -> f64 {
        self.link_margin_db
    }

    /// Get door state
    pub fn door_state(&self) -> DoorState {
        self.door_state
    }
}
