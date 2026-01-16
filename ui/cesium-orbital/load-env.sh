#!/bin/bash
# Load environment variables for cesium-orbital from SX9 vault
# Usage: source load-env.sh

# Source from main vault loader
VAULT_LOADER="${VAULT_LOADER:-$HOME/Developer/sx9-orbital/tools/vault/load-env.sh}"

if [ -f "$VAULT_LOADER" ]; then
    source "$VAULT_LOADER"
else
    echo "ERROR: Vault loader not found at $VAULT_LOADER"
    exit 1
fi

# Create .env file for Vite
cat > .env << EOL
# Generated from SX9 vault - DO NOT COMMIT
VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
VITE_WEATHER_API_KEY=${VITE_WEATHER_API_KEY}
VITE_CESIUM_TOKEN=${VITE_CESIUM_TOKEN}
VITE_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN}
EOL

echo "✓ Created .env from vault"
