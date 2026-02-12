// Bessel beam pattern generator (non-diffracting beams)
// Module: beam_patterns/bessel.rs | Lines: ~165 | Tier: Simple (<200)

use crate::ecs::components::BeamParameters;
use std::f64::consts::PI;

pub fn generate_bessel_beam(
    params: &BeamParameters,
    width: u32,
    height: u32,
) -> Vec<u8> {
    let center_x = width as f64 / 2.0;
    let center_y = height as f64 / 2.0;

    let lambda = params.wavelength_nm * 1e-9;
    let k = 2.0 * PI / lambda;
    let alpha = params.m2_factor * 0.001;
    let kr = k * alpha.sin();

    let mut rgba = Vec::with_capacity((width * height * 4) as usize);
    let mut max_intensity = 0.0_f64;
    let mut intensities = Vec::with_capacity((width * height) as usize);

    for y in 0..height {
        for x in 0..width {
            let dx = (x as f64 - center_x) * 0.001;
            let dy = (y as f64 - center_y) * 0.001;
            let r = (dx * dx + dy * dy).sqrt();

            let intensity = bessel_j0(kr * r).powi(2) * params.power_watts;
            intensities.push(intensity);
            if intensity > max_intensity {
                max_intensity = intensity;
            }
        }
    }

    for intensity in intensities {
        let normalized = (intensity / max_intensity).clamp(0.0, 1.0);
        let (r, g, b) = plasma_colormap(normalized);
        rgba.extend_from_slice(&[r, g, b, 255]);
    }

    rgba
}

pub fn compute_bessel_pattern(
    params: &BeamParameters,
    width: u32,
    height: u32,
) -> Vec<f32> {
    let center_x = width as f64 / 2.0;
    let center_y = height as f64 / 2.0;

    let lambda = params.wavelength_nm * 1e-9;
    let k = 2.0 * PI / lambda;
    let kr = k * 0.001;

    let mut data = Vec::with_capacity((width * height) as usize);

    for y in 0..height {
        for x in 0..width {
            let dx = (x as f64 - center_x) * 0.001;
            let dy = (y as f64 - center_y) * 0.001;
            let r = (dx * dx + dy * dy).sqrt();

            let intensity = bessel_j0(kr * r).powi(2);
            data.push(intensity as f32);
        }
    }

    data
}

fn bessel_j0(x: f64) -> f64 {
    if x.abs() < 8.0 {
        let y = x * x;
        let ans1 = 57568490574.0 + y * (-13362590354.0
            + y * (651619640.7
            + y * (-11214424.18
            + y * (77392.33017
            + y * (-184.9052456)))));
        let ans2 = 57568490411.0 + y * (1029532985.0
            + y * (9494680.718
            + y * (59272.64853
            + y * (267.8532712 + y))));
        ans1 / ans2
    } else {
        let ax = x.abs();
        let z = 8.0 / ax;
        let y = z * z;
        let xx = ax - 0.785398164;
        let ans1 = 1.0 + y * (-0.1098628627e-2
            + y * (0.2734510407e-4
            + y * (-0.2073370639e-5
            + y * 0.2093887211e-6)));
        let ans2 = -0.1562499995e-1 + y * (0.1430488765e-3
            + y * (-0.6911147651e-5
            + y * (0.7621095161e-6
            - y * 0.934935152e-7)));
        (ans1 * xx.cos() - z * ans2 * xx.sin()) * (0.636619772 / ax.sqrt())
    }
}

fn plasma_colormap(t: f64) -> (u8, u8, u8) {
    let t = t.clamp(0.0, 1.0);

    let r = if t < 0.5 {
        15.0 + t * 450.0
    } else {
        240.0 + (t - 0.5) * 30.0
    };

    let g = if t < 0.3 {
        10.0 + t * 200.0
    } else if t < 0.7 {
        70.0 + (t - 0.3) * 300.0
    } else {
        190.0 - (t - 0.7) * 100.0
    };

    let b = if t < 0.4 {
        120.0 + t * 200.0
    } else if t < 0.8 {
        200.0 - (t - 0.4) * 250.0
    } else {
        100.0 - (t - 0.8) * 250.0
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
    fn test_bessel_j0_values() {
        assert!((bessel_j0(0.0) - 1.0).abs() < 0.001);
        assert!(bessel_j0(1.0).abs() < 0.778);
    }

    #[test]
    fn test_bessel_generation() {
        let params = BeamParameters::default();
        let pattern = generate_bessel_beam(&params, 100, 100);
        assert_eq!(pattern.len(), 100 * 100 * 4);
    }

    #[test]
    fn test_colormap_bounds() {
        let (r, g, b) = plasma_colormap(0.5);
        assert!(r <= 255 && g <= 255 && b <= 255);
    }
}
