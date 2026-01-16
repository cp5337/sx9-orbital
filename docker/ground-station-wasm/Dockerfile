# Ground Station WASM Runtime
# Runs wasmtime with the ground-station WASM module
# Each container is assigned a GIS location via env vars

FROM rust:1.75-slim as builder

WORKDIR /build

# Install wasm target
RUN rustup target add wasm32-unknown-unknown

# Copy and build the WASM crate
COPY crates/ground-station-wasm/ ./crates/ground-station-wasm/
COPY crates/orbital-mechanics/ ./crates/orbital-mechanics/

WORKDIR /build/crates/ground-station-wasm
RUN cargo build --release --target wasm32-unknown-unknown

# Runtime image with wasmtime
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install wasmtime
RUN curl https://wasmtime.dev/install.sh -sSf | bash
ENV PATH="/root/.wasmtime/bin:${PATH}"

WORKDIR /app

# Copy the compiled WASM
COPY --from=builder /build/crates/ground-station-wasm/target/wasm32-unknown-unknown/release/ground_station_wasm.wasm /app/

# Copy the host runtime (Rust binary that loads WASM)
COPY docker/ground-station-wasm/runtime/ /app/runtime/

# Ground station identity (set via docker-compose)
ENV GS_ID=""
ENV GS_NAME=""
ENV GS_LAT="0.0"
ENV GS_LON="0.0"
ENV GS_ALT_M="0.0"
ENV NATS_URL="nats://nats:4222"

# Ports
# 8080 = HTTP API
# 8081 = WebSocket for real-time tracking
EXPOSE 8080 8081

CMD ["./runtime/gs-runtime", "--wasm", "/app/ground_station_wasm.wasm"]
