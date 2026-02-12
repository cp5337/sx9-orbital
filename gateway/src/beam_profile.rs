//! Beam Profile and Pass Quality Assessment
//!
//! Models FSO laser beam characteristics:
//! - Leading edge focal point (best QoS)
//! - Trailing edge degradation (CTAS mesh, key transfer)
//!
//! Identifies passes viable for key distribution even when
//! below normal QoS thresholds.

use serde::{Deserialize, Serialize};
use sx9_foundation_primitives::{Nano9, NANO};

// ============================================================================
// QoS Thresholds (Nano9 scaled, 1.0 = 100%)
// ============================================================================

/// Prime tier - full bandwidth, leading edge focal
pub const QOS_PRIME: Nano9 = Nano9(850_000_000);      // 85%+
/// Standard tier - normal operations
pub const QOS_STANDARD: Nano9 = Nano9(600_000_000);   // 60-85%
/// Degraded - key transfer viable, CTAS mesh
pub const QOS_DEGRADED: Nano9 = Nano9(400_000_000);   // 40-60%
/// Key-viable minimum - can still complete key passes
pub const QOS_KEY_VIABLE: Nano9 = Nano9(200_000_000); // 20-40%
/// Telemetry only - Ka-band fallback
pub const QOS_TELEMETRY: Nano9 = Nano9(100_000_000);  // 10-20%
/// No link
pub const QOS_NO_LINK: Nano9 = Nano9(0);              // <10%

// ============================================================================
// Beam Profile
// ============================================================================

/// Beam zone within the laser footprint
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BeamZone {
    /// Leading edge focal point - maximum power
    Focal,
    /// Center core - excellent quality
    Core,
    /// Transition zone - degrading
    Transition,
    /// Trailing edge - ragged, key-viable
    Trailing,
    /// Outside beam - no link
    Outside,
}

impl BeamZone {
    /// Typical QoS for this zone (Nano9, 0-1)
    pub fn typical_qos(&self) -> Nano9 {
        match self {
            BeamZone::Focal => Nano9(950_000_000),      // 95%
            BeamZone::Core => Nano9(800_000_000),       // 80%
            BeamZone::Transition => Nano9(550_000_000), // 55%
            BeamZone::Trailing => Nano9(300_000_000),   // 30%
            BeamZone::Outside => Nano9::ZERO,
        }
    }

    /// Bandwidth multiplier (1.0 = full)
    pub fn bandwidth_factor(&self) -> Nano9 {
        match self {
            BeamZone::Focal => Nano9(NANO),             // 100%
            BeamZone::Core => Nano9(850_000_000),       // 85%
            BeamZone::Transition => Nano9(500_000_000), // 50%
            BeamZone::Trailing => Nano9(150_000_000),   // 15%
            BeamZone::Outside => Nano9::ZERO,
        }
    }
}

/// Beam profile at a given instant
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BeamProfile {
    /// Current zone
    pub zone: BeamZone,
    /// Actual QoS (0-1 as Nano9)
    pub qos: Nano9,
    /// Distance from focal point (Nano9 km)
    pub offset_from_focal: Nano9,
    /// Bit error rate (Nano9, e.g., 1e-9 = Nano9(1))
    pub ber: Nano9,
    /// Available bandwidth (Nano9 Gbps)
    pub bandwidth_gbps: Nano9,
}

impl BeamProfile {
    /// Maximum bandwidth at focal point
    pub const MAX_BANDWIDTH_GBPS: Nano9 = Nano9(10 * NANO); // 10 Gbps

    /// Create profile for a beam zone
    pub fn for_zone(zone: BeamZone) -> Self {
        let qos = zone.typical_qos();
        let bw_factor = zone.bandwidth_factor();
        let bandwidth = Nano9(
            (Self::MAX_BANDWIDTH_GBPS.0 as i128 * bw_factor.0 as i128 / NANO as i128) as i64
        );

        Self {
            zone,
            qos,
            offset_from_focal: Nano9::ZERO,
            ber: Self::ber_for_qos(qos),
            bandwidth_gbps: bandwidth,
        }
    }

    /// BER based on QoS (rough model)
    fn ber_for_qos(qos: Nano9) -> Nano9 {
        // Higher QoS = lower BER
        // QoS 95% → BER 1e-12
        // QoS 30% → BER 1e-5
        if qos.0 > 900_000_000 {
            Nano9(1) // 1e-12 class
        } else if qos.0 > 700_000_000 {
            Nano9(1_000) // 1e-9 class
        } else if qos.0 > 400_000_000 {
            Nano9(1_000_000) // 1e-6 class
        } else {
            Nano9(10_000_000) // 1e-5 class
        }
    }
}

// ============================================================================
// Pass Classification
// ============================================================================

/// Pass quality tier
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PassTier {
    /// Full bandwidth + key refresh
    Prime,
    /// Normal operations
    Standard,
    /// Key transfer only (CTAS mesh)
    KeyTransfer,
    /// Marginal but can complete key pass
    KeyViable,
    /// Ka-band telemetry only
    TelemetryOnly,
    /// No usable link
    NoLink,
}

