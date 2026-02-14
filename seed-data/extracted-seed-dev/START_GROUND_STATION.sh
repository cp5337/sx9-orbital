#!/usr/bin/env bash
# CTAS Optical Ground Station - Startup Script
# Brings all ground station components online

set -e

echo "🛰️  CTAS Optical Ground Station - Startup"
echo "=========================================="

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Starting OrbStack..."
    open -a OrbStack
    echo "⏳ Waiting for Docker daemon..."
    sleep 5
fi

# Start Docker services (YAMCS, PostgreSQL, Orekit)
echo ""
echo "🐳 Starting Docker services..."
docker compose -f docker-compose.dev.yml up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to start..."
sleep 5

# Check service status
echo ""
echo "📊 Service Status:"
echo "==================" 
docker compose -f docker-compose.dev.yml ps

# Test endpoints
echo ""
echo "🔍 Testing Endpoints:"
echo "====================="

# Orekit
OREKIT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8088/health || echo "000")
if [ "$OREKIT_STATUS" = "200" ]; then
    echo "✅ Orekit Service: http://localhost:8088 (OK)"
else
    echo "⚠️  Orekit Service: http://localhost:8088 (Status: $OREKIT_STATUS)"
fi

# PostgreSQL
if docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U yamcs > /dev/null 2>&1; then
    echo "✅ PostgreSQL: localhost:5432 (OK)"
else
    echo "⚠️  PostgreSQL: localhost:5432 (Not Ready)"
fi

# YAMCS (has known issues with librespace image)
YAMCS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8090 || echo "000")
if [ "$YAMCS_STATUS" = "200" ]; then
    echo "✅ YAMCS: http://localhost:8090 (OK)"
else
    echo "⚠️  YAMCS: http://localhost:8090 (Status: $YAMCS_STATUS - Known Issue)"
fi

echo ""
echo "📋 Port Allocations:"
echo "===================="
echo "  8088 - Orekit Service (REST API)"
echo "  8090 - YAMCS Mission Control (Web UI)"
echo "  5432 - PostgreSQL (YAMCS Backend)"
echo "  7624 - INDI Server (External - Not Started)"
echo ""
echo "🦀 Rust Components:"
echo "==================="
echo "  ccsds142-harness    - cargo run --package ccsds142-harness"
echo "  indi-fine-tracking  - INDI_HOST=127.0.0.1 INDI_PORT=7624 cargo run --package indi-fine-tracking"
echo ""
echo "✨ Ground Station Ready!"
echo ""
echo "📖 Quick Commands:"
echo "  View logs:  docker compose -f docker-compose.dev.yml logs -f"
echo "  Stop all:   docker compose -f docker-compose.dev.yml down"
echo "  Orekit API: curl http://localhost:8088/health"
