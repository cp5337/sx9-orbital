//! Security and geopolitical risk scoring
//!
//! Implements a composite security score based on:
//! - Five Eyes travel advisories (US State Dept, UK FCDO, Canada, Australia, NZ)
//! - World Bank Worldwide Governance Indicators (WGI)
//!   - Political Stability and Absence of Violence (PV.EST)
//!   - Rule of Law (RL.EST)
//!   - Control of Corruption (CC.EST)
//!
//! # Security Score Formula
//!
//! ```text
//! S = 0.35·A + 0.25·PS + 0.20·RL + 0.10·CC + 0.10·ES
//! ```
//!
//! Where:
//! - A = Five Eyes travel advisory (normalized, 1-4 → 1.0-0.0)
//! - PS = Political Stability index (WGI, -2.5 to +2.5 → 0-1)
//! - RL = Rule of Law index (WGI, -2.5 to +2.5 → 0-1)
//! - CC = Control of Corruption index (WGI, -2.5 to +2.5 → 0-1)
//! - ES = Economic stability proxy (GDP per capita normalized)

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Security scoring configuration weights
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    /// Weight for Five Eyes travel advisory (default: 0.35)
    pub w_travel_advisory: f64,
    /// Weight for political stability (default: 0.25)
    pub w_political_stability: f64,
    /// Weight for rule of law (default: 0.20)
    pub w_rule_of_law: f64,
    /// Weight for corruption control (default: 0.10)
    pub w_corruption_control: f64,
    /// Weight for economic stability (default: 0.10)
    pub w_economic_stability: f64,
    /// Default score for countries with no data
    pub default_score: f64,
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            w_travel_advisory: 0.350000000,
            w_political_stability: 0.250000000,
            w_rule_of_law: 0.200000000,
            w_corruption_control: 0.100000000,
            w_economic_stability: 0.100000000,
            default_score: 0.500000000, // Neutral for unknown countries
        }
    }
}

/// Country-level risk data from various sources
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CountryRisk {
    /// ISO 3166-1 alpha-2 country code
    pub country_code: String,
    /// Country name
    pub country_name: String,
    /// Five Eyes travel advisory level (1-4, lower = safer)
    /// 1 = Exercise Normal Precautions
    /// 2 = Exercise Increased Caution
    /// 3 = Reconsider Travel
    /// 4 = Do Not Travel
    pub travel_advisory_level: Option<u8>,
    /// World Bank Political Stability index (-2.5 to +2.5)
    pub political_stability: Option<f64>,
    /// World Bank Rule of Law index (-2.5 to +2.5)
    pub rule_of_law: Option<f64>,
    /// World Bank Control of Corruption index (-2.5 to +2.5)
    pub corruption_control: Option<f64>,
    /// GDP per capita (USD) for economic stability proxy
    pub gdp_per_capita: Option<f64>,
    /// Computed composite security score (0-1, higher = safer)
    pub security_score: f64,
}

impl CountryRisk {
    /// Create new country risk entry
    pub fn new(country_code: impl Into<String>, country_name: impl Into<String>) -> Self {
        Self {
            country_code: country_code.into(),
            country_name: country_name.into(),
            travel_advisory_level: None,
            political_stability: None,
            rule_of_law: None,
            corruption_control: None,
            gdp_per_capita: None,
            security_score: 0.5, // Default neutral
        }
    }

    /// Calculate composite security score from all factors
    pub fn calculate_score(&mut self, config: &SecurityConfig) {
        let mut score = 0.0;
        let mut weight_sum = 0.0;

        // Travel advisory (normalized: level 1 → 1.0, level 4 → 0.0)
        if let Some(level) = self.travel_advisory_level {
            let norm = normalize_advisory(level);
            score += config.w_travel_advisory * norm;
            weight_sum += config.w_travel_advisory;
        }

        // Political stability (WGI -2.5 to +2.5 → 0-1)
        if let Some(ps) = self.political_stability {
            let norm = normalize_wgi(ps);
            score += config.w_political_stability * norm;
            weight_sum += config.w_political_stability;
        }

        // Rule of law (WGI -2.5 to +2.5 → 0-1)
        if let Some(rl) = self.rule_of_law {
            let norm = normalize_wgi(rl);
            score += config.w_rule_of_law * norm;
            weight_sum += config.w_rule_of_law;
        }

        // Corruption control (WGI -2.5 to +2.5 → 0-1)
        if let Some(cc) = self.corruption_control {
            let norm = normalize_wgi(cc);
            score += config.w_corruption_control * norm;
            weight_sum += config.w_corruption_control;
        }

        // Economic stability (GDP per capita normalized)
        if let Some(gdp) = self.gdp_per_capita {
            let norm = normalize_gdp(gdp);
            score += config.w_economic_stability * norm;
            weight_sum += config.w_economic_stability;
        }

        // Normalize by actual weights used (handles missing data)
        self.security_score = if weight_sum > 0.0 {
            (score / weight_sum).clamp(0.0, 1.0)
        } else {
            config.default_score
        };
    }

