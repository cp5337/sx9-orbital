//! FSO Link Budget Calculator
//!
//! Calculates link margin for Free Space Optical communications.
//! Accounts for:
//! - Free space path loss
//! - Atmospheric absorption (1550nm wavelength)
//! - Weather/cloud impact
//! - Elevation angle effects

use std::f64::consts::PI;

/// FSO system parameters (MEO-grade optical terminal)
/// Based on EDRS/LCRD class systems scaled for commercial
const WAVELENGTH_NM: f64 = 1550.0;
const TX_POWER_DBM: f64 = 37.0;          // 5W transmit power (space-grade)
const TX_APERTURE_M: f64 = 0.25;         // 25cm transmit aperture
const RX_APERTURE_M: f64 = 0.40;         // 40cm receive aperture (OGS)
const RX_SENSITIVITY_DBM: f64 = -45.0;   // High-sensitivity APD receiver
const POINTING_LOSS_DB: f64 = 2.0;       // Pointing/tracking loss
const SYSTEM_MARGIN_DB: f64 = 3.0;       // Required margin

/// Calculate link margin in dB
pub fn calculate_margin(elevation_deg: f64, weather_score: f64) -> f64 {
    // Negative if link not viable
    if elevation_deg < 5.0 {
        return -100.0; // Below horizon
    }

    // Free space path loss at typical MEO range
    let slant_range_km = estimate_slant_range(elevation_deg, 10500.0);
    let fspl_db = free_space_path_loss(slant_range_km);

    // Atmospheric loss (varies with elevation due to air mass)
    let atm_loss_db = atmospheric_loss(elevation_deg);

    // Weather impact (0.0 = total blockage, 1.0 = clear)
    let weather_loss_db = weather_penalty(weather_score);

    // Antenna gains
    let tx_gain_db = aperture_gain(TX_APERTURE_M);
    let rx_gain_db = aperture_gain(RX_APERTURE_M);

    // Link budget calculation
    let rx_power_dbm = TX_POWER_DBM
        + tx_gain_db
        - fspl_db
        - atm_loss_db
        - weather_loss_db
        - POINTING_LOSS_DB
        + rx_gain_db;

    // Margin = received power - sensitivity - required margin
    rx_power_dbm - RX_SENSITIVITY_DBM - SYSTEM_MARGIN_DB
}

/// Estimate slant range from elevation angle (simplified)
fn estimate_slant_range(elevation_deg: f64, sat_alt_km: f64) -> f64 {
    let earth_r = 6378.0; // km
    let sat_r = earth_r + sat_alt_km;
    let el_rad = elevation_deg.to_radians();

    // Geometric calculation
    let sin_el = el_rad.sin();
    let cos_el = el_rad.cos();

    // Range using law of cosines
    let range = -earth_r * sin_el
        + ((earth_r * sin_el).powi(2) + sat_r.powi(2) - earth_r.powi(2)).sqrt();

    range.max(sat_alt_km) // At least the altitude
}

/// Free space path loss in dB
fn free_space_path_loss(range_km: f64) -> f64 {
    let range_m = range_km * 1000.0;
    let wavelength_m = WAVELENGTH_NM * 1e-9;

    // FSPL = (4 * pi * d / lambda)^2
    let fspl = (4.0 * PI * range_m / wavelength_m).powi(2);
    10.0 * fspl.log10()
}

/// Atmospheric absorption loss
fn atmospheric_loss(elevation_deg: f64) -> f64 {
    // Air mass approximation (Kasten-Young)
    let zenith_deg = 90.0 - elevation_deg;
    let zenith_rad = zenith_deg.to_radians();

    let air_mass = 1.0 / (zenith_rad.cos() + 0.50572 * (96.07995 - zenith_deg).powf(-1.6364));

    // Typical 1550nm zenith absorption ~0.1 dB
    let zenith_absorption_db = 0.1;

    zenith_absorption_db * air_mass
}

/// Weather penalty (cloud cover, precipitation, etc.)
fn weather_penalty(weather_score: f64) -> f64 {
    // weather_score: 1.0 = clear, 0.0 = total blockage
    let score = weather_score.clamp(0.01, 1.0);

    // Exponential relationship
    // 1.0 -> 0 dB, 0.5 -> 3 dB, 0.1 -> 10 dB
    -10.0 * score.log10()
}

/// Antenna gain from aperture diameter
fn aperture_gain(diameter_m: f64) -> f64 {
    let wavelength_m = WAVELENGTH_NM * 1e-9;
    let area = PI * (diameter_m / 2.0).powi(2);
    let efficiency = 0.55; // Typical aperture efficiency

    let gain = 4.0 * PI * area * efficiency / wavelength_m.powi(2);
    10.0 * gain.log10()
}

/// Detailed link budget breakdown
#[derive(Debug, Clone)]
pub struct LinkBudgetBreakdown {
    pub tx_power_dbm: f64,
    pub tx_gain_db: f64,
    pub fspl_db: f64,
    pub atmospheric_loss_db: f64,
    pub weather_loss_db: f64,
    pub pointing_loss_db: f64,
    pub rx_gain_db: f64,
    pub rx_power_dbm: f64,
    pub rx_sensitivity_dbm: f64,
    pub link_margin_db: f64,
    pub link_viable: bool,
}

/// Get detailed breakdown
pub fn detailed_budget(
    elevation_deg: f64,
    weather_score: f64,
    slant_range_km: Option<f64>,
) -> LinkBudgetBreakdown {
    let range = slant_range_km.unwrap_or_else(|| estimate_slant_range(elevation_deg, 10500.0));

    let tx_gain = aperture_gain(TX_APERTURE_M);
    let rx_gain = aperture_gain(RX_APERTURE_M);
    let fspl = free_space_path_loss(range);
    let atm_loss = atmospheric_loss(elevation_deg);
    let wx_loss = weather_penalty(weather_score);

    let rx_power = TX_POWER_DBM + tx_gain - fspl - atm_loss - wx_loss - POINTING_LOSS_DB + rx_gain;
    let margin = rx_power - RX_SENSITIVITY_DBM - SYSTEM_MARGIN_DB;

    LinkBudgetBreakdown {
        tx_power_dbm: TX_POWER_DBM,
        tx_gain_db: tx_gain,
        fspl_db: fspl,
        atmospheric_loss_db: atm_loss,
        weather_loss_db: wx_loss,
        pointing_loss_db: POINTING_LOSS_DB,
        rx_gain_db: rx_gain,
        rx_power_dbm: rx_power,
        rx_sensitivity_dbm: RX_SENSITIVITY_DBM,
        link_margin_db: margin,
        link_viable: margin > 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_link_margin_good_conditions() {
        // High elevation, clear weather
        let margin = calculate_margin(45.0, 0.95);
        assert!(margin > 0.0, "Link should be viable: {} dB", margin);
    }

    #[test]
    fn test_link_margin_poor_conditions() {
        // Low elevation, poor weather
        let margin = calculate_margin(10.0, 0.3);
        // May or may not be viable depending on exact parameters
        println!("Low el, poor wx margin: {} dB", margin);
    }

    #[test]
    fn test_link_margin_below_horizon() {
        let margin = calculate_margin(2.0, 1.0);
        assert!(margin < -50.0, "Should be below horizon");
    }

    #[test]
    fn test_slant_range() {
        let range_zenith = estimate_slant_range(90.0, 10500.0);
        assert!((range_zenith - 10500.0).abs() < 100.0, "Zenith should be ~altitude");

        let range_low = estimate_slant_range(10.0, 10500.0);
        assert!(range_low > range_zenith, "Low elevation = longer range");
    }
}
