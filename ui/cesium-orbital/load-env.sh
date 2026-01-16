#!/bin/bash

# Script to load environment variables from a secure location
# This script should be run before starting the development server

# Path to the secure environment file (outside of version control)
SECURE_ENV_FILE="/Users/cp5337/Developer/ctas-7-shipyard-staging/secure-env/ctas7-gis-cesium.env"

# Check if the secure environment file exists
if [ ! -f "$SECURE_ENV_FILE" ]; then
  echo "Error: Secure environment file not found at $SECURE_ENV_FILE"
  echo "Please create this file with your API keys."
  echo "Example format:"
  echo "SUPABASE_URL=https://your-project.supabase.co"
  echo "SUPABASE_ANON_KEY=your-anon-key"
  echo "WEATHER_API_KEY=your-weather-api-key"
  echo "CESIUM_TOKEN=your-cesium-token"
  echo "MAPBOX_TOKEN=your-mapbox-token"
  exit 1
fi

# Load the secure environment variables
source "$SECURE_ENV_FILE"

# Create or update the .env file with the loaded variables
cat > .env << EOL
# Supabase Configuration
VITE_SUPABASE_URL=${SUPABASE_URL}
VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}

# Weather API Configuration
VITE_WEATHER_API_KEY=${WEATHER_API_KEY}

# Cesium Configuration
VITE_CESIUM_TOKEN=${CESIUM_TOKEN}

# Mapbox Configuration
VITE_MAPBOX_TOKEN=${MAPBOX_TOKEN}
EOL

echo "Environment variables loaded successfully from secure location."
echo "You can now start the development server."