impl PassTier {
    pub fn from_qos(qos: Nano9) -> Self {
        if qos.0 >= QOS_PRIME.0 {
            PassTier::Prime
        } else if qos.0 >= QOS_STANDARD.0 {
            PassTier::Standard
        } else if qos.0 >= QOS_DEGRADED.0 {
            PassTier::KeyTransfer
        } else if qos.0 >= QOS_KEY_VIABLE.0 {
            PassTier::KeyViable
        } else if qos.0 >= QOS_TELEMETRY.0 {
            PassTier::TelemetryOnly
        } else {
            PassTier::NoLink
        }
    }

    pub fn can_transfer_keys(&self) -> bool {
        matches!(self, PassTier::Prime | PassTier::Standard | PassTier::KeyTransfer | PassTier::KeyViable)
    }

    pub fn can_transfer_data(&self) -> bool {
        matches!(self, PassTier::Prime | PassTier::Standard)
    }
}

/// Pass viability assessment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PassAssessment {
    pub satellite_id: String,
    pub station_id: String,
    pub tier: PassTier,
    pub qos: Nano9,
    /// Is satellite pointing at target?
    pub on_target: bool,
    /// Time remaining in pass (Nano9 seconds)
    pub time_remaining_sec: Nano9,
    /// Key transfer rate at current QoS (keys/sec)
    pub key_rate: Nano9,
    /// Keys transferable in remaining time
    pub keys_possible: u64,
    /// Minimum keys for viable pass
    pub min_keys_threshold: u64,
    /// Is this pass key-viable?
    pub key_viable: bool,
    /// Beam zone
    pub beam_zone: BeamZone,
}

impl PassAssessment {
    /// Minimum keys to consider a pass worthwhile
    pub const MIN_KEYS_DEFAULT: u64 = 1000;

    /// Assess pass viability for key transfer
    pub fn assess(
        satellite_id: &str,
        station_id: &str,
        qos: Nano9,
        on_target: bool,
        time_remaining_sec: Nano9,
        beam_zone: BeamZone,
    ) -> Self {
        let tier = PassTier::from_qos(qos);

        // Key transfer rate based on QoS
        // At 100% QoS: ~10,000 keys/sec (256-bit keys over 10 Gbps with overhead)
        // Scales linearly with QoS
        let max_key_rate = Nano9(10_000 * NANO);
        let key_rate = Nano9(
            (max_key_rate.0 as i128 * qos.0 as i128 / NANO as i128) as i64
        );

        // Keys possible = rate × time
        let keys_possible = if on_target && tier.can_transfer_keys() {
            ((key_rate.0 as i128 * time_remaining_sec.0 as i128) / (NANO as i128 * NANO as i128)) as u64
        } else {
            0
        };

        let key_viable = on_target
            && tier.can_transfer_keys()
            && keys_possible >= Self::MIN_KEYS_DEFAULT;

        Self {
            satellite_id: satellite_id.to_string(),
            station_id: station_id.to_string(),
            tier,
            qos,
            on_target,
            time_remaining_sec,
            key_rate,
            keys_possible,
            min_keys_threshold: Self::MIN_KEYS_DEFAULT,
            key_viable,
            beam_zone,
        }
    }

    /// Quick check: is this a key-viable pass?
    pub fn is_key_viable(&self) -> bool {
        self.key_viable
    }

    /// Should we attempt key transfer on this pass?
    pub fn recommend_key_transfer(&self) -> bool {
        // Transfer keys on any viable pass, even degraded ones
        self.key_viable && matches!(
            self.tier,
            PassTier::KeyTransfer | PassTier::KeyViable
        )
    }
}

// ============================================================================
// CTAS Sideband - Global Security Mesh
// ============================================================================

/// CTAS Operator Layer - rides on trailing edge capacity
/// Always-on global secure mesh for threat intel operators
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CtasSideband {
    /// Channel identifier
    pub channel_id: String,
    /// Allocated bandwidth (Nano9 Mbps) - uses trailing edge
    pub bandwidth_mbps: Nano9,
    /// Current utilization (0-1)
    pub utilization: Nano9,
    /// Connected operator count
    pub operators_connected: u32,
    /// Message queue depth
    pub queue_depth: u32,
    /// Encryption: always AES-256-GCM with space-harvested keys
    pub encryption_active: bool,
    /// Key refresh interval (seconds)
    pub key_refresh_sec: u32,
}

impl CtasSideband {
    /// Default sideband allocation (Mbps)
    pub const DEFAULT_BANDWIDTH_MBPS: Nano9 = Nano9(100 * NANO); // 100 Mbps

    /// Create new CTAS sideband channel
    pub fn new(channel_id: &str) -> Self {
        Self {
            channel_id: channel_id.to_string(),
            bandwidth_mbps: Self::DEFAULT_BANDWIDTH_MBPS,
            utilization: Nano9::ZERO,
            operators_connected: 0,
            queue_depth: 0,
            encryption_active: true,
            key_refresh_sec: 300, // 5 minute key rotation
        }
    }

