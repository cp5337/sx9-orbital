//! RFC-9XXX: Financial-Driven Optical Routing and Deterministic Transport Control
//!
//! Implements the canonical routing objective function:
//!   r*(p,t) = argmax_{r ∈ R(p)} U(p,r,t)
//!
//!   U(p,r,t) = V(p,t) - [λ_lat·Φ_L + λ_jit·Φ_J + λ_fail·Φ_F + λ_cong·Φ_C + λ_power·C_power + λ_opp·C_opp]
//!
//! Key principles (RFC Section 3):
//! - Determinism as first-class constraint
//! - All decisions replayable and bounded
//! - Cold-path learning only (Zone D)
//! - Single optimization primitive

use crate::{ConstellationGraph, ConstellationLink, LinkType, Result, GlafError};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1: SLA/QoS Types (RFC A.1)
// ══════════════════════════════════════════════════════════════════════════════

/// SLA tier for payload routing priority
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Hash)]
pub enum SlaTier {
    /// Gold: Lowest latency, highest reliability (financial, defense)
    Gold,
    /// Silver: Balanced performance/cost (enterprise)
    Silver,
    /// Bulk: Best effort (batch transfers)
    Bulk,
}

impl SlaTier {
    /// Base value multiplier for SLA tier (RFC A.4)
    /// Gold = 3.0, Silver = 1.5, Bulk = 1.0
    #[inline]
    pub fn alpha_tier(&self) -> f64 {
        match self {
            SlaTier::Gold => 3.000000000,
            SlaTier::Silver => 1.500000000,
            SlaTier::Bulk => 1.000000000,
        }
    }
}

/// Payload with SLA/QoS attributes (RFC A.1)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Payload {
    /// Unique payload identifier
    pub id: String,
    /// SLA tier
    pub sla_tier: SlaTier,
    /// Maximum allowable end-to-end latency (ms)
    pub l_max_ms: f64,
    /// Maximum allowable jitter/variance (ms²)
    pub j_max_ms2: f64,
    /// Maximum allowable failure probability (0-1)
    pub p_loss_max: f64,
    /// Time sensitivity / deadline constant (seconds)
    pub tau_seconds: f64,
    /// Optional deadline timestamp (Unix epoch ms)
    pub deadline_ms: Option<u64>,
}

impl Default for Payload {
    fn default() -> Self {
        Self {
            id: "default".to_string(),
            sla_tier: SlaTier::Silver,
            l_max_ms: 50.000000000,      // 50ms latency SLA
            j_max_ms2: 25.000000000,     // 5ms std dev squared
            p_loss_max: 0.001000000,     // 99.9% reliability
            tau_seconds: 60.000000000,   // 1 minute urgency constant
            deadline_ms: None,
        }
    }
}

impl Payload {
    pub fn gold(id: &str, l_max_ms: f64) -> Self {
        Self {
            id: id.to_string(),
            sla_tier: SlaTier::Gold,
            l_max_ms,
            j_max_ms2: 4.000000000,      // 2ms std dev
            p_loss_max: 0.000100000,     // 99.99% reliability
            tau_seconds: 10.000000000,   // Very time-sensitive
            deadline_ms: None,
        }
    }

    pub fn silver(id: &str, l_max_ms: f64) -> Self {
        Self {
            id: id.to_string(),
            sla_tier: SlaTier::Silver,
            l_max_ms,
            j_max_ms2: 25.000000000,
            p_loss_max: 0.001000000,
            tau_seconds: 60.000000000,
            deadline_ms: None,
        }
    }

