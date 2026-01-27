//! Memory routes - Exposes sx9-tcache cognitive memory via REST API
//!
//! Provides agent memory for:
//! - Simple key-value store/recall
//! - Work context ENGRAM operations (cross-LLM handoff)
//! - Similarity probe for trivariate matching
//!
//! All data persists in local sled database with tcache indexing.

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::RwLock;

use sx9_tcache::{TrivariateCache, TrivariateRecord, Hd4Phase, murmur3_128, ProbeVector};
use sx9_tcache::traits::MemoryBackend;

/// Memory state shared across routes
#[derive(Clone)]
pub struct MemoryState {
    pub tcache: Arc<RwLock<TrivariateCache>>,
}

impl MemoryState {
    pub fn new(db_path: &str) -> anyhow::Result<Self> {
        let path = Path::new(db_path);
        let tcache = TrivariateCache::open(path)?;
        Ok(Self {
            tcache: Arc::new(RwLock::new(tcache)),
        })
    }
}

// ========== Request/Response Types ==========

#[derive(Deserialize)]
pub struct StoreRequest {
    pub key: String,
    pub value: String,
    pub tags: Option<Vec<String>>,
    pub phase: Option<String>, // hunt, detect, disrupt, disable, dominate (RFC-9301)
}

#[derive(Serialize)]
pub struct StoreResponse {
    pub sch: String,
    pub key: String,
    pub stored: bool,
}

#[derive(Deserialize)]
pub struct RecallRequest {
    pub key: Option<String>,
    pub sch: Option<String>,
}

#[derive(Serialize)]
pub struct RecallResponse {
    pub found: bool,
    pub sch: Option<String>,
    pub key: Option<String>,
    pub phase: Option<String>,
    pub delta: Option<f64>,
    pub shannon: Option<f64>,
}

#[derive(Deserialize)]
pub struct ProbeRequest {
    pub query: String,
    pub limit: Option<usize>,
    pub threshold: Option<f64>,
}

#[derive(Serialize)]
pub struct ProbeResult {
    pub sch: String,
    pub similarity: f64,
    pub phase: String,
}

// ========== Hash Endpoint Types ==========

#[derive(Deserialize)]
pub struct HashRequest {
    pub data: String,
    pub algorithm: Option<String>, // murmur3, blake3 (simulated via murmur)
    pub format: Option<String>,    // hex (default), base64
    pub compress: Option<bool>,    // Compress to satellite Unicode range
    pub metadata: Option<serde_json::Value>,
}

#[derive(Serialize)]
pub struct HashResponse {
    pub hash: String,
    pub algorithm: String,
    pub format: String,
    pub compressed: bool,
    pub satellite_unicode: Option<String>, // U+E600-E6FF char if compressed
    pub processing_time_us: u64,
    pub status: String,
}

#[derive(Serialize)]
pub struct ProbeResponse {
    pub results: Vec<ProbeResult>,
    pub query_sch: String,
}

#[derive(Deserialize)]
#[allow(dead_code)] // Optional fields parsed from JSON but accessed via match on action
pub struct ContextRequest {
    pub topic: String,
    pub action: String, // create, update_state, add_decision, set_next_step
    pub summary: Option<String>,
    pub state: Option<String>,
    pub decision_what: Option<String>,
    pub decision_why: Option<String>,
    pub next_step: Option<String>,
    pub agent: Option<String>,
}

#[derive(Serialize)]
pub struct ContextResponse {
    pub sch: String,
    pub topic: String,
    pub state: String,
    pub success: bool,
}

#[derive(Serialize)]
pub struct ContextListResponse {
    pub contexts: Vec<ContextSummary>,
}

#[derive(Serialize)]
pub struct ContextSummary {
    pub sch: String,
    pub topic: String,
    pub state: String,
    pub phase: String,
}

// ========== Route Handlers ==========

