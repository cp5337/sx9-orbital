//! FSO State Machine for Ground Station Operations
//!
//! Complete state machine for Free-Space Optical (FSO) satellite communications:
//! - Beam focal point tracking
//! - Receiver slewing
//! - Door control
//! - QKD handoff
//! - Transmission management
//! - Overpass completion
//!
//! Integrates with:
//! - Live TLE feed from CelesTrak/Galileo
//! - Weather APIs (Open-Meteo, Tomorrow.io)
//! - Collision avoidance (SOCRATES)
//! - SurrealDB for state persistence

use serde::{Deserialize, Serialize};
use crate::{PointingAngles, DoorState};

/// FSO operational state machine
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum FsoState {
    /// Idle - waiting for next satellite pass
    Idle,
    
    /// Acquisition - satellite entering field of view, door opening
    Acquisition,
    
    /// Tracking - actively tracking satellite, slewing to maintain lock
    Tracking,
    
    /// FocalLock - beam centered in focal point, ready for QKD
    FocalLock,
    
    /// QKDHandoff - quantum key distribution handshake in progress
    QKDHandoff,
    
    /// Transmission - active data transmission
    Transmission,
    
    /// Slewing - receiver adjusting to maintain beam lock
    Slewing,
    
    /// DoorClosing - overpass complete, securing aperture
    DoorClosing,
    
    /// Fault - error state requiring intervention
    Fault,
}

/// Beam focal point status
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct FocalPointStatus {
    /// Beam is within focal point tolerance (arcseconds)
    pub in_focus: bool,
    
    /// Radial offset from focal center (arcseconds)
    pub radial_offset_arcsec: f64,
    
    /// Angular offset in azimuth (arcseconds)
    pub azimuth_offset_arcsec: f64,
    
    /// Angular offset in elevation (arcseconds)
    pub elevation_offset_arcsec: f64,
    
    /// Signal strength (0.0-1.0)
    pub signal_strength: f64,
    
    /// Focal lock quality (0.0-1.0)
    pub lock_quality: f64,
}

/// QKD handoff status
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum QkdStatus {
    /// Not initiated
    Idle,
    
    /// Synchronizing quantum clocks
    ClockSync,
    
    /// Establishing basis agreement
    BasisNegotiation,
    
    /// Key sifting in progress
    KeySifting,
    
    /// Error correction
    ErrorCorrection,
    
    /// Privacy amplification
    PrivacyAmplification,
    
    /// QKD complete, keys exchanged
    Complete,
    
    /// QKD failed
    Failed,
}

/// Transmission statistics
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct TransmissionStats {
    /// Total bytes transmitted
    pub bytes_transmitted: u64,
    
    /// Current data rate (Gbps)
    pub data_rate_gbps: f64,
    
    /// Bit error rate
    pub bit_error_rate: f64,
    
    /// Link margin (dB)
    pub link_margin_db: f64,
    
    /// Transmission duration (seconds)
    pub duration_sec: f64,
}

/// Complete FSO operational context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsoContext {
    /// Current FSO state
    pub state: FsoState,
    
    /// Satellite being tracked (NORAD ID)
    pub target_norad_id: Option<u32>,
    
    /// Current pointing angles
    pub pointing: PointingAngles,
    
    /// Door state
    pub door: DoorState,
    
    /// Focal point status
    pub focal_point: FocalPointStatus,
    
    /// QKD handoff status
    pub qkd_status: QkdStatus,
    
    /// Transmission statistics
    pub transmission: TransmissionStats,
    
    /// Weather score (0.0-1.0, from weather API)
    pub weather_score: f64,
    
    /// Collision risk (from SOCRATES)
    pub collision_risk: f64,
    
    /// Time of acquisition (Unix timestamp)
    pub aos_time: Option<i64>,
    
    /// Time of loss of signal (Unix timestamp)
    pub los_time: Option<i64>,
    
    /// Last state update (Unix timestamp)
    pub last_update: i64,
}

