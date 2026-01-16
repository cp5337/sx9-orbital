import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { AlertTriangle } from 'lucide-react';
import { LeftPanel } from './LeftPanel';
import { RightPanel, LayerConfig } from './RightPanel';
import {
  CesiumWorldManager,
  WorldType,
} from '@/services/cesiumWorldManager';
import { WebSocketService, InitialDataPayload } from '@/services/websocketService';

export function CesiumWorldView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const worldManagerRef = useRef<CesiumWorldManager | null>(null);
  const wsServiceRef = useRef<WebSocketService | null>(null);

  const [currentWorld, setCurrentWorld] = useState<WorldType>('production');
  const [initError, setInitError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);

  const [stats, setStats] = useState({
    groundStations: 0,
    satellites: 0,
    activeLinks: 0,
  });

  const [layers, setLayers] = useState<LayerConfig[]>([
    {
      id: 'groundStations',
      label: 'Ground Stations',
      visible: true,
      color: '#10b981',
      opacity: 1,
      children: [
        { id: 'groundStations-online', label: 'Online', visible: true, color: '#10b981', opacity: 1 },
        { id: 'groundStations-offline', label: 'Offline', visible: true, color: '#ef4444', opacity: 1 },
      ],
    },
    {
      id: 'satellites',
      label: 'Satellites',
      visible: true,
      color: '#06b6d4',
      opacity: 1,
    },
    {
      id: 'orbits',
      label: 'Orbital Paths',
      visible: false,
      color: '#0ea5e9',
      opacity: 0.5,
    },
    {
      id: 'activeLinks',
      label: 'Network Links',
      visible: true,
      color: '#06b6d4',
      opacity: 0.5,
      children: [
        { id: 'activeLinks-active', label: 'Active', visible: true, color: '#06b6d4', opacity: 0.5 },
        { id: 'activeLinks-degraded', label: 'Degraded', visible: true, color: '#f59e0b', opacity: 0.3 },
      ],
    },
  ]);

  const [timeControl, setTimeControl] = useState({
    isPlaying: false,
    speed: 1,
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const cesiumToken = import.meta.env.VITE_CESIUM_TOKEN;
    if (!cesiumToken || cesiumToken === 'PASTE_YOUR_TOKEN_HERE') {
      setInitError('Cesium token is missing. Visit https://ion.cesium.com/ to get a free token.');
      setIsLoading(false);
      return;
    }

    Cesium.Ion.defaultAccessToken = cesiumToken;

    try {
      const viewer = new Cesium.Viewer(containerRef.current, {
        timeline: false,
        animation: false,
        sceneModePicker: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: true,
        selectionIndicator: true,
      });

      viewerRef.current = viewer;

      const worldManager = new CesiumWorldManager(viewer);
      worldManagerRef.current = worldManager;

      const eventBus = worldManager.getEventBus();
      eventBus.addEventListener('entity-selected', ((e: CustomEvent) => {
        console.log('Entity selected:', e.detail);
      }) as EventListener);

      const wsService = new WebSocketService('ws://localhost:18400/stream');
      wsServiceRef.current = wsService;

      wsService.onMessage((message) => {
        if (message.type === 'initial_data') {
          const data = message.data as InitialDataPayload;

          data.ground_stations.forEach((station) => {
            worldManager.addGroundStation('production', station);
          });

          data.satellites.forEach((satellite) => {
            worldManager.addSatellite('production', satellite);
          });

          data.network_links?.forEach((link) => {
            worldManager.addNetworkLink('production', link);
          });

          setStats({
            groundStations: data.ground_stations.length,
            satellites: data.satellites.length,
            activeLinks: data.network_links?.length || 0,
          });

          setIsLoading(false);
        } else if (message.type === 'status_update') {
          console.log('Status update:', message.data);
        }
      });

      wsService
        .connect()
        .then(() => {
          setWsConnected(true);
          console.log('WebSocket connected successfully');
        })
        .catch((error) => {
          console.error('WebSocket connection failed:', error);
          setWsConnected(false);
          setIsLoading(false);
        });

      setInitError(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setInitError(`Failed to initialize Cesium: ${errorMessage}`);
      setIsLoading(false);
    }

    return () => {
      if (wsServiceRef.current) {
        wsServiceRef.current.disconnect();
      }
      if (worldManagerRef.current) {
        worldManagerRef.current.destroy();
      }
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
      }
    };
  }, []);

  const handleWorldChange = (world: WorldType) => {
    if (worldManagerRef.current) {
      worldManagerRef.current.switchWorld(world);
      setCurrentWorld(world);
    }
  };

  const handleLayerToggle = (layerId: string, visible: boolean) => {
    setLayers((prev) =>
      prev.map((layer) => {
        if (layer.id === layerId) {
          return { ...layer, visible };
        }
        if (layer.children) {
          return {
            ...layer,
            children: layer.children.map((child) =>
              child.id === layerId ? { ...child, visible } : child
            ),
          };
        }
        return layer;
      })
    );

    if (worldManagerRef.current) {
      worldManagerRef.current.setLayerVisibility(layerId, visible);
    }
  };

  const handleLayerOpacityChange = (layerId: string, opacity: number) => {
    setLayers((prev) =>
      prev.map((layer) => (layer.id === layerId ? { ...layer, opacity } : layer))
    );

    if (worldManagerRef.current) {
      worldManagerRef.current.setLayerOpacity(layerId, opacity);
    }
  };

  const handlePlayPause = () => {
    if (viewerRef.current) {
      const viewer = viewerRef.current;
      const isCurrentlyPlaying = !viewer.clock.shouldAnimate;

      viewer.clock.shouldAnimate = isCurrentlyPlaying;

      setTimeControl((prev) => ({
        ...prev,
        isPlaying: isCurrentlyPlaying,
      }));
    }
  };

  const handleSpeedChange = (speed: number) => {
    if (viewerRef.current) {
      viewerRef.current.clock.multiplier = speed;
      setTimeControl((prev) => ({
        ...prev,
        speed,
      }));
    }
  };

  const handleReset = () => {
    if (viewerRef.current) {
      viewerRef.current.camera.flyHome(2.0);
      viewerRef.current.clock.multiplier = 1;
      setTimeControl({
        isPlaying: false,
        speed: 1,
      });
    }
  };

  if (initError) {
    return (
      <div className="w-full h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full bg-slate-900 border-red-900 p-6">
          <div className="flex items-center gap-3 text-red-400 mb-4">
            <AlertTriangle className="w-6 h-6" />
            <h2 className="text-xl font-bold">Initialization Failed</h2>
          </div>
          <p className="text-slate-300 mb-4">{initError}</p>
          <Button onClick={() => window.location.reload()}>Reload Application</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-slate-950">
      <LeftPanel
        currentWorld={currentWorld}
        onWorldChange={handleWorldChange}
        stats={stats}
      />

      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ marginLeft: '280px', marginRight: '320px' }}
      />

      {isLoading && (
        <div className="absolute inset-0 bg-slate-950/90 flex items-center justify-center z-50">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-lg font-semibold text-slate-200">
              {wsConnected ? 'Loading entities...' : 'Connecting to backend...'}
            </p>
            <p className="text-sm text-slate-400">Initializing Cesium viewer and WebSocket connection</p>
          </div>
        </div>
      )}

      {!wsConnected && !isLoading && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50">
          <Card className="bg-yellow-900/90 border-yellow-600 p-4">
            <div className="flex items-center gap-2 text-yellow-200">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-semibold">WebSocket disconnected. Attempting to reconnect...</span>
            </div>
          </Card>
        </div>
      )}

      <RightPanel
        layers={layers}
        onLayerToggle={handleLayerToggle}
        onLayerOpacityChange={handleLayerOpacityChange}
        timeControl={timeControl}
        onPlayPause={handlePlayPause}
        onSpeedChange={handleSpeedChange}
        onReset={handleReset}
      />
    </div>
  );
}