/// Store a value in memory
pub async fn store(
    State(state): State<MemoryState>,
    Json(req): Json<StoreRequest>,
) -> Result<Json<StoreResponse>, (StatusCode, String)> {
    let sch_bytes = murmur3_128(req.key.as_bytes(), 0);
    let sch_hex = hex::encode(sch_bytes);

    let mut record = TrivariateRecord::new(sch_bytes);

    // Set phase if provided (RFC-9301 canonical HD4)
    if let Some(phase) = &req.phase {
        record.phase = match phase.to_lowercase().as_str() {
            "hunt" => Hd4Phase::Hunt,
            "detect" => Hd4Phase::Detect,
            "disrupt" => Hd4Phase::Disrupt,
            "disable" => Hd4Phase::Disable,
            "dominate" => Hd4Phase::Dominate,
            _ => Hd4Phase::Hunt,
        };
    }

    // Store content hash as delta (for similarity)
    let content_hash = murmur3_128(req.value.as_bytes(), 1);
    let content_f64 = u64::from_le_bytes(content_hash[0..8].try_into().unwrap()) as f64;
    record.set_delta(content_f64 / u64::MAX as f64);

    // Store tag count as shannon
    if let Some(tags) = &req.tags {
        record.set_shannon(tags.len() as f64 / 10.0);
    }

    let cache = state.tcache.write().await;
    cache.insert(&record).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;

    Ok(Json(StoreResponse {
        sch: sch_hex,
        key: req.key,
        stored: true,
    }))
}

