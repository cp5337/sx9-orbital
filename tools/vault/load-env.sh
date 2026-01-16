#!/bin/bash
# Load environment variables for sx9-orbital from main SX9 vault
# Usage: source tools/vault/load-env.sh

# Primary vault location (main sx9 repo)
VAULT_FILE="${VAULT_FILE:-$HOME/Developer/sx9/tools/vault/SX9_API_VAULT.json}"

# Fallback to local vault if exists
if [ ! -f "$VAULT_FILE" ]; then
    VAULT_FILE="$(dirname "$0")/SX9_API_VAULT.json"
fi

if [ ! -f "$VAULT_FILE" ]; then
    echo "ERROR: Vault file not found. Expected at:"
    echo "  - $HOME/Developer/sx9/tools/vault/SX9_API_VAULT.json"
    echo "  - $(dirname "$0")/SX9_API_VAULT.json"
    return 1 2>/dev/null || exit 1
fi

# Cesium/Mapbox/Supabase for orbital UI
export VITE_CESIUM_TOKEN=$(jq -r '.api_keys.cesium_ion.token // empty' "$VAULT_FILE")
export VITE_MAPBOX_TOKEN=$(jq -r '.api_keys.mapbox.api_key' "$VAULT_FILE")
export VITE_SUPABASE_URL=$(jq -r '.database_connections.supabase.url' "$VAULT_FILE")
export VITE_SUPABASE_ANON_KEY=$(jq -r '.database_connections.supabase.anon_key' "$VAULT_FILE")

# Weather API (OpenWeatherMap) - optional
export VITE_WEATHER_API_KEY=$(jq -r '.api_keys.openweathermap.api_key // empty' "$VAULT_FILE")

# Also export non-VITE versions for Rust gateway
export CESIUM_ION_TOKEN="$VITE_CESIUM_TOKEN"
export MAPBOX_TOKEN="$VITE_MAPBOX_TOKEN"
export SUPABASE_URL="$VITE_SUPABASE_URL"
export SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY"
export SUPABASE_SERVICE_KEY=$(jq -r '.database_connections.supabase.service_role_key' "$VAULT_FILE")

# Gateway config
export ORBITAL_GATEWAY_PORT=18601
export ORBITAL_UI_DIST="$HOME/Developer/sx9-orbital/ui/cesium-orbital/dist"

echo "✓ Loaded orbital env from vault"