    /// Get risk tier classification
    pub fn risk_tier(&self) -> RiskTier {
        RiskTier::from_score(self.security_score)
    }
}

/// Risk tier classification
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RiskTier {
    /// 0.85 - 1.00: Low risk (e.g., Canada, Iceland, Singapore, Japan, NZ)
    Tier1LowRisk,
    /// 0.70 - 0.84: Moderate risk (e.g., UAE, Chile, Poland, S. Korea)
    Tier2Moderate,
    /// 0.50 - 0.69: Elevated risk (e.g., Brazil, Mexico, India, S. Africa)
    Tier3Elevated,
    /// 0.30 - 0.49: High risk (e.g., Nigeria, Pakistan, Colombia)
    Tier4HighRisk,
    /// 0.00 - 0.29: Critical risk (e.g., Yemen, Syria, Afghanistan, Somalia)
    Tier5Critical,
}

impl RiskTier {
    /// Classify score into risk tier
    pub fn from_score(score: f64) -> Self {
        if score >= 0.85 {
            RiskTier::Tier1LowRisk
        } else if score >= 0.70 {
            RiskTier::Tier2Moderate
        } else if score >= 0.50 {
            RiskTier::Tier3Elevated
        } else if score >= 0.30 {
            RiskTier::Tier4HighRisk
        } else {
            RiskTier::Tier5Critical
        }
    }

    /// Human-readable description
    pub fn description(&self) -> &'static str {
        match self {
            RiskTier::Tier1LowRisk => "Low Risk",
            RiskTier::Tier2Moderate => "Moderate",
            RiskTier::Tier3Elevated => "Elevated",
            RiskTier::Tier4HighRisk => "High Risk",
            RiskTier::Tier5Critical => "Critical",
        }
    }
}

/// Normalize Five Eyes travel advisory level to 0-1 score
/// Level 1 (safest) → 1.0, Level 4 (most dangerous) → 0.0
pub fn normalize_advisory(level: u8) -> f64 {
    match level {
        1 => 1.0,   // Exercise Normal Precautions
        2 => 0.66,  // Exercise Increased Caution
        3 => 0.33,  // Reconsider Travel
        4 => 0.0,   // Do Not Travel
        _ => 0.5,   // Unknown - neutral
    }
}

/// Normalize World Bank WGI indicator (-2.5 to +2.5) to 0-1 score
pub fn normalize_wgi(value: f64) -> f64 {
    // WGI ranges from -2.5 (worst) to +2.5 (best)
    ((value + 2.5) / 5.0).clamp(0.0, 1.0)
}

/// Normalize GDP per capita to 0-1 score
/// Uses log scale: $1k → 0.2, $10k → 0.5, $50k → 0.8, $100k+ → 1.0
pub fn normalize_gdp(gdp: f64) -> f64 {
    if gdp <= 0.0 {
        return 0.0;
    }
    // Log-scale normalization with $50k as "good" threshold
    let log_gdp = gdp.ln();
    let log_50k = 50_000_f64.ln(); // ~10.82
    let log_1k = 1_000_f64.ln();   // ~6.91

    let norm = (log_gdp - log_1k) / (log_50k - log_1k);
    norm.clamp(0.0, 1.0)
}

/// Country risk database - maps ISO country codes to risk data
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CountryRiskDatabase {
    /// Country risk data by ISO 3166-1 alpha-2 code
    pub countries: HashMap<String, CountryRisk>,
    /// Security scoring configuration
    pub config: SecurityConfig,
}