    pub fn bulk(id: &str) -> Self {
        Self {
            id: id.to_string(),
            sla_tier: SlaTier::Bulk,
            l_max_ms: 200.000000000,     // 200ms acceptable
            j_max_ms2: 400.000000000,    // 20ms std dev
            p_loss_max: 0.010000000,     // 99% reliability
            tau_seconds: 3600.000000000, // 1 hour window
            deadline_ms: None,
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Coefficient Table with Versioning (RFC 10)
// ══════════════════════════════════════════════════════════════════════════════

/// Routing coefficients (λ values) with versioning and provenance
///
/// All coefficients use 9-decimal precision for deterministic computation.
/// Coefficients are promoted from cold-path calibration only after validation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingCoefficients {
    /// Latency penalty weight
    pub lambda_lat: f64,
    /// Jitter penalty weight
    pub lambda_jit: f64,
    /// Failure probability penalty weight
    pub lambda_fail: f64,
    /// Congestion penalty weight
    pub lambda_cong: f64,
    /// Power/wear cost weight
    pub lambda_power: f64,
    /// Opportunity cost weight
    pub lambda_opp: f64,

    // ── Versioning & Provenance ──
    /// Coefficient version (monotonic)
    pub version: u64,
    /// SHA-256 hash of coefficient values (first 16 bytes as hex)
    pub version_hash: String,
    /// Timestamp of last promotion (Unix epoch ms)
    pub promoted_at_ms: u64,
    /// Source of coefficients (e.g., "diurnal_calibration", "manual", "default")
    pub source: String,
}

impl Default for RoutingCoefficients {
    fn default() -> Self {
        let coeffs = Self {
            // Default weights balanced for general operation
            lambda_lat: 0.300000000,   // 30% weight on latency
            lambda_jit: 0.100000000,   // 10% on jitter
            lambda_fail: 0.250000000,  // 25% on failure probability
            lambda_cong: 0.150000000,  // 15% on congestion
            lambda_power: 0.100000000, // 10% on power cost
            lambda_opp: 0.100000000,   // 10% on opportunity cost
            version: 1,
            version_hash: String::new(),
            promoted_at_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            source: "default".to_string(),
        };
        coeffs.with_computed_hash()
    }
}

impl RoutingCoefficients {
    /// Create coefficients optimized for latency-sensitive workloads (trading, defense)
    pub fn latency_optimized() -> Self {
        Self {
            lambda_lat: 0.450000000,
            lambda_jit: 0.200000000,
            lambda_fail: 0.150000000,
            lambda_cong: 0.100000000,
            lambda_power: 0.050000000,
            lambda_opp: 0.050000000,
            version: 1,
            version_hash: String::new(),
            promoted_at_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            source: "latency_optimized".to_string(),
        }.with_computed_hash()
    }

    /// Create coefficients optimized for reliability (critical infrastructure)
    pub fn reliability_optimized() -> Self {
        Self {
            lambda_lat: 0.150000000,
            lambda_jit: 0.100000000,
            lambda_fail: 0.400000000,
            lambda_cong: 0.200000000,
            lambda_power: 0.075000000,
            lambda_opp: 0.075000000,
            version: 1,
            version_hash: String::new(),
            promoted_at_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            source: "reliability_optimized".to_string(),
        }.with_computed_hash()
    }

    /// Create coefficients optimized for cost efficiency (bulk transfers)
    pub fn cost_optimized() -> Self {
        Self {
            lambda_lat: 0.100000000,
            lambda_jit: 0.050000000,
            lambda_fail: 0.150000000,
            lambda_cong: 0.200000000,
            lambda_power: 0.300000000,
            lambda_opp: 0.200000000,
            version: 1,
            version_hash: String::new(),
            promoted_at_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            source: "cost_optimized".to_string(),
        }.with_computed_hash()
    }

    /// Compute version hash from coefficient values
    fn with_computed_hash(mut self) -> Self {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        // Hash each coefficient as bits for determinism
        self.lambda_lat.to_bits().hash(&mut hasher);
        self.lambda_jit.to_bits().hash(&mut hasher);
        self.lambda_fail.to_bits().hash(&mut hasher);
        self.lambda_cong.to_bits().hash(&mut hasher);
        self.lambda_power.to_bits().hash(&mut hasher);
        self.lambda_opp.to_bits().hash(&mut hasher);
        self.version.hash(&mut hasher);

        self.version_hash = format!("{:016x}", hasher.finish());
        self
    }

    /// Validate coefficients sum to 1.0 (within tolerance)
    pub fn validate(&self) -> Result<()> {
        let sum = self.lambda_lat + self.lambda_jit + self.lambda_fail
            + self.lambda_cong + self.lambda_power + self.lambda_opp;

        if (sum - 1.0).abs() > 0.000001 {
            return Err(GlafError::InvalidState(
                format!("Coefficient sum {} != 1.0", sum)
            ));
        }

        // All coefficients must be non-negative
        if self.lambda_lat < 0.0 || self.lambda_jit < 0.0 || self.lambda_fail < 0.0
            || self.lambda_cong < 0.0 || self.lambda_power < 0.0 || self.lambda_opp < 0.0 {
            return Err(GlafError::InvalidState(
                "Coefficients must be non-negative".to_string()
            ));
        }

        Ok(())
    }

    /// Promote new coefficients from calibration (RFC 10)
    /// Returns new version with incremented version number
    pub fn promote(mut self, source: &str) -> Self {
        self.version += 1;
        self.source = source.to_string();
        self.promoted_at_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        self.with_computed_hash()
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3: Route Metrics (RFC A.1 - Edge/Route Metrics)
// ══════════════════════════════════════════════════════════════════════════════

/// Aggregated metrics for a candidate route
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteMetrics {
    /// Expected end-to-end latency (ms) - μ_L(r,t)
    pub mu_latency_ms: f64,
    /// End-to-end latency variance (ms²) - σ²_L(r,t)
    pub sigma2_latency_ms2: f64,
    /// End-to-end failure probability - π_F(r,t)
    pub pi_failure: f64,
    /// Congestion/load factor (0-1) - κ(r,t)
    pub kappa_congestion: f64,
    /// Power/wear cost - C_power(r,t)
    pub c_power: f64,
    /// Opportunity cost - C_opp(r,t)
    pub c_opportunity: f64,
    /// Path as node IDs
    pub path: Vec<String>,
    /// Number of hops
    pub hop_count: usize,
    /// Minimum margin along path (dB)
    pub min_margin_db: f64,
    /// Weather factor product
    pub weather_factor: f64,
    /// Throughput capacity (Gbps)
    pub throughput_gbps: f64,
}

impl RouteMetrics {
    /// Compose route metrics from individual link metrics (RFC A.5)
    pub fn from_path(path: &[String], graph: &ConstellationGraph) -> Option<Self> {
        if path.len() < 2 {
            return None;
        }

        let mut mu_latency = 0.0;
        let mut sigma2_latency = 0.0;
        let mut pi_success_product = 1.0;
        let mut total_power = 0.0;
        let mut weather_product = 1.0;
        let mut min_margin = f64::MAX;
        let mut min_throughput = f64::MAX;
        let mut link_count = 0;
        let mut total_capacity = 0.0;
        let mut total_load = 0.0;

        for i in 0..path.len() - 1 {
            let from = &path[i];
            let to = &path[i + 1];

            let link = graph.links()
                .find(|(s, t, _)| {
                    (s.id == *from && t.id == *to) || (s.id == *to && t.id == *from)
                })
                .map(|(_, _, l)| l)?;

            if !link.active {
                return None;
            }

            // Latency: additive (RFC A.5)
            mu_latency += link.latency_ms;

            // Variance: additive under weak correlation (RFC A.5)
            // Estimate variance as 10% of latency squared
            let link_variance = (link.latency_ms * 0.1).powi(2);
            sigma2_latency += link_variance;

            // Failure probability: 1 - Π(1 - π_i) (RFC A.5)
            // Estimate per-link failure from weather and margin
            let link_failure_prob = Self::estimate_link_failure(link);
            pi_success_product *= 1.0 - link_failure_prob;

            // Power cost: sum of link power consumption
            total_power += Self::estimate_link_power(link);

            // Weather product
            weather_product *= link.weather_score;

            // Track minimums
            min_margin = min_margin.min(link.margin_db);
            min_throughput = min_throughput.min(link.throughput_gbps);

            // Congestion tracking
            total_capacity += link.throughput_gbps;
            // Assume 50% average utilization (would be dynamic in production)
            total_load += link.throughput_gbps * 0.5;

            link_count += 1;
        }

        if link_count == 0 {
            return None;
        }

        // Congestion factor κ = load / capacity
        let kappa_congestion = if total_capacity > 0.0 {
            (total_load / total_capacity).min(1.0)
        } else {
            1.0
        };

        // Opportunity cost: foregone capacity value
        // Higher when route uses high-value links
        let c_opportunity = Self::estimate_opportunity_cost(min_throughput, link_count);

        Some(RouteMetrics {
            mu_latency_ms: mu_latency,
            sigma2_latency_ms2: sigma2_latency,
            pi_failure: 1.0 - pi_success_product,
            kappa_congestion,
            c_power: total_power,
            c_opportunity,
            path: path.to_vec(),
            hop_count: link_count,
            min_margin_db: min_margin,
            weather_factor: weather_product,
            throughput_gbps: min_throughput,
        })
    }

    /// Estimate link failure probability from margin and weather
    fn estimate_link_failure(link: &ConstellationLink) -> f64 {
        // Base failure rate (per link, per routing decision)
        let base_failure: f64 = 0.0001; // 0.01% base

        // Margin impact: lower margin = higher failure
        // Below 3dB is critical
        let margin_factor = if link.margin_db < 3.0 {
            5.0 // 5x failure rate
        } else if link.margin_db < 6.0 {
            2.0 // 2x failure rate
        } else {
            1.0
        };

        // Weather impact: poor weather = higher failure
        let weather_factor = if link.weather_score < 0.5 {
            10.0
        } else if link.weather_score < 0.8 {
            2.0
        } else {
            1.0
        };

        (base_failure * margin_factor * weather_factor).min(0.5)
    }

    /// Estimate link power consumption
    fn estimate_link_power(link: &ConstellationLink) -> f64 {
        // Base power per link type
        let base_power = match link.link_type {
            LinkType::InterSatellite => 0.5,       // 0.5 units for ISL
            LinkType::SatelliteToGround => 0.3,   // 0.3 units for downlink
            LinkType::Terrestrial => 0.4,
        };

        // Higher throughput = more power
        let throughput_factor = 1.0 + (link.throughput_gbps / 100.0);

        base_power * throughput_factor
    }

    /// Estimate opportunity cost
    fn estimate_opportunity_cost(throughput_gbps: f64, hop_count: usize) -> f64 {
        // Higher throughput links have higher opportunity cost
        // More hops = more resources consumed
        let throughput_value = throughput_gbps * 0.01; // $0.01 per Gbps
        throughput_value * hop_count as f64
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4: Penalty Functions (RFC A.3)
// ══════════════════════════════════════════════════════════════════════════════

/// Penalty function results with diagnostic details
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PenaltyResult {
    /// Penalty value (0 if within SLA, positive if violated)
    pub value: f64,
    /// Whether SLA is violated
    pub violated: bool,
    /// Observed value
    pub observed: f64,
    /// Threshold value
    pub threshold: f64,
    /// Penalty type
    pub penalty_type: String,
}

/// Calculate penalty functions Φ (RFC A.3)
pub struct PenaltyCalculator;

impl PenaltyCalculator {
    /// Latency penalty Φ_L (RFC A.3.1)
    /// Φ_L(p,r,t) = max(0, μ_L(r,t) - L_max_p)
    #[inline]
    pub fn phi_latency(metrics: &RouteMetrics, payload: &Payload) -> PenaltyResult {
        let observed = metrics.mu_latency_ms;
        let threshold = payload.l_max_ms;
        let penalty = (observed - threshold).max(0.0);

        PenaltyResult {
            value: penalty,
            violated: penalty > 0.0,
            observed,
            threshold,
            penalty_type: "latency".to_string(),
        }
    }

    /// Jitter/variance penalty Φ_J (RFC A.3.2)
    /// Φ_J(p,r,t) = max(0, σ²_L(r,t) - (J_max_p)²)
    #[inline]
    pub fn phi_jitter(metrics: &RouteMetrics, payload: &Payload) -> PenaltyResult {
        let observed = metrics.sigma2_latency_ms2;
        let threshold = payload.j_max_ms2;
        let penalty = (observed - threshold).max(0.0);

        PenaltyResult {
            value: penalty,
            violated: penalty > 0.0,
            observed,
            threshold,
            penalty_type: "jitter".to_string(),
        }
    }

    /// Failure probability penalty Φ_F (RFC A.3.3)
    /// Φ_F(p,r,t) = max(0, π_F(r,t) - P_loss_max_p)
    #[inline]
    pub fn phi_failure(metrics: &RouteMetrics, payload: &Payload) -> PenaltyResult {
        let observed = metrics.pi_failure;
        let threshold = payload.p_loss_max;
        let penalty = (observed - threshold).max(0.0);

        PenaltyResult {
            value: penalty,
            violated: penalty > 0.0,
            observed,
            threshold,
            penalty_type: "failure".to_string(),
        }
    }

    /// Congestion penalty Φ_C (RFC A.3.4)
    /// Φ_C(p,r,t) = κ(r,t)
    #[inline]
    pub fn phi_congestion(metrics: &RouteMetrics) -> PenaltyResult {
        let observed = metrics.kappa_congestion;
        // Congestion is always a penalty (no threshold)
        PenaltyResult {
            value: observed,
            violated: observed > 0.8, // Flag high congestion
            observed,
            threshold: 0.8,
            penalty_type: "congestion".to_string(),
        }
    }

    /// Calculate all penalties for a route
    pub fn calculate_all(
        metrics: &RouteMetrics,
        payload: &Payload,
    ) -> AllPenalties {
        AllPenalties {
            latency: Self::phi_latency(metrics, payload),
            jitter: Self::phi_jitter(metrics, payload),
            failure: Self::phi_failure(metrics, payload),
            congestion: Self::phi_congestion(metrics),
            power: metrics.c_power,
            opportunity: metrics.c_opportunity,
        }
    }
}

/// All penalty values for a route
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllPenalties {
    pub latency: PenaltyResult,
    pub jitter: PenaltyResult,
    pub failure: PenaltyResult,
    pub congestion: PenaltyResult,
    pub power: f64,
    pub opportunity: f64,
}

impl AllPenalties {
    /// Check if any hard constraint is violated
    pub fn any_violated(&self) -> bool {
        self.latency.violated || self.jitter.violated || self.failure.violated
    }

    /// Count number of violations
    pub fn violation_count(&self) -> usize {
        [self.latency.violated, self.jitter.violated, self.failure.violated, self.congestion.violated]
            .iter()
            .filter(|&&v| v)
            .count()
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 5: Value Function (RFC A.4)
// ══════════════════════════════════════════════════════════════════════════════

/// Value function calculator
pub struct ValueFunction;

impl ValueFunction {
    /// Calculate payload value V(p,t) (RFC A.4)
    /// V(p,t) = α_tier(SLA_p) · w(τ_p, t)
    pub fn calculate(payload: &Payload, current_time_ms: u64) -> f64 {
        let alpha = payload.sla_tier.alpha_tier();
        let urgency = Self::urgency_weight(payload, current_time_ms);

        alpha * urgency
    }

    /// Urgency weight function w(τ_p, t) (RFC A.4)
    /// w(τ_p, t) = 1 + β · exp(-Δt / τ_p)
    /// where Δt = time to deadline
    fn urgency_weight(payload: &Payload, current_time_ms: u64) -> f64 {
        const BETA: f64 = 2.000000000; // Urgency amplification factor

        if let Some(deadline) = payload.deadline_ms {
            if deadline > current_time_ms {
                let delta_t_sec = (deadline - current_time_ms) as f64 / 1000.0;
                let tau = payload.tau_seconds;

                // Urgency increases as deadline approaches
                1.0 + BETA * (-delta_t_sec / tau).exp()
            } else {
                // Past deadline - maximum urgency
                1.0 + BETA
            }
        } else {
            // No deadline - base urgency based on SLA tier
            match payload.sla_tier {
                SlaTier::Gold => 1.5,
                SlaTier::Silver => 1.2,
                SlaTier::Bulk => 1.0,
            }
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 6: Unified Objective Function (RFC A.2)
// ══════════════════════════════════════════════════════════════════════════════

/// Result of objective function evaluation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectiveResult {
    /// Utility value U(p,r,t)
    pub utility: f64,
    /// Value component V(p,t)
    pub value: f64,
    /// Total weighted penalty
    pub total_penalty: f64,
    /// Breakdown of penalties
    pub penalties: AllPenalties,
    /// Coefficient version used
    pub coefficient_version: u64,
    /// Route metrics
    pub metrics: RouteMetrics,
    /// Whether route is viable (no hard constraint violations)
    pub viable: bool,
}

/// RFC-compliant objective function calculator
pub struct ObjectiveFunction {
    coefficients: RoutingCoefficients,
}

impl ObjectiveFunction {
    pub fn new(coefficients: RoutingCoefficients) -> Self {
        Self { coefficients }
    }

    pub fn with_default_coefficients() -> Self {
        Self::new(RoutingCoefficients::default())
    }

    pub fn coefficients(&self) -> &RoutingCoefficients {
        &self.coefficients
    }

    /// Calculate U(p,r,t) for a route (RFC A.2)
    ///
    /// U(p,r,t) = V(p,t) - [λ_lat·Φ_L + λ_jit·Φ_J + λ_fail·Φ_F + λ_cong·Φ_C + λ_power·C_power + λ_opp·C_opp]
    pub fn evaluate(
        &self,
        metrics: &RouteMetrics,
        payload: &Payload,
        current_time_ms: u64,
    ) -> ObjectiveResult {
        // Calculate value V(p,t)
        let value = ValueFunction::calculate(payload, current_time_ms);

        // Calculate all penalties
        let penalties = PenaltyCalculator::calculate_all(metrics, payload);

        // Compute weighted penalty sum
        let total_penalty =
            self.coefficients.lambda_lat * penalties.latency.value
            + self.coefficients.lambda_jit * penalties.jitter.value
            + self.coefficients.lambda_fail * penalties.failure.value
            + self.coefficients.lambda_cong * penalties.congestion.value
            + self.coefficients.lambda_power * penalties.power
            + self.coefficients.lambda_opp * penalties.opportunity;

        // U = V - Σ(λ·Φ)
        let utility = value - total_penalty;

        // Check viability before moving penalties
        let viable = !penalties.any_violated();

        ObjectiveResult {
            utility,
            value,
            total_penalty,
            penalties,
            coefficient_version: self.coefficients.version,
            metrics: metrics.clone(),
            viable,
        }
    }

    /// Find optimal route from candidates (RFC 5)
    /// r*(p,t) = argmax_{r ∈ R(p)} U(p,r,t)
    pub fn select_optimal<'a>(
        &self,
        candidates: &'a [RouteMetrics],
        payload: &Payload,
        current_time_ms: u64,
    ) -> Option<(ObjectiveResult, &'a RouteMetrics)> {
        candidates.iter()
            .map(|metrics| {
                let result = self.evaluate(metrics, payload, current_time_ms);
                (result, metrics)
            })
            .filter(|(result, _)| result.viable) // Only consider viable routes
            .max_by(|(a, _), (b, _)| {
                a.utility.partial_cmp(&b.utility).unwrap_or(std::cmp::Ordering::Equal)
            })
    }

    /// Evaluate all candidates and rank them
    pub fn rank_candidates(
        &self,
        candidates: &[RouteMetrics],
        payload: &Payload,
        current_time_ms: u64,
    ) -> Vec<ObjectiveResult> {
        let mut results: Vec<_> = candidates.iter()
            .map(|metrics| self.evaluate(metrics, payload, current_time_ms))
            .collect();

        // Sort by utility descending
        results.sort_by(|a, b| b.utility.partial_cmp(&a.utility).unwrap_or(std::cmp::Ordering::Equal));

        results
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 7: Diurnal Lossiness Tracking (RFC A.6)
// ══════════════════════════════════════════════════════════════════════════════

/// GLAF bucket for regime classification (RFC A.6.3)
#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, Deserialize)]
pub struct GlafBucket {
    /// Orbital phase (0-359 degrees, bucketed to 15-degree intervals)
    pub orbital_phase: u16,
    /// Link class (ISL, SG_TIER1, SG_TIER2, SG_TIER3)
    pub link_class: String,
    /// Weather regime (CLEAR, DEGRADED, SEVERE)
    pub weather_regime: String,
    /// Load regime (LOW, MEDIUM, HIGH)
    pub load_regime: String,
    /// Time band (hour of day, 0-23)
    pub time_band: u8,
}

impl GlafBucket {
    pub fn new(
        orbital_phase_deg: f64,
        link_class: &str,
        weather_score: f64,
        load_factor: f64,
        hour_of_day: u8,
    ) -> Self {
        // Bucket orbital phase to 15-degree intervals
        let orbital_phase = ((orbital_phase_deg / 15.0).floor() as u16 * 15) % 360;

        // Classify weather regime
        let weather_regime = if weather_score >= 0.8 {
            "CLEAR"
        } else if weather_score >= 0.5 {
            "DEGRADED"
        } else {
            "SEVERE"
        }.to_string();

        // Classify load regime
        let load_regime = if load_factor < 0.3 {
            "LOW"
        } else if load_factor < 0.7 {
            "MEDIUM"
        } else {
            "HIGH"
        }.to_string();

        Self {
            orbital_phase,
            link_class: link_class.to_string(),
            weather_regime,
            load_regime,
            time_band: hour_of_day,
        }
    }
}

/// Lossiness observation for a prediction (RFC A.6.1)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LossinessObservation {
    /// Bucket this observation belongs to
    pub bucket: GlafBucket,
    /// Metric type (latency, failure, etc.)
    pub metric: String,
    /// Predicted value
    pub predicted: f64,
    /// Observed value
    pub observed: f64,
    /// Normalized deviation ΔX̂
    pub delta_normalized: f64,
    /// Timestamp
    pub timestamp_ms: u64,
}

impl LossinessObservation {
    pub fn new(
        bucket: GlafBucket,
        metric: &str,
        predicted: f64,
        observed: f64,
        scale: f64,
    ) -> Self {
        // ΔX_b(d) = Pred(X|b,d) - Obs(X|b,d)
        let delta = predicted - observed;

        // Normalize: ΔX̂_b(d) = ΔX_b(d) / max(ε, Scale)
        let epsilon = 0.001;
        let delta_normalized = delta / scale.max(epsilon);

        Self {
            bucket,
            metric: metric.to_string(),
            predicted,
            observed,
            delta_normalized,
            timestamp_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        }
    }
}

/// Diurnal lossiness tracker (RFC 8)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LossinessTracker {
    /// Observations by bucket
    observations: HashMap<GlafBucket, Vec<LossinessObservation>>,
    /// Maximum observations per bucket
    max_per_bucket: usize,
    /// Drift threshold for coefficient review
    drift_threshold: f64,
    /// Error threshold for rollback
    rollback_threshold: f64,
    /// Error threshold for promotion
    promotion_threshold: f64,
}

impl Default for LossinessTracker {
    fn default() -> Self {
        Self {
            observations: HashMap::new(),
            max_per_bucket: 1000,
            drift_threshold: 0.100000000,    // 10% drift triggers review
            rollback_threshold: 0.300000000, // 30% error triggers rollback
            promotion_threshold: 0.050000000, // 5% error allows promotion
        }
    }
}

impl LossinessTracker {
    /// Record an observation
    pub fn record(&mut self, obs: LossinessObservation) {
        let bucket = obs.bucket.clone();
        let observations = self.observations.entry(bucket).or_insert_with(Vec::new);

        observations.push(obs);

        // Trim old observations
        if observations.len() > self.max_per_bucket {
            observations.drain(0..observations.len() - self.max_per_bucket);
        }
    }

    /// Calculate drift for a bucket (RFC A.6.2)
    /// Drift_b(d) = ΔX̂_b(d) - ΔX̂_b(d-1)
    pub fn calculate_drift(&self, bucket: &GlafBucket) -> Option<f64> {
        let observations = self.observations.get(bucket)?;

        if observations.len() < 2 {
            return None;
        }

        let latest = observations.last()?;
        let previous = observations.get(observations.len() - 2)?;

        Some(latest.delta_normalized - previous.delta_normalized)
    }

    /// Calculate mean absolute error for a bucket
    pub fn calculate_mae(&self, bucket: &GlafBucket) -> Option<f64> {
        let observations = self.observations.get(bucket)?;

        if observations.is_empty() {
            return None;
        }

        let sum: f64 = observations.iter()
            .map(|o| o.delta_normalized.abs())
            .sum();

        Some(sum / observations.len() as f64)
    }

    /// Check if coefficients should be promoted (RFC A.7.2)
    pub fn should_promote(&self, bucket: &GlafBucket) -> bool {
        if let (Some(mae), Some(drift)) = (self.calculate_mae(bucket), self.calculate_drift(bucket)) {
            mae <= self.promotion_threshold && drift.abs() <= self.drift_threshold
        } else {
            false
        }
    }

    /// Check if coefficients should be rolled back
    pub fn should_rollback(&self, bucket: &GlafBucket) -> bool {
        if let Some(mae) = self.calculate_mae(bucket) {
            mae > self.rollback_threshold
        } else {
            false
        }
    }

    /// Get summary statistics for all buckets
    pub fn summary(&self) -> LossinessSummary {
        let mut bucket_stats = Vec::new();

        for (bucket, observations) in &self.observations {
            let mae = self.calculate_mae(bucket);
            let drift = self.calculate_drift(bucket);

            bucket_stats.push(BucketStats {
                bucket: bucket.clone(),
                observation_count: observations.len(),
                mae,
                drift,
                should_promote: self.should_promote(bucket),
                should_rollback: self.should_rollback(bucket),
            });
        }

        LossinessSummary {
            total_observations: self.observations.values().map(|v| v.len()).sum(),
            bucket_count: self.observations.len(),
            bucket_stats,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketStats {
    pub bucket: GlafBucket,
    pub observation_count: usize,
    pub mae: Option<f64>,
    pub drift: Option<f64>,
    pub should_promote: bool,
    pub should_rollback: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LossinessSummary {
    pub total_observations: usize,
    pub bucket_count: usize,
    pub bucket_stats: Vec<BucketStats>,
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 8: Tests
// ══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_coefficient_validation() {
        let coeffs = RoutingCoefficients::default();
        assert!(coeffs.validate().is_ok(), "Default coefficients should validate");

        // Test that sum != 1.0 fails
        let mut bad_coeffs = coeffs.clone();
        bad_coeffs.lambda_lat = 0.5;
        assert!(bad_coeffs.validate().is_err(), "Invalid sum should fail");
    }

    #[test]
    fn test_coefficient_versioning() {
        let coeffs1 = RoutingCoefficients::default();
        let coeffs2 = coeffs1.clone().promote("test");

        assert_eq!(coeffs2.version, coeffs1.version + 1);
        assert_ne!(coeffs2.version_hash, coeffs1.version_hash);
        assert_eq!(coeffs2.source, "test");
    }

    #[test]
    fn test_penalty_functions() {
        let payload = Payload::silver("test", 50.0);

        // Create metrics within SLA
        let good_metrics = RouteMetrics {
            mu_latency_ms: 30.0,  // Under 50ms SLA
            sigma2_latency_ms2: 10.0,
            pi_failure: 0.0005,  // Under 0.001 SLA
            kappa_congestion: 0.3,
            c_power: 1.0,
            c_opportunity: 0.5,
            path: vec!["A".to_string(), "B".to_string()],
            hop_count: 1,
            min_margin_db: 8.0,
            weather_factor: 0.9,
            throughput_gbps: 10.0,
        };

        let penalties = PenaltyCalculator::calculate_all(&good_metrics, &payload);
        assert!(!penalties.latency.violated, "Latency should not be violated");
        assert!(!penalties.failure.violated, "Failure should not be violated");
        assert_eq!(penalties.latency.value, 0.0, "Latency penalty should be 0");

        // Create metrics violating SLA
        let bad_metrics = RouteMetrics {
            mu_latency_ms: 75.0,  // Over 50ms SLA
            sigma2_latency_ms2: 10.0,
            pi_failure: 0.005,  // Over 0.001 SLA
            kappa_congestion: 0.3,
            c_power: 1.0,
            c_opportunity: 0.5,
            path: vec!["A".to_string(), "B".to_string()],
            hop_count: 1,
            min_margin_db: 8.0,
            weather_factor: 0.9,
            throughput_gbps: 10.0,
        };

        let bad_penalties = PenaltyCalculator::calculate_all(&bad_metrics, &payload);
        assert!(bad_penalties.latency.violated, "Latency should be violated");
        assert!(bad_penalties.failure.violated, "Failure should be violated");
        assert_eq!(bad_penalties.latency.value, 25.0, "Latency penalty should be 25ms overage");
    }

    #[test]
    fn test_value_function() {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        // Gold tier should have higher value than bulk
        let gold = Payload::gold("gold", 30.0);
        let bulk = Payload::bulk("bulk");

        let gold_value = ValueFunction::calculate(&gold, now_ms);
        let bulk_value = ValueFunction::calculate(&bulk, now_ms);

        assert!(gold_value > bulk_value, "Gold should have higher value than bulk");
    }

    #[test]
    fn test_objective_function() {
        let objective = ObjectiveFunction::with_default_coefficients();
        let payload = Payload::silver("test", 50.0);
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        // Good route
        let good_metrics = RouteMetrics {
            mu_latency_ms: 30.0,
            sigma2_latency_ms2: 10.0,
            pi_failure: 0.0005,
            kappa_congestion: 0.3,
            c_power: 1.0,
            c_opportunity: 0.5,
            path: vec!["A".to_string(), "B".to_string()],
            hop_count: 1,
            min_margin_db: 8.0,
            weather_factor: 0.9,
            throughput_gbps: 10.0,
        };

        let result = objective.evaluate(&good_metrics, &payload, now_ms);
        assert!(result.viable, "Good route should be viable");
        assert!(result.utility > 0.0, "Good route should have positive utility");

        // Bad route
        let bad_metrics = RouteMetrics {
            mu_latency_ms: 150.0,
            sigma2_latency_ms2: 100.0,
            pi_failure: 0.01,
            kappa_congestion: 0.9,
            c_power: 5.0,
            c_opportunity: 3.0,
            path: vec!["A".to_string(), "B".to_string()],
            hop_count: 5,
            min_margin_db: 2.0,
            weather_factor: 0.3,
            throughput_gbps: 1.0,
        };

        let bad_result = objective.evaluate(&bad_metrics, &payload, now_ms);
        assert!(!bad_result.viable, "Bad route should not be viable");
        assert!(bad_result.utility < result.utility, "Bad route should have lower utility");
    }

    #[test]
    fn test_optimal_selection() {
        let objective = ObjectiveFunction::with_default_coefficients();
        let payload = Payload::silver("test", 50.0);
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let candidates = vec![
            RouteMetrics {
                mu_latency_ms: 30.0,
                sigma2_latency_ms2: 10.0,
                pi_failure: 0.0005,
                kappa_congestion: 0.3,
                c_power: 1.0,
                c_opportunity: 0.5,
                path: vec!["A".to_string(), "B".to_string()],
                hop_count: 1,
                min_margin_db: 8.0,
                weather_factor: 0.9,
                throughput_gbps: 10.0,
            },
            RouteMetrics {
                mu_latency_ms: 20.0,  // Better latency
                sigma2_latency_ms2: 5.0,
                pi_failure: 0.0003,
                kappa_congestion: 0.2,
                c_power: 0.8,
                c_opportunity: 0.4,
                path: vec!["A".to_string(), "C".to_string(), "B".to_string()],
                hop_count: 2,
                min_margin_db: 10.0,
                weather_factor: 0.95,
                throughput_gbps: 15.0,
            },
        ];

        let (best_result, best_metrics) = objective.select_optimal(&candidates, &payload, now_ms)
            .expect("Should find optimal route");

        assert!(best_result.viable);
        assert_eq!(best_metrics.mu_latency_ms, 20.0, "Should select route with better metrics");
    }

    #[test]
    fn test_lossiness_tracking() {
        let mut tracker = LossinessTracker::default();

        let bucket = GlafBucket::new(45.0, "ISL", 0.9, 0.4, 14);

        // Record some observations
        tracker.record(LossinessObservation::new(
            bucket.clone(), "latency", 30.0, 32.0, 50.0
        ));
        tracker.record(LossinessObservation::new(
            bucket.clone(), "latency", 31.0, 30.0, 50.0
        ));

        let mae = tracker.calculate_mae(&bucket);
        assert!(mae.is_some());

        let drift = tracker.calculate_drift(&bucket);
        assert!(drift.is_some());

        let summary = tracker.summary();
        assert_eq!(summary.bucket_count, 1);
        assert_eq!(summary.total_observations, 2);
    }

    #[test]
    fn test_glaf_bucket_creation() {
        let bucket = GlafBucket::new(47.3, "sat-ground", 0.85, 0.35, 10);

        assert_eq!(bucket.orbital_phase, 45); // Bucketed to 15-degree interval
        assert_eq!(bucket.weather_regime, "CLEAR");
        assert_eq!(bucket.load_regime, "MEDIUM");
        assert_eq!(bucket.time_band, 10);
    }
}