    /// Available capacity (Mbps)
    pub fn available_mbps(&self) -> Nano9 {
        let used = Nano9(
            (self.bandwidth_mbps.0 as i128 * self.utilization.0 as i128 / NANO as i128) as i64
        );
        Nano9(self.bandwidth_mbps.0 - used.0)
    }
}

/// Global CTAS mesh across constellation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CtasGlobalMesh {
    /// Sideband channels per satellite
    pub channels: Vec<CtasSideband>,
    /// Total mesh bandwidth (Mbps)
    pub total_bandwidth_mbps: Nano9,
    /// Active routes through mesh
    pub active_routes: u32,
    /// Global operator sessions
    pub global_sessions: u32,
}

impl CtasGlobalMesh {
    /// Initialize mesh for constellation
    pub fn new(satellite_ids: &[&str]) -> Self {
        let channels: Vec<CtasSideband> = satellite_ids
            .iter()
            .map(|id| CtasSideband::new(&format!("CTAS-{}", id)))
            .collect();

        let total = Nano9(channels.len() as i64 * CtasSideband::DEFAULT_BANDWIDTH_MBPS.0);

        Self {
            channels,
            total_bandwidth_mbps: total,
            active_routes: 0,
            global_sessions: 0,
        }
    }

    /// HALO constellation mesh
    pub fn halo_mesh() -> Self {
        Self::new(&[
            "alpha", "beta", "gamma", "delta",
            "epsilon", "zeta", "eta", "theta",
            "iota", "kappa", "lambda", "mu",
        ])
    }

    /// Total available sideband capacity (Mbps as Nano9)
    pub fn available_capacity(&self) -> Nano9 {
        Nano9(self.channels.iter().map(|c| c.available_mbps().0).sum())
    }

