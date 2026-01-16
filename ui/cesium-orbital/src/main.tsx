import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Cesium from 'cesium';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import 'cesium/Build/Cesium/Widgets/widgets.css';

const cesiumToken = import.meta.env.VITE_CESIUM_TOKEN;

if (!cesiumToken || cesiumToken === 'PASTE_YOUR_TOKEN_HERE') {
  console.error('❌ CESIUM TOKEN MISSING!');
  console.error('');
  console.error('To fix the black screen:');
  console.error('1. Visit https://ion.cesium.com/ and sign up (free)');
  console.error('2. Copy your access token from the dashboard');
  console.error('3. Add to .env file: VITE_CESIUM_TOKEN=your_token_here');
  console.error('4. Restart the dev server');
  console.error('');
} else {
  Cesium.Ion.defaultAccessToken = cesiumToken;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