impl CountryRiskDatabase {
    /// Create new empty database
    pub fn new() -> Self {
        Self {
            countries: HashMap::new(),
            config: SecurityConfig::default(),
        }
    }

    /// Create database with built-in Five Eyes + high-traffic country data
    pub fn with_defaults() -> Self {
        let mut db = Self::new();
        db.load_default_data();
        db
    }

    /// Load default country risk data (Five Eyes + major infrastructure countries)
    pub fn load_default_data(&mut self) {
        // Five Eyes countries (Tier 1)
        self.add_country("US", "United States", 1, 0.5, 1.5, 1.3, 65_000.0);
        self.add_country("GB", "United Kingdom", 1, 0.6, 1.7, 1.8, 46_000.0);
        self.add_country("CA", "Canada", 1, 1.0, 1.8, 1.9, 52_000.0);
        self.add_country("AU", "Australia", 1, 1.1, 1.8, 1.8, 55_000.0);
        self.add_country("NZ", "New Zealand", 1, 1.5, 1.9, 2.2, 48_000.0);

        // Other Tier 1 countries
        self.add_country("SG", "Singapore", 1, 1.4, 1.8, 2.1, 65_000.0);
        self.add_country("JP", "Japan", 1, 1.0, 1.5, 1.5, 40_000.0);
        self.add_country("CH", "Switzerland", 1, 1.3, 1.9, 2.1, 92_000.0);
        self.add_country("IS", "Iceland", 1, 1.5, 1.9, 2.0, 68_000.0);
        self.add_country("NO", "Norway", 1, 1.3, 2.0, 2.2, 82_000.0);
        self.add_country("DK", "Denmark", 1, 1.0, 1.9, 2.3, 68_000.0);
        self.add_country("FI", "Finland", 1, 1.2, 2.0, 2.2, 54_000.0);
        self.add_country("SE", "Sweden", 1, 1.1, 1.9, 2.2, 56_000.0);
        self.add_country("NL", "Netherlands", 1, 0.9, 1.8, 2.0, 58_000.0);
        self.add_country("DE", "Germany", 1, 0.8, 1.6, 1.9, 51_000.0);
        self.add_country("AT", "Austria", 1, 1.0, 1.8, 1.6, 53_000.0);
        self.add_country("IE", "Ireland", 1, 1.1, 1.6, 1.6, 100_000.0);
        self.add_country("LU", "Luxembourg", 1, 1.3, 1.8, 2.0, 128_000.0);

        // Tier 2 (Moderate) countries - major infrastructure hubs
        self.add_country("AE", "United Arab Emirates", 1, 0.8, 0.8, 1.2, 44_000.0);
        self.add_country("QA", "Qatar", 1, 0.9, 0.8, 1.0, 68_000.0);
        self.add_country("KR", "South Korea", 1, 0.3, 1.2, 0.8, 35_000.0);
        self.add_country("TW", "Taiwan", 1, 0.7, 1.2, 1.0, 33_000.0);
        self.add_country("CL", "Chile", 1, 0.3, 1.1, 1.0, 16_000.0);
        self.add_country("UY", "Uruguay", 1, 0.8, 0.8, 1.1, 17_500.0);
        self.add_country("CZ", "Czech Republic", 1, 0.9, 1.1, 0.5, 27_000.0);
        self.add_country("PL", "Poland", 1, 0.6, 0.6, 0.5, 18_000.0);
        self.add_country("EE", "Estonia", 1, 0.7, 1.3, 1.5, 28_000.0);
        self.add_country("PT", "Portugal", 1, 0.9, 1.2, 1.0, 25_000.0);
        self.add_country("ES", "Spain", 1, 0.4, 1.0, 0.8, 30_000.0);
        self.add_country("FR", "France", 1, 0.3, 1.4, 1.3, 44_000.0);
        self.add_country("IT", "Italy", 2, 0.5, 0.4, 0.2, 35_000.0);
        self.add_country("GR", "Greece", 1, 0.3, 0.4, 0.0, 20_000.0);

        // Tier 3 (Elevated) - major emerging markets with infrastructure
        self.add_country("BR", "Brazil", 2, -0.4, -0.3, -0.4, 9_000.0);
        self.add_country("MX", "Mexico", 2, -0.7, -0.5, -0.7, 10_500.0);
        self.add_country("IN", "India", 2, -0.8, 0.0, -0.3, 2_500.0);
        self.add_country("ZA", "South Africa", 2, -0.2, 0.0, 0.0, 6_500.0);
        self.add_country("EG", "Egypt", 3, -1.2, -0.4, -0.5, 3_500.0);
        self.add_country("MY", "Malaysia", 1, 0.2, 0.5, 0.3, 12_000.0);
        self.add_country("TH", "Thailand", 2, -0.5, 0.0, -0.3, 7_500.0);
        self.add_country("ID", "Indonesia", 2, -0.4, -0.2, -0.2, 4_500.0);
        self.add_country("VN", "Vietnam", 1, 0.3, 0.0, -0.3, 4_000.0);
        self.add_country("PH", "Philippines", 2, -0.8, -0.3, -0.4, 3_500.0);
        self.add_country("TR", "Turkey", 3, -1.5, -0.3, -0.3, 10_000.0);
        self.add_country("SA", "Saudi Arabia", 2, -0.3, 0.2, 0.2, 23_000.0);
        self.add_country("IL", "Israel", 2, -1.0, 1.1, 1.0, 55_000.0);
        self.add_country("KE", "Kenya", 2, -1.1, -0.4, -0.8, 2_000.0);
        self.add_country("NG", "Nigeria", 3, -1.8, -0.8, -1.0, 2_200.0);
        self.add_country("GH", "Ghana", 1, 0.0, 0.0, -0.1, 2_400.0);

        // Tier 4/5 (High/Critical risk) - limited infrastructure placement
        self.add_country("PK", "Pakistan", 3, -2.2, -0.8, -0.8, 1_500.0);
        self.add_country("BD", "Bangladesh", 2, -1.0, -0.7, -1.0, 2_500.0);
        self.add_country("MM", "Myanmar", 4, -2.0, -1.5, -1.2, 1_200.0);
        self.add_country("VE", "Venezuela", 4, -1.8, -1.8, -1.5, 4_000.0);
        self.add_country("IR", "Iran", 4, -1.3, -1.0, -0.5, 4_000.0);
        self.add_country("RU", "Russia", 4, -1.0, -0.8, -0.8, 12_000.0);
        self.add_country("BY", "Belarus", 4, -0.3, -1.2, -0.5, 7_000.0);
        self.add_country("CN", "China", 2, -0.3, -0.2, -0.3, 12_500.0);

        // Tier 5 (Critical) - avoid for infrastructure
        self.add_country("AF", "Afghanistan", 4, -2.5, -2.0, -1.5, 500.0);
        self.add_country("SY", "Syria", 4, -2.8, -2.0, -1.5, 500.0);
        self.add_country("YE", "Yemen", 4, -2.8, -2.0, -1.5, 600.0);
        self.add_country("SO", "Somalia", 4, -2.5, -2.3, -1.5, 500.0);
        self.add_country("LY", "Libya", 4, -2.3, -1.8, -1.3, 6_000.0);
        self.add_country("SD", "Sudan", 4, -2.3, -1.5, -1.3, 700.0);
        self.add_country("SS", "South Sudan", 4, -2.5, -2.0, -1.5, 300.0);
        self.add_country("KP", "North Korea", 4, -0.5, -1.5, -1.5, 1_800.0);

        // Recalculate all scores
        self.recalculate_all_scores();
    }