    /// Mesh stats
    pub fn stats(&self) -> CtasMeshStats {
        let total_bw: i64 = self.channels.iter().map(|c| c.bandwidth_mbps.0).sum();
        let available = self.available_capacity().0;
        let operators: u32 = self.channels.iter().map(|c| c.operators_connected).sum();

        // utilization = (total - available) / total (as Nano9 0-1)
        let utilization = if total_bw > 0 {
            Nano9(((total_bw - available) as i128 * NANO as i128 / total_bw as i128) as i64)
        } else {
            Nano9::ZERO
        };

        CtasMeshStats {
            total_channels: self.channels.len() as u8,
            total_bandwidth: Nano9(total_bw),
            available_bandwidth: Nano9(available),
            utilization,
            total_operators: operators,
            active_routes: self.active_routes,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CtasMeshStats {
    pub total_channels: u8,
    /// Total bandwidth (Mbps as Nano9)
    pub total_bandwidth: Nano9,
    /// Available bandwidth (Mbps as Nano9)
    pub available_bandwidth: Nano9,
    /// Utilization ratio (0-1 as Nano9)
    pub utilization: Nano9,
    pub total_operators: u32,
    pub active_routes: u32,
}

// ============================================================================
// Pre-Determined Messages & Script Triggers
// ============================================================================

/// Pre-determined message types for CTAS sideband
/// These trigger scripts on receipt - no parsing required
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum CtasMessageType {
    /// Heartbeat - keep-alive ping
    Heartbeat = 0x01,
    /// Threat alert - triggers defensive scripts
    ThreatAlert = 0x10,
    /// Key rotation - trigger key refresh
    KeyRotation = 0x11,
    /// Status request - trigger status report
    StatusRequest = 0x20,
    /// Status response - carries metrics
    StatusResponse = 0x21,
    /// Script trigger - execute named script
    ScriptTrigger = 0x30,
    /// Operator join - session init
    OperatorJoin = 0x40,
    /// Operator leave - session teardown
    OperatorLeave = 0x41,
    /// Emergency - highest priority
    Emergency = 0xFF,
}

impl CtasMessageType {
    /// Priority level (higher = more urgent)
    pub fn priority(&self) -> u8 {
        match self {
            CtasMessageType::Emergency => 255,
            CtasMessageType::ThreatAlert => 200,
            CtasMessageType::KeyRotation => 150,
            CtasMessageType::ScriptTrigger => 100,
            CtasMessageType::StatusRequest => 50,
            CtasMessageType::StatusResponse => 50,
            CtasMessageType::OperatorJoin => 30,
            CtasMessageType::OperatorLeave => 30,
            CtasMessageType::Heartbeat => 10,
        }
    }

    /// Does this message trigger a script?
    pub fn triggers_script(&self) -> bool {
        matches!(
            self,
            CtasMessageType::ThreatAlert
                | CtasMessageType::KeyRotation
                | CtasMessageType::ScriptTrigger
                | CtasMessageType::Emergency
        )
    }
}

/// Pre-determined message frame
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CtasMessage {
    /// Message type (determines script to trigger)
    pub msg_type: CtasMessageType,
    /// Source channel
    pub source_channel: String,
    /// Destination (broadcast if empty)
    pub destination: Option<String>,
    /// Script name to execute (for ScriptTrigger type)
    pub script_name: Option<String>,
    /// Payload (compact, type-specific)
    pub payload: Vec<u8>,
    /// Timestamp (millis since epoch)
    pub timestamp_ms: i64,
    /// Sequence number for RTT calculation
    pub seq: u64,
}

impl CtasMessage {
    /// Create heartbeat message
    pub fn heartbeat(channel: &str, seq: u64) -> Self {
        Self {
            msg_type: CtasMessageType::Heartbeat,
            source_channel: channel.to_string(),
            destination: None,
            script_name: None,
            payload: Vec::new(),
            timestamp_ms: chrono::Utc::now().timestamp_millis(),
            seq,
        }
    }

    /// Create script trigger message
    pub fn script_trigger(channel: &str, script: &str, seq: u64) -> Self {
        Self {
            msg_type: CtasMessageType::ScriptTrigger,
            source_channel: channel.to_string(),
            destination: None,
            script_name: Some(script.to_string()),
            payload: Vec::new(),
            timestamp_ms: chrono::Utc::now().timestamp_millis(),
            seq,
        }
    }

    /// Create threat alert
    pub fn threat_alert(channel: &str, payload: Vec<u8>, seq: u64) -> Self {
        Self {
            msg_type: CtasMessageType::ThreatAlert,
            source_channel: channel.to_string(),
            destination: None,
            script_name: Some("threat_response".to_string()),
            payload,
            timestamp_ms: chrono::Utc::now().timestamp_millis(),
            seq,
        }
    }

    /// Create emergency broadcast
    pub fn emergency(channel: &str, payload: Vec<u8>, seq: u64) -> Self {
        Self {
            msg_type: CtasMessageType::Emergency,
            source_channel: channel.to_string(),
            destination: None,
            script_name: Some("emergency_lockdown".to_string()),
            payload,
            timestamp_ms: chrono::Utc::now().timestamp_millis(),
            seq,
        }
    }

    /// Message age in milliseconds
    pub fn age_ms(&self) -> i64 {
        chrono::Utc::now().timestamp_millis() - self.timestamp_ms
    }
}

// ============================================================================
// QoS Measurement & Round-Trip Latency
// ============================================================================

/// QoS measurement sample
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QosSample {
    /// Channel this sample is from
    pub channel_id: String,
    /// Sequence number of the probe
    pub seq: u64,
    /// One-way latency estimate (ms, Nano9)
    pub latency_ms: Nano9,
    /// Round-trip time (ms, Nano9)
    pub rtt_ms: Nano9,
    /// Jitter (ms, Nano9)
    pub jitter_ms: Nano9,
    /// Packet loss ratio (0-1 as Nano9)
    pub packet_loss: Nano9,
    /// Measured throughput (Mbps, Nano9)
    pub throughput_mbps: Nano9,
    /// Timestamp
    pub timestamp_ms: i64,
}

/// Speed of service metrics for a channel
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeedOfService {
    /// Channel ID
    pub channel_id: String,
    /// Sample window (recent samples for averaging)
    pub samples: Vec<QosSample>,
    /// Maximum samples to retain
    pub max_samples: usize,
    /// Running sequence number
    pub seq_counter: u64,
    /// Messages sent
    pub msgs_sent: u64,
    /// Messages received (for loss calc)
    pub msgs_received: u64,
    /// Last probe timestamp
    pub last_probe_ms: i64,
}

impl SpeedOfService {
    /// Default sample window size
    pub const DEFAULT_WINDOW: usize = 100;

    /// RTT threshold for perfect score (50ms as Nano9)
    pub const RTT_GOOD: Nano9 = Nano9(50 * NANO);
    /// RTT threshold for zero score (500ms as Nano9)
    pub const RTT_BAD: Nano9 = Nano9(500 * NANO);
    /// Jitter threshold for perfect score (10ms as Nano9)
    pub const JITTER_GOOD: Nano9 = Nano9(10 * NANO);
    /// Jitter threshold for zero score (100ms as Nano9)
    pub const JITTER_BAD: Nano9 = Nano9(100 * NANO);
    /// Throughput threshold for perfect score (50 Mbps as Nano9)
    pub const TP_GOOD: Nano9 = Nano9(50 * NANO);
    /// Throughput threshold for zero score (5 Mbps as Nano9)
    pub const TP_BAD: Nano9 = Nano9(5 * NANO);
    /// Loss threshold for zero score (10% as Nano9 = 0.1)
    pub const LOSS_BAD: Nano9 = Nano9(100_000_000); // 0.1

    pub fn new(channel_id: &str) -> Self {
        Self {
            channel_id: channel_id.to_string(),
            samples: Vec::with_capacity(Self::DEFAULT_WINDOW),
            max_samples: Self::DEFAULT_WINDOW,
            seq_counter: 0,
            msgs_sent: 0,
            msgs_received: 0,
            last_probe_ms: 0,
        }
    }

    /// Record a new QoS sample
    pub fn record_sample(&mut self, sample: QosSample) {
        if self.samples.len() >= self.max_samples {
            self.samples.remove(0);
        }
        self.samples.push(sample);
    }

    /// Get next sequence number
    pub fn next_seq(&mut self) -> u64 {
        self.seq_counter += 1;
        self.msgs_sent += 1;
        self.seq_counter
    }

    /// Record message received
    pub fn record_received(&mut self) {
        self.msgs_received += 1;
    }

    /// Calculate round-trip time from probe response (ms as Nano9)
    pub fn calculate_rtt(&self, sent_ms: i64, received_ms: i64) -> Nano9 {
        Nano9((received_ms - sent_ms) * NANO)
    }

    /// Average RTT over sample window (ms as Nano9)
    pub fn avg_rtt(&self) -> Nano9 {
        if self.samples.is_empty() {
            return Nano9::ZERO;
        }
        let sum: i64 = self.samples.iter().map(|s| s.rtt_ms.0).sum();
        Nano9(sum / self.samples.len() as i64)
    }

    /// Average latency (one-way, ms as Nano9)
    pub fn avg_latency(&self) -> Nano9 {
        Nano9(self.avg_rtt().0 / 2)
    }

    /// Average jitter (ms as Nano9)
    pub fn avg_jitter(&self) -> Nano9 {
        if self.samples.len() < 2 {
            return Nano9::ZERO;
        }
        let sum: i64 = self.samples.iter().map(|s| s.jitter_ms.0).sum();
        Nano9(sum / self.samples.len() as i64)
    }

    /// Packet loss ratio (0-1 as Nano9)
    pub fn packet_loss(&self) -> Nano9 {
        if self.msgs_sent == 0 {
            return Nano9::ZERO;
        }
        // loss = 1 - (received / sent)
        // In Nano9: NANO - (received * NANO / sent)
        let received_ratio = (self.msgs_received as i128 * NANO as i128 / self.msgs_sent as i128) as i64;
        Nano9(NANO - received_ratio)
    }

    /// Average throughput (Mbps as Nano9)
    pub fn avg_throughput(&self) -> Nano9 {
        if self.samples.is_empty() {
            return Nano9::ZERO;
        }
        let sum: i64 = self.samples.iter().map(|s| s.throughput_mbps.0).sum();
        Nano9(sum / self.samples.len() as i64)
    }

    /// Score component: RTT (0-1 as Nano9)
    /// <50ms = 1.0, >500ms = 0.0, linear between
    fn rtt_score(&self) -> Nano9 {
        let rtt = self.avg_rtt().0;
        if rtt <= Self::RTT_GOOD.0 {
            return Nano9(NANO); // 1.0
        }
        if rtt >= Self::RTT_BAD.0 {
            return Nano9::ZERO;
        }
        // Linear: score = 1 - (rtt - good) / (bad - good)
        let range = Self::RTT_BAD.0 - Self::RTT_GOOD.0;
        let excess = rtt - Self::RTT_GOOD.0;
        Nano9(NANO - (excess as i128 * NANO as i128 / range as i128) as i64)
    }

    /// Score component: Jitter (0-1 as Nano9)
    /// <10ms = 1.0, >100ms = 0.0
    fn jitter_score(&self) -> Nano9 {
        let jitter = self.avg_jitter().0;
        if jitter <= Self::JITTER_GOOD.0 {
            return Nano9(NANO);
        }
        if jitter >= Self::JITTER_BAD.0 {
            return Nano9::ZERO;
        }
        let range = Self::JITTER_BAD.0 - Self::JITTER_GOOD.0;
        let excess = jitter - Self::JITTER_GOOD.0;
        Nano9(NANO - (excess as i128 * NANO as i128 / range as i128) as i64)
    }

    /// Score component: Packet loss (0-1 as Nano9)
    /// 0% = 1.0, >10% = 0.0
    fn loss_score(&self) -> Nano9 {
        let loss = self.packet_loss().0;
        if loss <= 0 {
            return Nano9(NANO);
        }
        if loss >= Self::LOSS_BAD.0 {
            return Nano9::ZERO;
        }
        // score = 1 - (loss / 0.1)
        Nano9(NANO - (loss as i128 * NANO as i128 / Self::LOSS_BAD.0 as i128) as i64)
    }

    /// Score component: Throughput (0-1 as Nano9)
    /// >50Mbps = 1.0, <5Mbps = 0.0
    fn throughput_score(&self) -> Nano9 {
        let tp = self.avg_throughput().0;
        if tp >= Self::TP_GOOD.0 {
            return Nano9(NANO);
        }
        if tp <= Self::TP_BAD.0 {
            return Nano9::ZERO;
        }
        // score = (tp - bad) / (good - bad)
        let range = Self::TP_GOOD.0 - Self::TP_BAD.0;
        let above_min = tp - Self::TP_BAD.0;
        Nano9((above_min as i128 * NANO as i128 / range as i128) as i64)
    }

    /// Overall QoS score (0-1 as Nano9)
    /// Weights: RTT 30%, Jitter 20%, Loss 30%, Throughput 20%
    pub fn qos_score(&self) -> Nano9 {
        // Weights as Nano9: 0.3, 0.2, 0.3, 0.2
        const W_RTT: i64 = 300_000_000;    // 0.3
        const W_JITTER: i64 = 200_000_000; // 0.2
        const W_LOSS: i64 = 300_000_000;   // 0.3
        const W_TP: i64 = 200_000_000;     // 0.2

        let rtt = self.rtt_score().0;
        let jitter = self.jitter_score().0;
        let loss = self.loss_score().0;
        let tp = self.throughput_score().0;

        // weighted sum: (rtt * w_rtt + jitter * w_jitter + ...) / NANO
        let sum = (rtt as i128 * W_RTT as i128
            + jitter as i128 * W_JITTER as i128
            + loss as i128 * W_LOSS as i128
            + tp as i128 * W_TP as i128) / NANO as i128;

        Nano9(sum as i64)
    }

    /// Generate summary stats (all Nano9)
    pub fn summary(&self) -> SpeedOfServiceSummary {
        SpeedOfServiceSummary {
            channel_id: self.channel_id.clone(),
            sample_count: self.samples.len() as u32,
            avg_rtt: self.avg_rtt(),
            avg_latency: self.avg_latency(),
            avg_jitter: self.avg_jitter(),
            packet_loss: self.packet_loss(),
            avg_throughput: self.avg_throughput(),
            qos_score: self.qos_score(),
            msgs_sent: self.msgs_sent,
            msgs_received: self.msgs_received,
        }
    }
}

/// Speed of service summary (all Nano9)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeedOfServiceSummary {
    pub channel_id: String,
    pub sample_count: u32,
    /// Average RTT (ms as Nano9)
    pub avg_rtt: Nano9,
    /// Average one-way latency (ms as Nano9)
    pub avg_latency: Nano9,
    /// Average jitter (ms as Nano9)
    pub avg_jitter: Nano9,
    /// Packet loss ratio (0-1 as Nano9)
    pub packet_loss: Nano9,
    /// Average throughput (Mbps as Nano9)
    pub avg_throughput: Nano9,
    /// Overall QoS score (0-1 as Nano9)
    pub qos_score: Nano9,
    pub msgs_sent: u64,
    pub msgs_received: u64,
}

// ============================================================================
// Station Pass Tracking
// ============================================================================

/// Track upcoming passes and their key viability
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StationPassTracker {
    pub station_id: String,
    pub latitude: Nano9,
    pub longitude: Nano9,
    /// Upcoming passes sorted by time
    pub upcoming_passes: Vec<PassAssessment>,
    /// Count of key-viable passes in next window
    pub key_viable_count: usize,
    /// Next key-viable pass (if any)
    pub next_key_pass: Option<PassAssessment>,
}

impl StationPassTracker {
    pub fn new(station_id: &str, lat: Nano9, lon: Nano9) -> Self {
        Self {
            station_id: station_id.to_string(),
            latitude: lat,
            longitude: lon,
            upcoming_passes: Vec::new(),
            key_viable_count: 0,
            next_key_pass: None,
        }
    }

    /// Add a pass assessment
    pub fn add_pass(&mut self, pass: PassAssessment) {
        if pass.key_viable {
            self.key_viable_count += 1;
            if self.next_key_pass.is_none() {
                self.next_key_pass = Some(pass.clone());
            }
        }
        self.upcoming_passes.push(pass);
    }

    /// Get all key-viable passes
    pub fn key_viable_passes(&self) -> Vec<&PassAssessment> {
        self.upcoming_passes.iter().filter(|p| p.key_viable).collect()
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pass_tier_from_qos() {
        assert_eq!(PassTier::from_qos(Nano9(950_000_000)), PassTier::Prime);
        assert_eq!(PassTier::from_qos(Nano9(700_000_000)), PassTier::Standard);
        assert_eq!(PassTier::from_qos(Nano9(450_000_000)), PassTier::KeyTransfer);
        assert_eq!(PassTier::from_qos(Nano9(250_000_000)), PassTier::KeyViable);
        assert_eq!(PassTier::from_qos(Nano9(150_000_000)), PassTier::TelemetryOnly);
        assert_eq!(PassTier::from_qos(Nano9(50_000_000)), PassTier::NoLink);
    }

    #[test]
    fn test_key_transfer_eligibility() {
        assert!(PassTier::Prime.can_transfer_keys());
        assert!(PassTier::Standard.can_transfer_keys());
        assert!(PassTier::KeyTransfer.can_transfer_keys());
        assert!(PassTier::KeyViable.can_transfer_keys());
        assert!(!PassTier::TelemetryOnly.can_transfer_keys());
        assert!(!PassTier::NoLink.can_transfer_keys());
    }

    #[test]
    fn test_pass_assessment() {
        // Good pass - 80% QoS, on target, 5 minutes remaining
        let good_pass = PassAssessment::assess(
            "alpha",
            "STATION-A",
            Nano9(800_000_000), // 80%
            true,
            Nano9(300 * NANO), // 300 seconds
            BeamZone::Core,
        );

        assert_eq!(good_pass.tier, PassTier::Standard);
        assert!(good_pass.key_viable);
        assert!(good_pass.keys_possible > 1000);
        println!("Good pass: {} keys possible", good_pass.keys_possible);

        // Degraded pass - 30% QoS, on target, 5 minutes
        let degraded_pass = PassAssessment::assess(
            "beta",
            "STATION-B",
            Nano9(300_000_000), // 30%
            true,
            Nano9(300 * NANO),
            BeamZone::Trailing,
        );

        assert_eq!(degraded_pass.tier, PassTier::KeyViable);
        assert!(degraded_pass.key_viable);
        assert!(degraded_pass.recommend_key_transfer());
        println!("Degraded pass: {} keys possible", degraded_pass.keys_possible);

        // Bad pass - 30% QoS, NOT on target
        let bad_pass = PassAssessment::assess(
            "gamma",
            "STATION-C",
            Nano9(300_000_000),
            false, // Not on target!
            Nano9(300 * NANO),
            BeamZone::Trailing,
        );

        assert!(!bad_pass.key_viable);
        assert_eq!(bad_pass.keys_possible, 0);
    }

    #[test]
    fn test_beam_zones() {
        let focal = BeamProfile::for_zone(BeamZone::Focal);
        let trailing = BeamProfile::for_zone(BeamZone::Trailing);

        assert!(focal.qos.0 > trailing.qos.0);
        assert!(focal.bandwidth_gbps.0 > trailing.bandwidth_gbps.0);

        // Focal: 10 Gbps (10 * NANO), QoS 95% (950_000_000)
        assert_eq!(focal.bandwidth_gbps.0, 10 * NANO);
        assert_eq!(focal.qos.0, 950_000_000);

        // Trailing: 1.5 Gbps (1_500_000_000), QoS 30% (300_000_000)
        assert_eq!(trailing.bandwidth_gbps.0, 1_500_000_000);
        assert_eq!(trailing.qos.0, 300_000_000);
    }

    #[test]
    fn test_speed_of_service() {
        let mut sos = SpeedOfService::new("CTAS-alpha");

        // No samples: RTT=0 (perfect), Jitter=0 (perfect), Loss=0 (perfect), Throughput=0 (zero)
        // Score = 0.3*1 + 0.2*1 + 0.3*1 + 0.2*0 = 0.8
        assert_eq!(sos.qos_score().0, 800_000_000);

        // Simulate good conditions: 30ms RTT, 5ms jitter, 60 Mbps
        for i in 0..10 {
            let seq = sos.next_seq();
            sos.record_received();
            sos.record_sample(QosSample {
                channel_id: "CTAS-alpha".to_string(),
                seq,
                latency_ms: Nano9(15 * NANO), // 15ms one-way
                rtt_ms: Nano9(30 * NANO),     // 30ms RTT
                jitter_ms: Nano9(5 * NANO),   // 5ms jitter
                packet_loss: Nano9::ZERO,
                throughput_mbps: Nano9(60 * NANO), // 60 Mbps
                timestamp_ms: i,
            });
        }

        let summary = sos.summary();
        // RTT < 50ms = perfect RTT score
        assert!(summary.avg_rtt.0 <= SpeedOfService::RTT_GOOD.0);
        // Jitter < 10ms = perfect jitter score
        assert!(summary.avg_jitter.0 <= SpeedOfService::JITTER_GOOD.0);
        // Throughput > 50 Mbps = perfect throughput score
        assert!(summary.avg_throughput.0 >= SpeedOfService::TP_GOOD.0);
        // No packet loss
        assert_eq!(summary.packet_loss.0, 0);
        // Overall score should be very high (> 90%)
        assert!(summary.qos_score.0 > 900_000_000);
    }

    #[test]
    fn test_ctas_message_types() {
        assert!(CtasMessageType::ThreatAlert.triggers_script());
        assert!(CtasMessageType::Emergency.triggers_script());
        assert!(CtasMessageType::ScriptTrigger.triggers_script());
        assert!(!CtasMessageType::Heartbeat.triggers_script());
        assert!(!CtasMessageType::StatusRequest.triggers_script());

        // Priority ordering
        assert!(CtasMessageType::Emergency.priority() > CtasMessageType::ThreatAlert.priority());
        assert!(CtasMessageType::ThreatAlert.priority() > CtasMessageType::Heartbeat.priority());
    }
}

// ============================================================================
// Property-based Fuzz Tests
// ============================================================================

#[cfg(test)]
mod proptests {
    use super::*;
    use proptest::prelude::*;

    // Strategy for generating valid QoS values (0-1 as Nano9)
    fn qos_strategy() -> impl Strategy<Value = Nano9> {
        (0i64..=NANO).prop_map(Nano9)
    }

    // Strategy for RTT values (0-1000ms as Nano9)
    fn rtt_strategy() -> impl Strategy<Value = Nano9> {
        (0i64..=1000 * NANO).prop_map(Nano9)
    }

    // Strategy for throughput (0-100 Mbps as Nano9)
    fn throughput_strategy() -> impl Strategy<Value = Nano9> {
        (0i64..=100 * NANO).prop_map(Nano9)
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(10000))]

        // Fuzz: QoS score always in valid range
        #[test]
        fn fuzz_qos_score_bounds(
            rtt in rtt_strategy(),
            jitter in (0i64..=200 * NANO).prop_map(Nano9),
            throughput in throughput_strategy(),
            loss_num in 0u64..100u64,
            loss_denom in 1u64..100u64,
        ) {
            let mut sos = SpeedOfService::new("fuzz-channel");

            // Add sample with fuzzed values
            let seq = sos.next_seq();
            if loss_num < loss_denom {
                sos.record_received();
            }

            sos.record_sample(QosSample {
                channel_id: "fuzz".to_string(),
                seq,
                latency_ms: Nano9(rtt.0 / 2),
                rtt_ms: rtt,
                jitter_ms: jitter,
                packet_loss: Nano9::ZERO, // Calculated from sent/received
                throughput_mbps: throughput,
                timestamp_ms: 0,
            });

            let score = sos.qos_score();

            // Score must be in [0, 1]
            prop_assert!(score.0 >= 0, "Score below 0: {}", score.0);
            prop_assert!(score.0 <= NANO, "Score above 1: {}", score.0);
        }

        // Fuzz: Pass tier always valid for any QoS
        #[test]
        fn fuzz_pass_tier_valid(qos in qos_strategy()) {
            let tier = PassTier::from_qos(qos);

            // Tier must be one of the defined variants
            match tier {
                PassTier::Prime => prop_assert!(qos.0 >= QOS_PRIME.0),
                PassTier::Standard => prop_assert!(qos.0 >= QOS_STANDARD.0 && qos.0 < QOS_PRIME.0),
                PassTier::KeyTransfer => prop_assert!(qos.0 >= QOS_DEGRADED.0 && qos.0 < QOS_STANDARD.0),
                PassTier::KeyViable => prop_assert!(qos.0 >= QOS_KEY_VIABLE.0 && qos.0 < QOS_DEGRADED.0),
                PassTier::TelemetryOnly => prop_assert!(qos.0 >= QOS_TELEMETRY.0 && qos.0 < QOS_KEY_VIABLE.0),
                PassTier::NoLink => prop_assert!(qos.0 < QOS_TELEMETRY.0),
            }
        }

        // Fuzz: Beam profile bandwidth never exceeds max
        #[test]
        fn fuzz_beam_profile_bandwidth(zone_idx in 0usize..5) {
            let zone = match zone_idx {
                0 => BeamZone::Focal,
                1 => BeamZone::Core,
                2 => BeamZone::Transition,
                3 => BeamZone::Trailing,
                _ => BeamZone::Outside,
            };

            let profile = BeamProfile::for_zone(zone);

            prop_assert!(profile.bandwidth_gbps.0 >= 0);
            prop_assert!(profile.bandwidth_gbps.0 <= BeamProfile::MAX_BANDWIDTH_GBPS.0);
            prop_assert!(profile.qos.0 >= 0);
            prop_assert!(profile.qos.0 <= NANO);
        }

        // Fuzz: Pass assessment key calculation never overflows
        #[test]
        fn fuzz_pass_assessment_no_overflow(
            qos in qos_strategy(),
            time_sec in 0i64..86400, // Up to 24 hours
        ) {
            let assessment = PassAssessment::assess(
                "fuzz-sat",
                "fuzz-station",
                qos,
                true,
                Nano9(time_sec * NANO),
                BeamZone::Core,
            );

            // Should not panic, and values should be reasonable
            prop_assert!(assessment.key_rate.0 >= 0);
            // keys_possible is u64, should handle large values
        }

        // Fuzz: SpeedOfService score components are monotonic
        #[test]
        fn fuzz_score_monotonicity(
            rtt1 in 0i64..500 * NANO,
            rtt2 in 0i64..500 * NANO,
        ) {
            let mut sos1 = SpeedOfService::new("test1");
            let mut sos2 = SpeedOfService::new("test2");

            // Same throughput, jitter, no loss - only RTT differs
            for (sos, rtt) in [(&mut sos1, rtt1), (&mut sos2, rtt2)] {
                let seq = sos.next_seq();
                sos.record_received();
                sos.record_sample(QosSample {
                    channel_id: "test".to_string(),
                    seq,
                    latency_ms: Nano9(rtt / 2),
                    rtt_ms: Nano9(rtt),
                    jitter_ms: Nano9(5 * NANO),
                    packet_loss: Nano9::ZERO,
                    throughput_mbps: Nano9(50 * NANO),
                    timestamp_ms: 0,
                });
            }

            // Lower RTT should give higher or equal score
            if rtt1 <= rtt2 {
                prop_assert!(sos1.qos_score().0 >= sos2.qos_score().0,
                    "Lower RTT {} should give higher score than {}: {} vs {}",
                    rtt1, rtt2, sos1.qos_score().0, sos2.qos_score().0);
            }
        }

        // Fuzz: CTAS mesh capacity never negative
        #[test]
        fn fuzz_mesh_capacity(
            utilization in 0i64..=NANO,
        ) {
            let mut mesh = CtasGlobalMesh::halo_mesh();

            // Set utilization on first channel
            mesh.channels[0].utilization = Nano9(utilization);

            let available = mesh.available_capacity();
            prop_assert!(available.0 >= 0, "Available capacity negative: {}", available.0);

            let stats = mesh.stats();
            prop_assert!(stats.utilization.0 >= 0);
            prop_assert!(stats.utilization.0 <= NANO);
        }
    }
}
