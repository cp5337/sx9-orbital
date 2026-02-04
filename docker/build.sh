#!/bin/bash
# build.sh - Build SX9 Orbital Docker images
# Prepares dependencies and builds all containers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SX9_DIR="$(dirname "$PROJECT_DIR")/sx9"

echo "=== SX9 Orbital Docker Build ==="
echo "Project: $PROJECT_DIR"
echo "SX9 Source: $SX9_DIR"

# Check if sx9 exists
if [ ! -d "$SX9_DIR" ]; then
    echo "ERROR: sx9 directory not found at $SX9_DIR"
    echo "The orbital-gateway depends on sx9-tcache from the main sx9 repo."
    exit 1
fi

# Create sx9-deps directory for Docker context
echo "Preparing sx9 dependencies..."
mkdir -p "$PROJECT_DIR/sx9-deps"

# Copy required sx9 crates
cp -r "$SX9_DIR/crates/sx9-tcache" "$PROJECT_DIR/sx9-deps/"
cp -r "$SX9_DIR/crates/sx9-foundation-trace" "$PROJECT_DIR/sx9-deps/"

echo "Copied sx9-tcache and sx9-foundation-trace"

# Update gateway Cargo.toml to use local paths (Docker context)
echo "Updating gateway dependency paths for Docker build..."
GATEWAY_CARGO="$PROJECT_DIR/gateway/Cargo.toml"

# Create backup
cp "$GATEWAY_CARGO" "$GATEWAY_CARGO.bak"

# Update path to sx9-deps (for Docker build)
sed -i.tmp 's|path = "../../sx9/crates/sx9-tcache"|path = "../sx9-deps/sx9-tcache"|g' "$GATEWAY_CARGO"
rm -f "$GATEWAY_CARGO.tmp"

echo "Building Docker images..."
cd "$PROJECT_DIR"
docker compose -f docker/docker-compose.yml build gateway

# Restore original Cargo.toml
echo "Restoring original Cargo.toml..."
mv "$GATEWAY_CARGO.bak" "$GATEWAY_CARGO"

echo "=== Build Complete ==="
echo "Run 'docker compose -f docker/docker-compose.yml up -d' to start services"
