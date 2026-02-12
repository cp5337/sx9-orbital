// Main WASM library entry point
// Module: lib.rs | Lines: ~80 | Tier: Simple (<200)

use wasm_bindgen::prelude::*;

#[macro_use]
mod utils;

mod ecs;
mod beam_patterns;

pub use ecs::world::ECSWorld;
use ecs::components::{BeamParameters, AtmosphericConditions};
use beam_patterns::{gaussian, bessel};

#[wasm_bindgen]
pub fn init_panic_hook() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn generate_beam_pattern(
    beam_type: String,
    wavelength_nm: f64,
    waist_radius_mm: f64,
    power_watts: f64,
    cn2_turbulence: f64,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, JsValue> {
    let params = BeamParameters {
        wavelength_nm,
        waist_radius_mm,
        power_watts,
        m2_factor: 1.0,
    };

    let conditions = AtmosphericConditions {
        cn2_turbulence,
        visibility_km: 20.0,
        cloud_cover_percent: 0.0,
        wind_speed_m_s: 10.0,
        humidity_percent: 50.0,
        temperature_c: 15.0,
    };

    match beam_type.as_str() {
        "gaussian" => Ok(gaussian::generate_gaussian_beam(&params, &conditions, width, height)),
        "bessel" => Ok(bessel::generate_bessel_beam(&params, width, height)),
        _ => Err(JsValue::from_str(&format!("Unknown beam type: {}", beam_type))),
    }
}

#[wasm_bindgen]
pub fn calculate_link_margin(
    elevation_deg: f64,
    cn2_turbulence: f64,
    cloud_cover: f64,
) -> f64 {
    let air_mass = 1.0 / elevation_deg.to_radians().sin();
    let transmission = (-0.15 * air_mass).exp();
    let atm_loss = -10.0 * transmission.log10();

    let turbulence_factor = if elevation_deg < 30.0 {
        (30.0 - elevation_deg) / 30.0
    } else {
        0.0
    };

    let turb_penalty = turbulence_factor * cn2_turbulence.log10().abs() * 0.5;
    let cloud_penalty = cloud_cover * 0.05;

    -(atm_loss + turb_penalty + cloud_penalty)
}