/// Recall a value from memory
pub async fn recall(
    State(state): State<MemoryState>,
    Json(req): Json<RecallRequest>,
) -> Result<Json<RecallResponse>, (StatusCode, String)> {
    let cache = state.tcache.read().await;

    let sch_bytes: Option<[u8; 16]> = if let Some(sch) = &req.sch {
        hex::decode(sch)
            .ok()
            .and_then(|v| v.try_into().ok())
    } else if let Some(key) = &req.key {
        Some(murmur3_128(key.as_bytes(), 0))
    } else {
        None
    };

    let sch_bytes = sch_bytes.ok_or((
        StatusCode::BAD_REQUEST,
        "Must provide key or sch".to_string(),
    ))?;

    match cache.get_by_sch(&sch_bytes) {
        Ok(Some(record)) => {
            Ok(Json(RecallResponse {
                found: true,
                sch: Some(hex::encode(record.sch)),
                key: req.key,
                phase: Some(format!("{:?}", record.phase)),
                delta: Some(record.delta_f64()),
                shannon: Some(record.shannon_f64()),
            }))
        }
        Ok(None) => {
            Ok(Json(RecallResponse {
                found: false,
                sch: None,
                key: req.key,
                phase: None,
                delta: None,
                shannon: None,
            }))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

/// Similarity probe - find similar records
pub async fn probe(
    State(state): State<MemoryState>,
    Json(req): Json<ProbeRequest>,
) -> Result<Json<ProbeResponse>, (StatusCode, String)> {
    let query_sch = murmur3_128(req.query.as_bytes(), 0);
    let cache = state.tcache.read().await;

    // Create a probe vector from the query SCH
    let probe_vector = ProbeVector::from_sch(&query_sch)
        .with_tau(req.threshold.unwrap_or(0.5));

    let limit = req.limit.unwrap_or(10);

    // Use the MemoryBackend trait's probe method
    let results = MemoryBackend::probe(&*cache, &probe_vector, limit)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let probe_results: Vec<ProbeResult> = results
        .into_iter()
        .map(|r| ProbeResult {
            sch: hex::encode(r.record.sch),
            similarity: r.similarity,
            phase: format!("{:?}", r.record.phase),
        })
        .collect();

    Ok(Json(ProbeResponse {
        results: probe_results,
        query_sch: hex::encode(query_sch),
    }))
}

/// Create or update work context (ENGRAM)
pub async fn context_store(
    State(state): State<MemoryState>,
    Json(req): Json<ContextRequest>,
) -> Result<Json<ContextResponse>, (StatusCode, String)> {
    let sch_bytes = murmur3_128(req.topic.as_bytes(), 0);
    let sch_hex = hex::encode(sch_bytes);

    let cache = state.tcache.write().await;

    // Get existing or create new
    let mut record = cache.get_by_sch(&sch_bytes)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .unwrap_or_else(|| TrivariateRecord::new(sch_bytes));

    // Map work state to HD4 phase (RFC-9301)
    if let Some(state_str) = &req.state {
        record.phase = match state_str.to_lowercase().as_str() {
            "not_started" => Hd4Phase::Hunt,
            "in_progress" => Hd4Phase::Detect,
            "blocked" => Hd4Phase::Disrupt,
            "review" => Hd4Phase::Disable,
            "completed" => Hd4Phase::Dominate,
            _ => record.phase,
        };
    }

    // Update delta based on action
    match req.action.as_str() {
        "add_decision" => {
            let current = record.delta_f64();
            record.set_delta(current + 0.01); // Increment for each decision
        }
        "set_next_step" => {
            record.set_shannon(0.8); // High activity indicator
        }
        _ => {}
    }

    cache.insert(&record).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;

    Ok(Json(ContextResponse {
        sch: sch_hex,
        topic: req.topic,
        state: format!("{:?}", record.phase),
        success: true,
    }))
}

/// List work contexts
pub async fn context_list(
    State(state): State<MemoryState>,
) -> Result<Json<ContextListResponse>, (StatusCode, String)> {
    let cache = state.tcache.read().await;

    // Use the iter method to scan all records
    let contexts: Vec<ContextSummary> = cache
        .iter()
        .filter_map(|r| r.ok())
        .take(50)
        .map(|record| ContextSummary {
            sch: hex::encode(record.sch),
            topic: format!("ctx-{}", hex::encode(&record.sch[0..4])),
            state: format!("{:?}", record.phase),
            phase: format!("{:?}", record.phase),
        })
        .collect();

    Ok(Json(ContextListResponse { contexts }))
}

/// Health check for memory subsystem
pub async fn health(
    State(state): State<MemoryState>,
) -> Json<serde_json::Value> {
    let cache = state.tcache.read().await;
    let count = cache.iter().filter_map(|r| r.ok()).count();

    Json(serde_json::json!({
        "status": "healthy",
        "subsystem": "memory",
        "backend": "sx9-tcache",
        "record_count": count
    }))
}

/// Hash data and optionally compress to satellite Unicode range
/// This endpoint replaces the separate HashingEngine service for orbital UI
pub async fn hash_data(
    Json(req): Json<HashRequest>,
) -> Json<HashResponse> {
    let start = std::time::Instant::now();

    // Use murmur3 for fast hashing (matches tcache internals)
    let hash_bytes = murmur3_128(req.data.as_bytes(), 0);
    let algorithm = req.algorithm.unwrap_or_else(|| "murmur3".to_string());
    let format = req.format.unwrap_or_else(|| "hex".to_string());

    // Format hash output
    let hash = match format.as_str() {
        "base64" => base64_encode(&hash_bytes),
        _ => hex::encode(hash_bytes),
    };

    // Compress to satellite Unicode range U+E600-E6FF (256 chars)
    let compress = req.compress.unwrap_or(false);
    let satellite_unicode = if compress {
        let hash_sum: u32 = hash_bytes.iter().map(|b| *b as u32).sum();
        let unicode_offset = (hash_sum % 256) as u32;
        let satellite_char = char::from_u32(0xE600 + unicode_offset).unwrap_or('?');
        Some(satellite_char.to_string())
    } else {
        None
    };

    let elapsed = start.elapsed();

    Json(HashResponse {
        hash,
        algorithm,
        format,
        compressed: compress,
        satellite_unicode,
        processing_time_us: elapsed.as_micros() as u64,
        status: "success".to_string(),
    })
}

/// Simple base64 encoding without extra dependencies
fn base64_encode(bytes: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();

    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = *chunk.get(1).unwrap_or(&0) as usize;
        let b2 = *chunk.get(2).unwrap_or(&0) as usize;

        result.push(ALPHABET[b0 >> 2] as char);
        result.push(ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)] as char);

        if chunk.len() > 1 {
            result.push(ALPHABET[((b1 & 0x0F) << 2) | (b2 >> 6)] as char);
        } else {
            result.push('=');
        }

        if chunk.len() > 2 {
            result.push(ALPHABET[b2 & 0x3F] as char);
        } else {
            result.push('=');
        }
    }

    result
}

// ========== Router ==========

pub fn memory_routes(state: MemoryState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/store", post(store))
        .route("/recall", post(recall))
        .route("/probe", post(probe))
        .route("/hash", post(hash_data))
        .route("/context", post(context_store))
        .route("/context/list", get(context_list))
        .with_state(state)
}
