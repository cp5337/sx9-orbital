//! NATS Telemetry Publisher
//!
//! Publishes real-time orbital telemetry to NATS subjects:
//! - sx9.orbital.telemetry.{sat_id} - Satellite position/status
//! - sx9.orbital.beam.{beam_id} - Beam activation events
//! - sx9.orbital.weather.{station_id} - Ground station weather
//! - sx9.orbital.link.{link_id} - FSO link quality updates

use anyhow::Result;
use async_nats::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, RwLock};

/// NATS configuration
const NATS_DEFAULT_URL: &str = "nats://127.0.0.1:18020";

/// Telemetry message types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TelemetryEvent {
    SatellitePosition {
        id: String,
        name: String,
        latitude: f64,
        longitude: f64,
        altitude: f64,
        qber: f64,
        jammed: bool,
        timestamp: i64,
    },
    BeamActivation {
        beam_id: String,
        source_id: String,
        target_id: String,
        margin_db: f64,
        active: bool,
        timestamp: i64,
    },
    WeatherUpdate {
        station_id: String,
        weather_score: f64,
        conditions: String,
        timestamp: i64,
    },
    LinkQuality {
        link_id: String,
        throughput_gbps: f64,
        margin_db: f64,
        weather_impact: f64,
        timestamp: i64,
    },
}

/// NATS-based telemetry publisher
pub struct NatsTelemetry {
    client: Option<Client>,
    event_tx: mpsc::Sender<TelemetryEvent>,
    event_rx: Arc<RwLock<mpsc::Receiver<TelemetryEvent>>>,
    connected: Arc<RwLock<bool>>,
}

impl NatsTelemetry {
    /// Create a new telemetry publisher (attempts NATS connection)
    pub async fn new() -> Self {
        let (event_tx, event_rx) = mpsc::channel(1000);
        let connected = Arc::new(RwLock::new(false));

        let nats_url = std::env::var("NATS_URL").unwrap_or_else(|_| NATS_DEFAULT_URL.to_string());

        let client = match async_nats::connect(&nats_url).await {
            Ok(client) => {
                tracing::info!("📡 Connected to NATS at {}", nats_url);
                *connected.write().await = true;
                Some(client)
            }
            Err(e) => {
                tracing::warn!("⚠️  NATS not available: {} (telemetry will queue locally)", e);
                None
            }
        };

        NatsTelemetry {
            client,
            event_tx,
            event_rx: Arc::new(RwLock::new(event_rx)),
            connected,
        }
    }

    /// Get the event sender for publishing telemetry
    pub fn sender(&self) -> mpsc::Sender<TelemetryEvent> {
        self.event_tx.clone()
    }

    /// Check if NATS is connected
    pub async fn is_connected(&self) -> bool {
        *self.connected.read().await
    }

    /// Start the telemetry publishing loop
    pub async fn run(&self) -> Result<()> {
        if let Some(ref client) = self.client {
            loop {
                // Async receive with timeout
                let mut rx = self.event_rx.write().await;
                match tokio::time::timeout(Duration::from_millis(100), rx.recv()).await {
                    Ok(Some(event)) => {
                        drop(rx); // Release lock before async publish
                        let subject = match &event {
                            TelemetryEvent::SatellitePosition { id, .. } => {
                                format!("sx9.orbital.telemetry.{}", id)
                            }
                            TelemetryEvent::BeamActivation { beam_id, .. } => {
                                format!("sx9.orbital.beam.{}", beam_id)
                            }
                            TelemetryEvent::WeatherUpdate { station_id, .. } => {
                                format!("sx9.orbital.weather.{}", station_id)
                            }
                            TelemetryEvent::LinkQuality { link_id, .. } => {
                                format!("sx9.orbital.link.{}", link_id)
                            }
                        };

                        let payload = serde_json::to_vec(&event)?;
                        if let Err(e) = client.publish(subject.clone(), payload.into()).await {
                            tracing::error!("Failed to publish to {}: {}", subject, e);
                        }
                    }
                    Ok(None) => {
                        tracing::warn!("Telemetry channel disconnected");
                        break;
                    }
                    Err(_) => {
                        // Timeout, no events - continue
                    }
                }
            }
        } else {
            tracing::info!("📴 Running in offline mode (NATS not connected)");
            // Just drain the channel to prevent memory buildup
            loop {
                let mut rx = self.event_rx.write().await;
                match tokio::time::timeout(Duration::from_secs(1), rx.recv()).await {
                    Ok(Some(_)) => {} // Discard events
                    Ok(None) => break, // Channel closed
                    Err(_) => {} // Timeout
                }
            }
        }

        Ok(())
    }

    /// Subscribe to a telemetry subject pattern
    pub async fn subscribe(&self, subject: &str) -> Result<Option<async_nats::Subscriber>> {
        if let Some(ref client) = self.client {
            let sub = client.subscribe(subject.to_string()).await?;
            Ok(Some(sub))
        } else {
            Ok(None)
        }
    }
}

/// Convenience function to publish a satellite position update
pub fn publish_satellite_position(
    tx: &mpsc::Sender<TelemetryEvent>,
    id: &str,
    name: &str,
    lat: f64,
    lon: f64,
    alt: f64,
    qber: f64,
    jammed: bool,
) {
    let _ = tx.try_send(TelemetryEvent::SatellitePosition {
        id: id.to_string(),
        name: name.to_string(),
        latitude: lat,
        longitude: lon,
        altitude: alt,
        qber,
        jammed,
        timestamp: chrono::Utc::now().timestamp_millis(),
    });
}

/// Convenience function to publish a beam activation event
pub fn publish_beam_event(
    tx: &mpsc::Sender<TelemetryEvent>,
    beam_id: &str,
    source_id: &str,
    target_id: &str,
    margin_db: f64,
    active: bool,
) {
    let _ = tx.try_send(TelemetryEvent::BeamActivation {
        beam_id: beam_id.to_string(),
        source_id: source_id.to_string(),
        target_id: target_id.to_string(),
        margin_db,
        active,
        timestamp: chrono::Utc::now().timestamp_millis(),
    });
}

/// Convenience function to publish weather update
pub fn publish_weather(
    tx: &mpsc::Sender<TelemetryEvent>,
    station_id: &str,
    weather_score: f64,
    conditions: &str,
) {
    let _ = tx.try_send(TelemetryEvent::WeatherUpdate {
        station_id: station_id.to_string(),
        weather_score,
        conditions: conditions.to_string(),
        timestamp: chrono::Utc::now().timestamp_millis(),
    });
}
