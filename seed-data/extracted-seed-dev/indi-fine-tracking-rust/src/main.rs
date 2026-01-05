//! INDI Fine-Tracking Loop (Scaffold)
//! - Connects to INDI server (TCP 7624)
//! - Reads guide camera stream (stub)
//! - Computes centroid (stub unless built with `--features vision`)
//! - Sends mount corrections (RA/DEC rate) at 50-200 Hz (stub)

use anyhow::*;
use tokio::net::TcpStream;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[tokio::main]
async fn main() -> Result<()> {
    let indi_host = std::env::var("INDI_HOST").unwrap_or("127.0.0.1".into());
    let indi_port = std::env::var("INDI_PORT").unwrap_or("7624".into());
    let addr = format!("{indi_host}:{indi_port}");
    println!("Connecting to INDI at {addr}...");
    let mut stream = TcpStream::connect(addr).await?;

    // Minimal handshake (INDI XML protocol). Real implementation will parse/emit XML elements.
    // Send getProperties to enumerate devices
    let get_props = r#"<getProperties version='1.7'/>"#;
    stream.write_all(get_props.as_bytes()).await?;

    let mut buf = vec![0u8; 4096];
    let n = stream.read(&mut buf).await?;
    println!("INDI replied: {} bytes", n);

    // -------- Tracking loop (stub) --------
    // 1) Acquire guide image -> compute centroid (cx, cy)
    // 2) PID -> convert error to RA/DEC rates
    // 3) Send <newNumberVector> with TELESCOPEx_RATE
    // For now, just print placeholder.
    println!("[stub] centroid=(0,0) err=(0,0) rates=(0,0)");

    Ok(())
}