impl Default for FsoContext {
    fn default() -> Self {
        Self {
            state: FsoState::Idle,
            target_norad_id: None,
            pointing: PointingAngles {
                azimuth_deg: 0.0,
                elevation_deg: 90.0,
                range_km: 0.0,
                doppler_shift_hz: 0.0,
            },
            door: DoorState::Closed,
            focal_point: FocalPointStatus {
                in_focus: false,
                radial_offset_arcsec: 0.0,
                azimuth_offset_arcsec: 0.0,
                elevation_offset_arcsec: 0.0,
                signal_strength: 0.0,
                lock_quality: 0.0,
            },
            qkd_status: QkdStatus::Idle,
            transmission: TransmissionStats {
                bytes_transmitted: 0,
                data_rate_gbps: 0.0,
                bit_error_rate: 0.0,
                link_margin_db: 0.0,
                duration_sec: 0.0,
            },
            weather_score: 1.0,
            collision_risk: 0.0,
            aos_time: None,
            los_time: None,
            last_update: 0,
        }
    }
}

/// FSO State Machine Controller
pub struct FsoStateMachine {
    context: FsoContext,
    
    /// Focal point tolerance (arcseconds)
    focal_tolerance_arcsec: f64,
    
    /// Minimum signal strength for QKD
    min_signal_for_qkd: f64,
    
    /// Minimum link margin for transmission (dB)
    min_link_margin_db: f64,
}

impl FsoStateMachine {
    /// Create new FSO state machine
    pub fn new() -> Self {
        Self {
            context: FsoContext::default(),
            focal_tolerance_arcsec: 5.0,  // 5 arcseconds tolerance
            min_signal_for_qkd: 0.7,      // 70% signal strength
            min_link_margin_db: 3.0,      // 3dB minimum margin
        }
    }
    
    /// Start satellite acquisition
    pub fn start_acquisition(&mut self, norad_id: u32, aos_time: i64, los_time: i64) {
        if self.context.state == FsoState::Idle {
            self.context.state = FsoState::Acquisition;
            self.context.target_norad_id = Some(norad_id);
            self.context.aos_time = Some(aos_time);
            self.context.los_time = Some(los_time);
            self.context.door = DoorState::Opening;
        }
    }
    
    /// Update focal point status
    pub fn update_focal_point(&mut self, pointing: PointingAngles, signal_strength: f64) {
        self.context.pointing = pointing;
        
        // Calculate focal point offsets (simplified - would use actual beam measurements)
        let radial_offset = (pointing.azimuth_deg.powi(2) + pointing.elevation_deg.powi(2)).sqrt() * 3600.0;
        
        self.context.focal_point = FocalPointStatus {
            in_focus: radial_offset < self.focal_tolerance_arcsec && signal_strength > 0.5,
            radial_offset_arcsec: radial_offset,
            azimuth_offset_arcsec: pointing.azimuth_deg * 3600.0,
            elevation_offset_arcsec: pointing.elevation_deg * 3600.0,
            signal_strength,
            lock_quality: if radial_offset < self.focal_tolerance_arcsec { 
                signal_strength 
            } else { 
                signal_strength * 0.5 
            },
        };
    }
    
    /// State machine tick - call every update cycle
    pub fn tick(&mut self, delta_sec: f64, current_time: i64) -> FsoState {
        self.context.last_update = current_time;
        
        match self.context.state {
            FsoState::Idle => {
                // Waiting for next pass
            }
            
            FsoState::Acquisition => {
                // Check if door is open and we have signal
                if self.context.door == DoorState::Open && self.context.focal_point.signal_strength > 0.1 {
                    self.context.state = FsoState::Tracking;
                }
            }
            
            FsoState::Tracking => {
                // Check if we achieved focal lock
                if self.context.focal_point.in_focus && 
                   self.context.focal_point.lock_quality > 0.8 {
                    self.context.state = FsoState::FocalLock;
                }
                
                // Check if we need to slew
                if self.context.focal_point.radial_offset_arcsec > self.focal_tolerance_arcsec * 1.5 {
                    self.context.state = FsoState::Slewing;
                }
            }
            
            FsoState::FocalLock => {
                // Check if signal is strong enough for QKD
                if self.context.focal_point.signal_strength >= self.min_signal_for_qkd {
                    self.context.state = FsoState::QKDHandoff;
                    self.context.qkd_status = QkdStatus::ClockSync;
                }
            }
            
            FsoState::QKDHandoff => {
                // Progress QKD handoff
                self.progress_qkd_handoff(delta_sec);
                
                // Check if QKD complete
                if self.context.qkd_status == QkdStatus::Complete {
                    self.context.state = FsoState::Transmission;
                } else if self.context.qkd_status == QkdStatus::Failed {
                    self.context.state = FsoState::Tracking;
                    self.context.qkd_status = QkdStatus::Idle;
                }
            }
            
            FsoState::Transmission => {
                // Update transmission stats
                self.context.transmission.duration_sec += delta_sec;
                
                // Check if we lost focal lock
                if !self.context.focal_point.in_focus {
                    self.context.state = FsoState::Tracking;
                }
                
                // Check if overpass is ending
                if let Some(los_time) = self.context.los_time {
                    if current_time >= los_time - 5 {  // 5 seconds before LOS
                        self.context.state = FsoState::DoorClosing;
                        self.context.door = DoorState::Closing;
                    }
                }
            }
            
            FsoState::Slewing => {
                // Check if we regained focal lock
                if self.context.focal_point.in_focus {
                    self.context.state = FsoState::Tracking;
                }
            }
            
            FsoState::DoorClosing => {
                // Check if door is closed
                if self.context.door == DoorState::Closed {
                    self.complete_overpass();
                }
            }
            
            FsoState::Fault => {
                // Requires manual intervention
            }
        }
        
        self.context.state
    }
    
