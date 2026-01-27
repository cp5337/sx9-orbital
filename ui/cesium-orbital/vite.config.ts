import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import path from 'path'

// @ts-ignore - vite-plugin-cesium-build has TypeScript export issues
import cesiumPlugin from 'vite-plugin-cesium-build'

export default defineConfig({
  plugins: [
    react(),
    cesiumPlugin({
      // Use IIFE mode to externalize Cesium and avoid ESM compatibility issues
      iife: true,
    }),
    wasm(),
    topLevelAwait()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    // Port 18800 per sx9/config/ports.toml (UI dev servers range)
    port: 18800,
    strictPort: false, // Allow fallback if port in use
  }
})
