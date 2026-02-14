# Ground Station Simulation - Multi-stage build

FROM rust:1.75-bookworm as builder

WORKDIR /build

# Copy workspace
COPY docker/ground-station-sim/Cargo.toml docker/ground-station-sim/
COPY docker/ground-station-sim/src docker/ground-station-sim/src
COPY crates crates

# Build
WORKDIR /build/docker/ground-station-sim
RUN cargo build --release

# Runtime
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/docker/ground-station-sim/target/release/ground-station-sim /usr/local/bin/

ENV RUST_LOG=ground_station_sim=info
ENV NATS_URL=nats://nats:4222

CMD ["ground-station-sim"]
