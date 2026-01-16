//! Slew Controller
//!
//! Controls the optical terminal's pointing mechanism.
//! Implements rate-limited slewing to track satellites.

use crate::PointingAngles;

/// Slew controller for optical terminal
pub struct SlewController {
    max_rate_deg_s: f64,
    settling_threshold_deg: f64,
}

impl SlewController {
    pub fn new(max_rate_deg_s: f64) -> Self {
        Self {
            max_rate_deg_s,
            settling_threshold_deg: 0.01, // 0.01° settling tolerance
        }
    }

    /// Step the slew towards target, respecting rate limits
    pub fn step(
        &self,
        current: &PointingAngles,
        target: &PointingAngles,
        delta_sec: f64,
    ) -> PointingAngles {
        let max_delta = self.max_rate_deg_s * delta_sec;

        // Calculate shortest path for azimuth (handle 360° wraparound)
        let mut az_delta = target.azimuth_deg - current.azimuth_deg;
        if az_delta > 180.0 {
            az_delta -= 360.0;
        } else if az_delta < -180.0 {
            az_delta += 360.0;
        }

        let el_delta = target.elevation_deg - current.elevation_deg;

        // Rate limit
        let az_step = az_delta.clamp(-max_delta, max_delta);
        let el_step = el_delta.clamp(-max_delta, max_delta);

        let mut new_az = current.azimuth_deg + az_step;
        if new_az < 0.0 {
            new_az += 360.0;
        } else if new_az >= 360.0 {
            new_az -= 360.0;
        }

        let new_el = (current.elevation_deg + el_step).clamp(0.0, 90.0);

        PointingAngles {
            azimuth_deg: new_az,
            elevation_deg: new_el,
            range_km: target.range_km,
            doppler_shift_hz: target.doppler_shift_hz,
        }
    }

    /// Check if slew has settled on target
    pub fn is_settled(&self, current: &PointingAngles, target: &PointingAngles) -> bool {
        let az_err = (current.azimuth_deg - target.azimuth_deg).abs();
        let el_err = (current.elevation_deg - target.elevation_deg).abs();

        // Handle azimuth wraparound
        let az_err = if az_err > 180.0 { 360.0 - az_err } else { az_err };

        az_err < self.settling_threshold_deg && el_err < self.settling_threshold_deg
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_slew_rate_limit() {
        let slew = SlewController::new(10.0); // 10 deg/sec

        let current = PointingAngles {
            azimuth_deg: 0.0,
            elevation_deg: 45.0,
            range_km: 0.0,
            doppler_shift_hz: 0.0,
        };

        let target = PointingAngles {
            azimuth_deg: 90.0,
            elevation_deg: 45.0,
            range_km: 0.0,
            doppler_shift_hz: 0.0,
        };

        // 1 second step should move max 10 degrees
        let result = slew.step(&current, &target, 1.0);
        assert!((result.azimuth_deg - 10.0).abs() < 0.01);
    }

    #[test]
    fn test_azimuth_wraparound() {
        let slew = SlewController::new(10.0);

        let current = PointingAngles {
            azimuth_deg: 350.0,
            elevation_deg: 45.0,
            range_km: 0.0,
            doppler_shift_hz: 0.0,
        };

        let target = PointingAngles {
            azimuth_deg: 10.0, // Shortest path is +20°, not -340°
            elevation_deg: 45.0,
            range_km: 0.0,
            doppler_shift_hz: 0.0,
        };

        let result = slew.step(&current, &target, 1.0);
        // Should go from 350 towards 360/0, not backwards
        assert!(result.azimuth_deg > 350.0 || result.azimuth_deg < 20.0);
    }
}
