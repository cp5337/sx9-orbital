// Gaussian beam pattern generator
// Module: beam_patterns/gaussian.rs | Lines: ~180 | Tier: Simple (<200)

use crate::ecs::components::{BeamParameters, AtmosphericConditions};
use std::f64::consts::PI;

pub fn generate_gaussian_beam(
    params: &BeamParameters,
    conditions: &AtmosphericConditions,
    width: u32,
    height: u32,
) -> Vec<u8> {
    let center_x = width as f64 / 2.0;
    let center_y = height as f64 / 2.0;
    let w0 = params.waist_radius_mm / 1000.0;

    let mut rgba = Vec::with_capacity((width * height * 4) as usize);
    let mut max_intensity = 0.0_f64;
    let mut intensities = Vec::with_capacity((width * height) as usize);

    // Compute intensities
    for y in 0..height {
        for x in 0..width {
            let dx = (x as f64 - center_x) * 0.001;
            let dy = (y as f64 - center_y) * 0.001;
            let r2 = dx * dx + dy * dy;

            let intensity = (params.power_watts / (PI * w0 * w0))
                * (-2.0 * r2 / (w0 * w0)).exp();

            intensities.push(intensity);
            if intensity > max_intensity {
                max_intensity = intensity;
            }
        }
    }

    // Apply turbulence and normalize
    let turbulence_strength = conditions.cn2_turbulence.log10().abs() / 15.0;

    for intensity in intensities {
        let turbulence_factor = 1.0 - turbulence_strength * 0.2;
        let normalized = (intensity / max_intensity * turbulence_factor).clamp(0.0, 1.0);
        let (r, g, b) = viridis_colormap(normalized);
        rgba.extend_from_slice(&[r, g, b, 255]);
    }

    rgba
}

pub fn compute_gaussian_pattern(
    params: &BeamParameters,
    width: u32,
    height: u32,
) -> Vec<f32> {
    let center_x = width as f64 / 2.0;
    let center_y = height as f64 / 2.0;
    let w0 = params.waist_radius_mm / 1000.0;

    let mut data = Vec::with_capacity((width * height) as usize);

    for y in 0..height {
        for x in 0..width {
            let dx = (x as f64 - center_x) * 0.001;
            let dy = (y as f64 - center_y) * 0.001;
            let r2 = dx * dx + dy * dy;

            let intensity = (-2.0 * r2 / (w0 * w0)).exp();
            data.push(intensity as f32);
        }
    }

    data
}

fn viridis_colormap(t: f64) -> (u8, u8, u8) {
    // Viridis colormap approximation for scientific visualization
    let t = t.clamp(0.0, 1.0);

    let r = if t < 0.5 {
        68.0 + t * 84.0
    } else {
        152.0 + (t - 0.5) * 206.0
    };

    let g = if t < 0.33 {
        1.0 + t * 225.0
    } else if t < 0.66 {
        75.0 + (t - 0.33) * 363.0
    } else {
        195.0 + (t - 0.66) * 90.0
    };

    let b = if t < 0.25 {
        84.0 + t * 224.0
    } else if t < 0.5 {
        140.0 - (t - 0.25) * 240.0
    } else {
        80.0 - (t - 0.5) * 120.0
    };

    (
        r.clamp(0.0, 255.0) as u8,
        g.clamp(0.0, 255.0) as u8,
        b.clamp(0.0, 255.0) as u8,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gaussian_generation() {
        let params = BeamParameters::default();
        let conditions = AtmosphericConditions::default();
        let pattern = generate_gaussian_beam(&params, &conditions, 100, 100);
        assert_eq!(pattern.len(), 100 * 100 * 4);
    }

    #[test]
    fn test_colormap_bounds() {
        let (r, g, b) = viridis_colormap(0.0);
        assert!(r <= 255 && g <= 255 && b <= 255);

        let (r, g, b) = viridis_colormap(1.0);
        assert!(r <= 255 && g <= 255 && b <= 255);
    }

    #[test]
    fn test_compute_pattern() {
        let params = BeamParameters::default();
        let data = compute_gaussian_pattern(&params, 50, 50);
        assert_eq!(data.len(), 50 * 50);
        assert!(data.iter().all(|&v| v >= 0.0 && v <= 1.0));
    }
}