    /// Progress QKD handoff through stages
    fn progress_qkd_handoff(&mut self, delta_sec: f64) {
        // Simplified QKD progression (real implementation would be more complex)
        match self.context.qkd_status {
            QkdStatus::ClockSync => {
                // Simulate clock sync (normally 0.5-1 second)
                if delta_sec > 0.5 {
                    self.context.qkd_status = QkdStatus::BasisNegotiation;
                }
            }
            QkdStatus::BasisNegotiation => {
                self.context.qkd_status = QkdStatus::KeySifting;
            }
            QkdStatus::KeySifting => {
                self.context.qkd_status = QkdStatus::ErrorCorrection;
            }
            QkdStatus::ErrorCorrection => {
                self.context.qkd_status = QkdStatus::PrivacyAmplification;
            }
            QkdStatus::PrivacyAmplification => {
                self.context.qkd_status = QkdStatus::Complete;
            }
            _ => {}
        }
    }
    
    /// Complete overpass and reset to idle
    fn complete_overpass(&mut self) {
        self.context.state = FsoState::Idle;
        self.context.target_norad_id = None;
        self.context.aos_time = None;
        self.context.los_time = None;
        self.context.qkd_status = QkdStatus::Idle;
        self.context.transmission = TransmissionStats {
            bytes_transmitted: 0,
            data_rate_gbps: 0.0,
            bit_error_rate: 0.0,
            link_margin_db: 0.0,
            duration_sec: 0.0,
        };
    }
    
    /// Get current context
    pub fn context(&self) -> &FsoContext {
        &self.context
    }
    
    /// Get mutable context
    pub fn context_mut(&mut self) -> &mut FsoContext {
        &mut self.context
    }
    
    /// Emergency stop - close door and return to idle
    pub fn emergency_stop(&mut self) {
        self.context.state = FsoState::Fault;
        self.context.door = DoorState::Closing;
    }
}

impl Default for FsoStateMachine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_acquisition_to_tracking() {
        let mut fsm = FsoStateMachine::new();
        
        // Start acquisition
        fsm.start_acquisition(12345, 1000, 2000);
        assert_eq!(fsm.context.state, FsoState::Acquisition);
        assert_eq!(fsm.context.door, DoorState::Opening);
        
        // Simulate door open and signal acquired
        fsm.context.door = DoorState::Open;
        fsm.update_focal_point(
            PointingAngles {
                azimuth_deg: 0.0,
                elevation_deg: 45.0,
                range_km: 500.0,
                doppler_shift_hz: 0.0,
            },
            0.5,
        );
        
        fsm.tick(0.1, 1001);
        assert_eq!(fsm.context.state, FsoState::Tracking);
    }
    
    #[test]
    fn test_focal_lock_to_qkd() {
        let mut fsm = FsoStateMachine::new();
        fsm.context.state = FsoState::Tracking;
        
        // Achieve focal lock with strong signal
        fsm.update_focal_point(
            PointingAngles {
                azimuth_deg: 0.0001,  // Very small offset
                elevation_deg: 0.0001,
                range_km: 500.0,
                doppler_shift_hz: 0.0,
            },
            0.9,  // Strong signal
        );
        
        fsm.tick(0.1, 1000);
        assert_eq!(fsm.context.state, FsoState::FocalLock);
        
        fsm.tick(0.1, 1001);
        assert_eq!(fsm.context.state, FsoState::QKDHandoff);
        assert_eq!(fsm.context.qkd_status, QkdStatus::ClockSync);
    }
}
