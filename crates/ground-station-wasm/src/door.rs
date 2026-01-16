//! Door (Aperture) Controller
//!
//! Manages the protective door/shutter over the FSO terminal.
//! Door opens during satellite passes, closes for protection.

use serde::{Deserialize, Serialize};

/// Door state machine
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum DoorState {
    Closed,
    Opening,
    Open,
    Closing,
    Fault,
}

/// Door controller
pub struct DoorController {
    transition_time_sec: f64,
    current_position: f64, // 0.0 = closed, 1.0 = open
}

impl DoorController {
    pub fn new() -> Self {
        Self {
            transition_time_sec: 2.0, // 2 seconds to open/close
            current_position: 0.0,
        }
    }

    /// Command door to open
    pub fn open(&mut self, state: &mut DoorState) {
        match state {
            DoorState::Closed | DoorState::Closing => {
                *state = DoorState::Opening;
            }
            DoorState::Open | DoorState::Opening => {
                // Already opening or open
            }
            DoorState::Fault => {
                // Cannot operate in fault state
            }
        }
    }

    /// Command door to close
    pub fn close(&mut self, state: &mut DoorState) {
        match state {
            DoorState::Open | DoorState::Opening => {
                *state = DoorState::Closing;
            }
            DoorState::Closed | DoorState::Closing => {
                // Already closing or closed
            }
            DoorState::Fault => {
                // Cannot operate in fault state
            }
        }
    }

    /// Update door position (call each tick)
    pub fn tick(&mut self, state: &mut DoorState, delta_sec: f64) {
        let rate = 1.0 / self.transition_time_sec;
        let delta_pos = rate * delta_sec;

        match state {
            DoorState::Opening => {
                self.current_position = (self.current_position + delta_pos).min(1.0);
                if self.current_position >= 1.0 {
                    *state = DoorState::Open;
                }
            }
            DoorState::Closing => {
                self.current_position = (self.current_position - delta_pos).max(0.0);
                if self.current_position <= 0.0 {
                    *state = DoorState::Closed;
                }
            }
            _ => {}
        }
    }

    /// Get current position (0.0 = closed, 1.0 = open)
    pub fn position(&self) -> f64 {
        self.current_position
    }

    /// Check if door is fully open (ready for tracking)
    pub fn is_ready(&self, state: &DoorState) -> bool {
        *state == DoorState::Open && self.current_position >= 0.99
    }
}

impl Default for DoorController {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_door_open_close_cycle() {
        let mut ctrl = DoorController::new();
        let mut state = DoorState::Closed;

        // Open command
        ctrl.open(&mut state);
        assert_eq!(state, DoorState::Opening);

        // Tick until open
        for _ in 0..30 {
            ctrl.tick(&mut state, 0.1);
        }
        assert_eq!(state, DoorState::Open);
        assert!(ctrl.is_ready(&state));

        // Close command
        ctrl.close(&mut state);
        assert_eq!(state, DoorState::Closing);

        // Tick until closed
        for _ in 0..30 {
            ctrl.tick(&mut state, 0.1);
        }
        assert_eq!(state, DoorState::Closed);
    }
}
