// ECS Component definitions for ground stations and beam patterns
// Module: ecs/components.rs | Lines: ~185 | Tier: Simple (<200)

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroundStationId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeodeticPosition {
    pub latitude_deg: f64,
    pub longitude_deg: f64,
    pub altitude_m: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeclinationAngles {
    pub angles_deg: Vec<f64>,
    pub preset_type: DeclinationPreset,
    pub custom: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DeclinationPreset {
    Basic,
    Operational,
    Precision,
    Custom,
}

impl DeclinationPreset {
    pub fn default_angles(&self) -> Vec<f64> {
        match self {
            Self::Basic => vec![10.0, 20.0, 45.0, 70.0, 90.0],
            Self::Operational => vec![5.0, 10.0, 15.0, 30.0, 45.0, 60.0, 75.0, 90.0],
            Self::Precision => vec![
                5.0, 7.5, 10.0, 12.5, 15.0, 20.0, 25.0, 30.0,
                40.0, 50.0, 60.0, 70.0, 80.0, 85.0, 90.0
            ],
            Self::Custom => vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BeamParameters {
    pub wavelength_nm: f64,
    pub waist_radius_mm: f64,
    pub power_watts: f64,
    pub m2_factor: f64,
}

impl Default for BeamParameters {
    fn default() -> Self {
        Self {
            wavelength_nm: 1550.0,
            waist_radius_mm: 10.0,
            power_watts: 1.0,
            m2_factor: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AtmosphericConditions {
    pub cn2_turbulence: f64,
    pub visibility_km: f64,
    pub cloud_cover_percent: f64,
    pub wind_speed_m_s: f64,
    pub humidity_percent: f64,
    pub temperature_c: f64,
}

impl Default for AtmosphericConditions {
    fn default() -> Self {
        Self {
            cn2_turbulence: 1e-15,
            visibility_km: 20.0,
            cloud_cover_percent: 0.0,
            wind_speed_m_s: 10.0,
            humidity_percent: 50.0,
            temperature_c: 15.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkBudget {
    pub elevation_deg: f64,
    pub atmospheric_loss_db: f64,
    pub turbulence_penalty_db: f64,
    pub total_margin_db: f64,
    pub transmission_factor: f64,
}

impl LinkBudget {
    pub fn calculate(elevation_deg: f64, conditions: &AtmosphericConditions) -> Self {
        let air_mass = 1.0 / (elevation_deg.to_radians().sin());
        let transmission = (-0.15 * air_mass).exp();
        let atm_loss = -10.0 * transmission.log10();

        let turbulence_factor = if elevation_deg < 30.0 {
            (30.0 - elevation_deg) / 30.0
        } else {
            0.0
        };
        let turb_penalty = turbulence_factor * conditions.cn2_turbulence.log10().abs() * 0.5;

        Self {
            elevation_deg,
            atmospheric_loss_db: atm_loss,
            turbulence_penalty_db: turb_penalty,
            total_margin_db: -(atm_loss + turb_penalty),
            transmission_factor: transmission,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BeamPattern {
    pub width: u32,
    pub height: u32,
    pub data: Vec<f32>,
    pub timestamp: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StationMetadata {
    pub name: String,
    pub tier: u8,
    pub telescope_diameter_m: f64,
}

impl Default for StationMetadata {
    fn default() -> Self {
        Self {
            name: String::from("Unknown"),
            tier: 2,
            telescope_diameter_m: 0.5,
        }
    }
}