    /// Add country with all risk data
    fn add_country(
        &mut self,
        code: &str,
        name: &str,
        advisory: u8,
        pol_stability: f64,
        rule_of_law: f64,
        corruption: f64,
        gdp: f64,
    ) {
        let mut risk = CountryRisk::new(code, name);
        risk.travel_advisory_level = Some(advisory);
        risk.political_stability = Some(pol_stability);
        risk.rule_of_law = Some(rule_of_law);
        risk.corruption_control = Some(corruption);
        risk.gdp_per_capita = Some(gdp);
        self.countries.insert(code.to_string(), risk);
    }

    /// Recalculate security scores for all countries
    pub fn recalculate_all_scores(&mut self) {
        let config = self.config.clone();
        for risk in self.countries.values_mut() {
            risk.calculate_score(&config);
        }
    }

    /// Get country risk by ISO code
    pub fn get(&self, country_code: &str) -> Option<&CountryRisk> {
        self.countries.get(&country_code.to_uppercase())
    }

    /// Get security score for country (returns default if not found)
    pub fn security_score(&self, country_code: &str) -> f64 {
        self.get(country_code)
            .map(|r| r.security_score)
            .unwrap_or(self.config.default_score)
    }
}

/// Reverse geocode latitude/longitude to ISO country code
/// Uses a simple bounding-box lookup for major countries
/// For production, use a proper geocoding service
pub fn reverse_geocode_country(lat: f64, lon: f64) -> Option<String> {
    // Major country bounding boxes (lat_min, lat_max, lon_min, lon_max, code)
    // This is a simplified lookup - production should use proper geocoding
    let bounds: &[(f64, f64, f64, f64, &str)] = &[
        // North America
        (24.5, 49.5, -125.0, -66.0, "US"),
        (41.5, 83.0, -141.0, -52.0, "CA"),
        (14.5, 32.7, -118.4, -86.7, "MX"),

        // Europe
        (49.0, 61.0, -8.0, 2.0, "GB"),
        (41.3, 51.1, -5.0, 9.6, "FR"),
        (47.3, 55.1, 5.9, 15.0, "DE"),
        (35.5, 47.1, 6.6, 18.5, "IT"),
        (36.0, 43.8, -9.5, 3.3, "ES"),
        (36.4, 42.0, -9.5, -6.2, "PT"),
        (50.8, 53.5, 3.4, 7.2, "NL"),
        (49.5, 51.5, 2.5, 6.4, "BE"),
        (45.8, 47.8, 5.9, 10.5, "CH"),
        (46.4, 49.0, 9.5, 17.2, "AT"),
        (55.0, 58.0, 8.0, 15.2, "DK"),
        (57.5, 70.1, 4.5, 31.1, "NO"),
        (55.3, 69.1, 11.1, 24.2, "SE"),
        (59.8, 70.1, 20.6, 31.6, "FI"),
        (63.3, 66.5, -24.5, -13.5, "IS"),
        (57.5, 59.7, 21.8, 28.2, "EE"),
        (55.7, 58.1, 21.0, 28.2, "LV"),
        (53.9, 56.5, 21.0, 26.8, "LT"),
        (49.0, 54.8, 14.1, 24.2, "PL"),
        (48.5, 51.1, 12.1, 18.9, "CZ"),
        (36.0, 42.0, 19.4, 29.6, "GR"),
        (41.2, 44.2, 19.3, 23.0, "AL"),

        // Middle East & Asia
        (22.6, 26.1, 51.0, 56.4, "AE"),
        (24.5, 26.2, 50.8, 51.6, "QA"),
        (16.4, 32.2, 34.9, 55.7, "SA"),
        (29.5, 33.3, 34.3, 35.9, "IL"),
        (22.0, 31.7, 24.7, 36.9, "EG"),
        (36.0, 42.1, 26.0, 44.8, "TR"),
        (25.1, 39.8, 44.0, 63.3, "IR"),
        (23.6, 37.1, 60.9, 77.8, "PK"),
        (6.7, 35.5, 68.2, 97.4, "IN"),
        (20.7, 26.6, 88.0, 92.7, "BD"),
        (5.9, 20.5, 97.3, 105.6, "TH"),
        // Singapore must come BEFORE Malaysia (it's within MY's bounding box)
        (1.15, 1.50, 103.6, 104.1, "SG"),
        (0.9, 7.4, 100.0, 119.3, "MY"),
        (4.6, 21.1, 102.1, 109.5, "VN"),
        (-11.0, 6.1, 95.0, 141.0, "ID"),
        (4.6, 21.1, 116.9, 126.6, "PH"),
        (18.2, 53.6, 73.7, 135.1, "CN"),
        (33.1, 43.0, 124.1, 131.9, "KR"),
        (30.0, 45.5, 129.4, 145.8, "JP"),
        (21.9, 25.3, 120.0, 122.0, "TW"),
        (37.6, 43.0, 124.2, 130.9, "KP"),

        // Oceania
        (-44.0, -10.0, 113.0, 154.0, "AU"),
        (-47.3, -34.4, 166.4, 178.6, "NZ"),

        // South America
        (-33.8, 5.3, -73.9, -34.8, "BR"),
        (-55.1, -21.8, -73.6, -53.6, "AR"),
        (-56.0, -17.5, -75.7, -66.4, "CL"),
        (-35.0, -30.1, -58.4, -53.1, "UY"),
        (0.4, 12.5, -79.0, -66.9, "VE"),
        (-4.2, 12.5, -79.0, -66.9, "CO"),
        (-18.4, -0.0, -81.3, -68.7, "PE"),
        (-22.9, -9.7, -69.6, -57.5, "BO"),
        (-27.6, -19.3, -62.6, -54.3, "PY"),
        (-5.0, 1.4, -81.1, -75.2, "EC"),

        // Africa
        (-34.8, -22.1, 16.5, 32.9, "ZA"),
        (-26.9, -17.8, 20.0, 33.0, "BW"),
        (-22.4, -15.6, 25.0, 33.1, "ZW"),
        (-4.7, 5.0, 29.0, 40.5, "KE"),
        (-11.7, -1.0, 29.0, 40.5, "TZ"),
        (4.5, 14.5, -17.5, 16.0, "SN"),
        (4.5, 13.9, -3.3, 1.2, "GH"),
        (4.3, 13.9, 2.7, 14.7, "NG"),
        (19.5, 37.3, -17.1, -1.0, "MA"),
        (19.0, 37.5, -8.7, 12.0, "DZ"),
        (30.2, 37.5, 7.5, 11.6, "TN"),
        (19.5, 33.2, 9.4, 25.2, "LY"),
        (-1.7, 23.5, 21.8, 36.9, "SD"),
        (3.5, 14.9, 23.4, 35.9, "SS"),
        (-11.7, 5.4, 11.7, 31.3, "CD"),
        (9.4, 18.0, -17.5, -11.4, "SN"),
    ];

    for &(lat_min, lat_max, lon_min, lon_max, code) in bounds {
        if lat >= lat_min && lat <= lat_max && lon >= lon_min && lon <= lon_max {
            return Some(code.to_string());
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_advisory() {
        assert_eq!(normalize_advisory(1), 1.0);
        assert_eq!(normalize_advisory(2), 0.66);
        assert_eq!(normalize_advisory(3), 0.33);
        assert_eq!(normalize_advisory(4), 0.0);
        assert_eq!(normalize_advisory(5), 0.5); // Unknown
    }

    #[test]
    fn test_normalize_wgi() {
        assert!((normalize_wgi(-2.5) - 0.0).abs() < 0.001);
        assert!((normalize_wgi(0.0) - 0.5).abs() < 0.001);
        assert!((normalize_wgi(2.5) - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_normalize_gdp() {
        // Very low GDP
        assert!(normalize_gdp(500.0) < 0.1);
        // $50k (good threshold)
        assert!((normalize_gdp(50_000.0) - 1.0).abs() < 0.1);
        // High GDP
        assert!(normalize_gdp(100_000.0) >= 1.0);
    }

    #[test]
    fn test_country_risk_database() {
        let db = CountryRiskDatabase::with_defaults();

        // Check Five Eyes countries have high scores
        let us = db.get("US").unwrap();
        assert!(us.security_score > 0.7);

        let nz = db.get("NZ").unwrap();
        assert!(nz.security_score > 0.85);

        // Check critical risk countries have low scores
        let af = db.get("AF").unwrap();
        assert!(af.security_score < 0.3);
    }

    #[test]
    fn test_risk_tiers() {
        assert_eq!(RiskTier::from_score(0.90), RiskTier::Tier1LowRisk);
        assert_eq!(RiskTier::from_score(0.75), RiskTier::Tier2Moderate);
        assert_eq!(RiskTier::from_score(0.55), RiskTier::Tier3Elevated);
        assert_eq!(RiskTier::from_score(0.40), RiskTier::Tier4HighRisk);
        assert_eq!(RiskTier::from_score(0.20), RiskTier::Tier5Critical);
    }

    #[test]
    fn test_reverse_geocode() {
        // New York
        assert_eq!(reverse_geocode_country(40.7128, -74.0060), Some("US".to_string()));
        // London
        assert_eq!(reverse_geocode_country(51.5074, -0.1278), Some("GB".to_string()));
        // Singapore
        assert_eq!(reverse_geocode_country(1.3521, 103.8198), Some("SG".to_string()));
        // Sydney
        assert_eq!(reverse_geocode_country(-33.8688, 151.2093), Some("AU".to_string()));
    }
}
