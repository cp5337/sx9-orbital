import { useEffect, useRef, useState } from 'react';
import { TriangleAlert as AlertTriangle, Bug } from 'lucide-react';
import { RightPanel, LayerConfig, type BeamTuning } from './RightPanel';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import type { Satellite, GroundNode, FsoLink } from '@/types';
import { beamSelectionStore } from '@/store/beamSelectionStore';
import { fetchWeatherForLocation } from '@/services/weatherService';
import { addRadiationBeltsToViewer } from '@/utils/radiationBeltRenderer';
import { OrbitalAnimationManager } from '@/services/orbitalAnimation';
import { DiagnosticPanel } from '@/components/DiagnosticPanel';
import { addOrbitalZonesToViewer, createOrbitPath } from '@/utils/orbitalZones';
import { FsoBeamManager } from '@/utils/fsoBeamRenderer';
import { WebSocketService, type LinkStatePayload } from '@/services/websocketService';
import * as Cesium from 'cesium';

function useHourglassSeries() {
  const [data, setData] = useState(() =>
    Array.from({ length: 60 }, (_, t) => ({
      t,
      p: 0.05 + 0.1 * Math.sin(t / 10),
      H: 0,
    }))
  );

  useEffect(() => {
    const id = setInterval(() => {
      setData((prev) =>
        prev.map((d) => {
          const p = Math.max(
            0.001,
            Math.min(0.499, d.p + (Math.random() - 0.5) * 0.01)
          );
          const H = -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
          return { t: (d.t + 1) % 6000, p, H };
        })
      );
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return data;
}

function getWeatherColor(score: number): string {
  if (score >= 0.8) return '#10b981';
  if (score >= 0.5) return '#f59e0b';
  return '#ef4444';
}

interface OrbitalViewProps {
  satellites: Satellite[];
  groundStations: GroundNode[];
  fsoLinks: FsoLink[];
}

export default function OrbitalView({ satellites, groundStations, fsoLinks }: OrbitalViewProps) {
  const [openModal, setOpenModal] = useState<null | 'network' | 'qkd' | 'hourglass' | 'diagnostics'>(
    null
  );
  const globeRef = useRef<HTMLDivElement | null>(null);
  const groundNodes = groundStations;
  const hourglass = useHourglassSeries();
  const [weatherUpdates, setWeatherUpdates] = useState<Map<string, number>>(new Map());
  const [cesiumError, setCesiumError] = useState<string | null>(null);
  const [initializationStatus, setInitializationStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [diagnosticChecks, setDiagnosticChecks] = useState<any[]>([]);
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);
  const [orbitPathsVisible, setOrbitPathsVisible] = useState(true);
  const [pinnedCards, setPinnedCards] = useState<Array<{
    id: string;
    title: string;
    subtitle?: string;
    rows: Array<{ label: string; value: string }>;
    type: 'satellite' | 'ground' | 'link';
  }>>([]);
  const [cardPositions, setCardPositions] = useState<Record<string, { x: number; y: number }>>({});
  const wsServiceRef = useRef<WebSocketService | null>(null);
  const pickHandlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const dragStateRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const doubleClickLockUntilRef = useRef<number>(0);
  const orbitPathsRef = useRef<Map<string, Cesium.Entity>>(new Map());
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const animationManagerRef = useRef<OrbitalAnimationManager | null>(null);
  const fsoBeamManagerRef = useRef<FsoBeamManager | null>(null);

  const [layers, setLayers] = useState<LayerConfig[]>([
    {
      id: 'groundStations',
      label: 'Ground Stations',
      visible: true,
      color: '#10b981',
      opacity: 1,
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
      visible: true,
      color: '#0ea5e9',
      opacity: 0.5,
    },
    {
      id: 'radiationBelts',
      label: 'Radiation Belts',
      visible: true,
      color: '#dc2626',
      opacity: 0.3,
    },
    {
      id: 'orbitalZones',
      label: 'Orbital Zones',
      visible: true,
      color: '#8b5cf6',
      opacity: 0.2,
    },
    {
      id: 'fsoSatSat',
      label: 'ISL Beams',
      visible: true,
      color: '#22c55e',
      opacity: 0.8,
    },
    {
      id: 'fsoSatGround',
      label: 'Ground Links',
      visible: true,
      color: '#06b6d4',
      opacity: 0.8,
    },
  ]);

  const [timeControl, setTimeControl] = useState({
    isPlaying: true,
    speed: 1,
  });
  const applyLayerVisibility = (viewer: Cesium.Viewer) => {
    const layerVisibility = new Map(layers.map((layer) => [layer.id, layer.visible]));
    viewer.entities.values.forEach((entity) => {
      const layerId = entity.properties?.layerId?.getValue?.(Cesium.JulianDate.now());
      if (layerId && layerVisibility.has(layerId)) {
        entity.show = layerVisibility.get(layerId)!;
      }
    });
  };

  useEffect(() => {
    if (pinnedCards.length === 0) return;
    setCardPositions((prev) => {
      const next = { ...prev };
      const baseX = Math.max(16, window.innerWidth - 360);
      const baseY = 16;
      pinnedCards.forEach((card, index) => {
        if (!next[card.id]) {
          const col = index % 2;
          const row = Math.floor(index / 2);
          next[card.id] = {
            x: baseX - col * 180,
            y: baseY + row * 120,
          };
        }
      });
      return next;
    });
  }, [pinnedCards]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      setCardPositions((prev) => ({
        ...prev,
        [drag.id]: {
          x: drag.originX + deltaX,
          y: drag.originY + deltaY,
        },
      }));
    };

    const handleUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_ORBITAL_WS_URL || 'ws://localhost:18400/stream';
    const wsService = new WebSocketService(wsUrl);
    wsServiceRef.current = wsService;

    const handleMessage = (message: { type: string; data: any }) => {
      if (message.type !== 'link_state') return;
      const payload = message.data as LinkStatePayload;
      if (!payload?.link_id || !payload?.source_id || !payload?.target_id) return;
      fsoBeamManagerRef.current?.upsertLink({
        id: payload.link_id,
        type: payload.link_type,
        sourceId: payload.source_id,
        targetId: payload.target_id,
        linkMargin: payload.margin_db ?? 0,
        wavelength: 1550,
        active: payload.active ?? true,
      });
    };

    wsService.onMessage(handleMessage);
    wsService.connect().catch((error) => {
      console.warn('WebSocket connection failed:', error);
    });

    return () => {
      wsService.offMessage(handleMessage);
      wsService.disconnect();
      wsServiceRef.current = null;
    };
  }, []);


  const [, setBeamTuning] = useState<Record<string, BeamTuning>>({});


  const runDiagnostics = async () => {
    setDiagnosticsRunning(true);
    const checks: any[] = [];

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const cesiumToken = import.meta.env.VITE_CESIUM_TOKEN;

    checks.push({
      name: 'Supabase URL',
      status: supabaseUrl && supabaseUrl !== 'PASTE_YOUR_URL_HERE' ? 'success' : 'error',
      message: supabaseUrl && supabaseUrl !== 'PASTE_YOUR_URL_HERE'
        ? 'Supabase URL is configured'
        : 'Supabase URL is missing or invalid',
    });

    checks.push({
      name: 'Supabase API Key',
      status: supabaseKey && supabaseKey !== 'PASTE_YOUR_KEY_HERE' ? 'success' : 'error',
      message: supabaseKey && supabaseKey !== 'PASTE_YOUR_KEY_HERE'
        ? 'Supabase API key is configured'
        : 'Supabase API key is missing or invalid',
    });

    checks.push({
      name: 'Cesium Token',
      status: cesiumToken && cesiumToken !== 'PASTE_YOUR_TOKEN_HERE' ? 'success' : 'error',
      message: cesiumToken && cesiumToken !== 'PASTE_YOUR_TOKEN_HERE'
        ? 'Cesium token is configured'
        : 'Cesium token is missing',
    });

    checks.push({
      name: 'Ground Nodes Data',
      status: groundNodes.length > 0 ? 'success' : 'warning',
      message: groundNodes.length > 0
        ? `${groundNodes.length} ground nodes loaded`
        : 'No ground nodes found',
    });

    checks.push({
      name: 'Satellites Data',
      status: satellites.length > 0 ? 'success' : 'warning',
      message: satellites.length > 0
        ? `${satellites.length} satellites loaded`
        : 'No satellites found',
    });

    checks.push({
      name: 'Cesium Library',
      status: typeof Cesium !== 'undefined' && Cesium.Ion ? 'success' : 'error',
      message: typeof Cesium !== 'undefined' && Cesium.Ion
        ? 'Cesium library loaded'
        : 'Cesium library not loaded',
    });

    setDiagnosticChecks(checks);
    setDiagnosticsRunning(false);
  };

  useEffect(() => {
    if (groundNodes.length === 0) return;

    const updateWeather = async () => {
      const updates = new Map<string, number>();
      for (const node of groundNodes.slice(0, 10)) {
        try {
          const weather = await fetchWeatherForLocation(
            node.latitude,
            node.longitude
          );
          updates.set(node.id, weather.score);
        } catch (error) {
          console.warn('Weather fetch failed for node:', node.name);
        }
      }
      setWeatherUpdates(updates);
    };

    updateWeather();
    const interval = setInterval(updateWeather, 15 * 60 * 1000);

    return () => clearInterval(interval);
  }, [groundNodes]);

  useEffect(() => {
    if (!globeRef.current) return;
    if (groundNodes.length === 0 && satellites.length === 0) return;

    const cesiumToken = import.meta.env.VITE_CESIUM_TOKEN;
    if (!cesiumToken || cesiumToken === 'PASTE_YOUR_TOKEN_HERE') {
      setCesiumError('Cesium token is missing. Visit https://ion.cesium.com/ to get a free token.');
      setInitializationStatus('error');
      return;
    }

    try {
      const viewer = new Cesium.Viewer(globeRef.current, {
        timeline: false,
        animation: false,
        sceneModePicker: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        navigationHelpButton: false,
        infoBox: false,
        selectionIndicator: false,
      });
      viewerRef.current = viewer;
      setInitializationStatus('ready');
      setCesiumError(null);

      const animationManager = new OrbitalAnimationManager(viewer, (satId, lat, lon, altKm) => {
        fsoBeamManagerRef.current?.setSatellitePosition(satId, lat, lon, altKm);
      });
      animationManager.setExternalPositionMode(true);
      animationManagerRef.current = animationManager;

    groundNodes.forEach((node) => {
      const weatherScore = weatherUpdates.get(node.id) ?? node.weather_score;
      const color = getWeatherColor(weatherScore);
      const displayLabel = node.station_code || node.name.slice(0, 12);

      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(node.longitude, node.latitude),
        point: {
          pixelSize: Math.max(3, 8 - node.tier * 2),
          color: Cesium.Color.fromCssColorString(color),
        },
        label: {
          text: displayLabel,
          font: '10px sans-serif',
          pixelOffset: new Cesium.Cartesian2(0, -12),
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#14171c99'),
          scaleByDistance: new Cesium.NearFarScalar(1.5e6, 1.0, 8e6, 0.4),
        },
        description: `<strong>${node.name}</strong><br/>Tier ${node.tier}<br/>Demand: ${node.demand_gbps.toFixed(
          1
        )} Gbps<br/>Weather: ${(weatherScore * 100).toFixed(0)}%`,
        properties: new Cesium.PropertyBag({
          layerId: 'groundStations',
          entityType: 'ground',
          stationId: node.id,
          name: node.name,
          tier: node.tier,
          weatherScore,
          status: node.status,
        }),
      });

      animationManager.addGroundStation(node.id, node.latitude, node.longitude);
    });

    satellites.forEach((sat) => {
      animationManager.addSatellite(
        sat.id,
        sat.name,
        sat.latitude,
        sat.longitude,
        sat.altitude,
        sat.inclination
      );
    });

    addRadiationBeltsToViewer(viewer, 'radiationBelts');
    addOrbitalZonesToViewer(viewer, 'orbitalZones');

    // Initialize FSO Beam Manager from shared fsoLinks prop
    const fsoManager = new FsoBeamManager(viewer);
    fsoBeamManagerRef.current = fsoManager;

    // Register ground station positions
    groundNodes.forEach((node) => {
      fsoManager.setGroundStationPosition(node.id, node.latitude, node.longitude, 0);
    });

    // Register satellite positions
    satellites.forEach((sat) => {
      fsoManager.setSatellitePosition(sat.id, sat.latitude, sat.longitude, sat.altitude);
    });

    // Initialize links from canonical fsoLinks prop
    fsoLinks.forEach((link) => {
      if (!link.active) return;
      if (link.link_type === 'sat-sat') {
        fsoManager.upsertLink({
          id: link.id,
          type: 'sat-sat',
          sourceId: link.source_id,
          targetId: link.target_id,
          linkMargin: link.margin_db,
          wavelength: 1550,
          active: true,
        });
      } else {
        fsoManager.addSatToGroundLink(link.id, link.source_id, link.target_id, link.margin_db);
      }
    });

    if (orbitPathsVisible) {
      satellites.forEach((sat) => {
        const orbitPath = createOrbitPath(
          viewer,
          sat.id,
          sat.altitude,
          sat.inclination,
          '#00f0ff',
          'orbits'
        );
        orbitPathsRef.current.set(sat.id, orbitPath);
      });
    }

    applyLayerVisibility(viewer);

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    pickHandlerRef.current = handler;
    handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      if (Date.now() < doubleClickLockUntilRef.current) return;
      const picked = viewer.scene.pick(movement.position);
      if (!Cesium.defined(picked) || !picked.id) return;
      const entity = picked.id as Cesium.Entity;
      const props = entity.properties;
      const entityType = props?.entityType?.getValue?.(Cesium.JulianDate.now());
      if (!entityType) return;

      const now = Cesium.JulianDate.now();
      const getProp = (key: string) => props?.[key]?.getValue?.(now);

      let card:
        | {
            id: string;
            title: string;
            subtitle?: string;
            rows: Array<{ label: string; value: string }>;
            type: 'satellite' | 'ground' | 'link';
          }
        | undefined;

      if (entityType === 'satellite') {
        const satId = getProp('satId') ?? entity.id ?? 'sat';
        card = {
          id: `sat-${satId}`,
          title: getProp('name') ?? String(satId),
          subtitle: 'Satellite',
          type: 'satellite',
          rows: [
            { label: 'ID', value: String(satId) },
            { label: 'Status', value: 'active' },
            { label: 'Layer', value: 'satellites' },
            { label: 'Mode', value: 'tracking' },
          ],
        };
      } else if (entityType === 'link') {
        const linkId = getProp('linkId') ?? entity.id ?? 'link';
        card = {
          id: `link-${linkId}`,
          title: String(linkId),
          subtitle: 'Link',
          type: 'link',
          rows: [
            { label: 'Type', value: String(getProp('linkType') ?? 'link') },
            { label: 'Source', value: String(getProp('sourceId') ?? '') },
            { label: 'Target', value: String(getProp('targetId') ?? '') },
            { label: 'Margin', value: `${Number(getProp('marginDb') ?? 0).toFixed(1)} dB` },
          ],
        };
      } else if (entityType === 'ground') {
        const stationId = getProp('stationId') ?? entity.id ?? 'station';
        card = {
          id: `gs-${stationId}`,
          title: String(getProp('name') ?? stationId),
          subtitle: 'Ground Station',
          type: 'ground',
          rows: [
            { label: 'ID', value: String(stationId) },
            { label: 'Tier', value: String(getProp('tier') ?? '1') },
            { label: 'Weather', value: `${Math.round(Number(getProp('weatherScore') ?? 1) * 100)}%` },
            { label: 'Status', value: String(getProp('status') ?? 'active') },
          ],
        };
      }

      if (!card) return;

      setPinnedCards((prev) => {
        const without = prev.filter((item) => item.id !== card.id);
        return [card, ...without].slice(0, 4);
      });
      doubleClickLockUntilRef.current = Date.now() + 350;
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    animationManager.startAnimation();

    if (viewer) {
      viewer.camera.flyHome(0);
    }

      return () => {
        if (pickHandlerRef.current) {
          pickHandlerRef.current.destroy();
          pickHandlerRef.current = null;
        }
        orbitPathsRef.current.forEach((path) => {
          if (viewer && !viewer.isDestroyed()) {
            viewer.entities.remove(path);
          }
        });
        orbitPathsRef.current.clear();

        if (fsoManager) {
          fsoManager.destroy();
        }
        if (animationManager) {
          animationManager.destroy();
        }
        if (viewer && !viewer.isDestroyed()) {
          viewer.destroy();
        }
        viewerRef.current = null;
        animationManagerRef.current = null;
        fsoBeamManagerRef.current = null;
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setCesiumError(`Failed to initialize Cesium viewer: ${errorMessage}`);
      setInitializationStatus('error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Feed position updates from store polling into the animation manager (no viewer rebuild)
  useEffect(() => {
    const manager = animationManagerRef.current;
    if (!manager) return;
    for (const sat of satellites) {
      manager.updatePositionExternal(sat.id, sat.latitude, sat.longitude, sat.altitude);
    }
  }, [satellites]);

  // Update FSO beam manager when links change from store
  useEffect(() => {
    const fsoManager = fsoBeamManagerRef.current;
    if (!fsoManager) return;
    for (const link of fsoLinks) {
      if (!link.active) continue;
      if (link.link_type === 'sat-sat') {
        fsoManager.upsertLink({
          id: link.id,
          type: 'sat-sat',
          sourceId: link.source_id,
          targetId: link.target_id,
          linkMargin: link.margin_db,
          wavelength: 1550,
          active: true,
        });
      }
    }
  }, [fsoLinks]);

  // Camera flyTo when a satellite is selected via the store
  useEffect(() => {
    const unsubscribe = beamSelectionStore.subscribe((state) => {
      const satId = state.selectedSatelliteId;
      if (!satId) return;
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;

      // Find the satellite entity in the viewer
      const entity = viewer.entities.values.find((e) => {
        const props = e.properties;
        const entitySatId = props?.satId?.getValue?.(Cesium.JulianDate.now());
        return entitySatId === satId;
      });

      const onComplete = () => {
        beamSelectionStore.selectSatellite(null);
      };

      if (entity && entity.position) {
        const pos = entity.position.getValue(Cesium.JulianDate.now());
        if (pos) {
          viewer.camera.flyTo({
            destination: pos,
            duration: 1.5,
            complete: onComplete,
          });
        }
      } else {
        // Fallback: find satellite from props and flyTo by coordinates
        const sat = satellites.find((s) => s.id === satId);
        if (sat) {
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(
              sat.longitude,
              sat.latitude,
              sat.altitude * 1000 + 2000000
            ),
            duration: 1.5,
            complete: onComplete,
          });
        }
      }
    });

    return () => { unsubscribe(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satellites]);

  const handleLayerToggle = (layerId: string, visible: boolean) => {
    setLayers((prev) =>
      prev.map((layer) => (layer.id === layerId ? { ...layer, visible } : layer))
    );

    const viewer = viewerRef.current;
    if (viewer) {
      viewer.entities.values.forEach((entity) => {
        const layerValue = entity.properties?.layerId?.getValue?.(Cesium.JulianDate.now());
        if (layerValue === layerId) {
          entity.show = visible;
        }
      });
    }

    if (layerId === 'orbits') {
      setOrbitPathsVisible(visible);
      orbitPathsRef.current.forEach((path) => {
        path.show = visible;
      });
    }

    // Handle FSO layer toggles
    if (layerId === 'fsoSatSat' && fsoBeamManagerRef.current) {
      fsoBeamManagerRef.current.setSatSatLinksVisible(visible);
    }
    if (layerId === 'fsoSatGround' && fsoBeamManagerRef.current) {
      fsoBeamManagerRef.current.setSatGroundLinksVisible(visible);
    }
  };

  const handleLayerOpacityChange = (layerId: string, opacity: number) => {
    setLayers((prev) =>
      prev.map((layer) => (layer.id === layerId ? { ...layer, opacity } : layer))
    );
  };

  const handlePlayPause = () => {
    const manager = animationManagerRef.current;
    if (viewerRef.current) {
      const isCurrentlyPlaying = !viewerRef.current.clock.shouldAnimate;
      viewerRef.current.clock.shouldAnimate = isCurrentlyPlaying;
      if (manager) {
        if (isCurrentlyPlaying) {
          manager.resume();
        } else {
          manager.pause();
        }
      }
      setTimeControl((prev) => ({ ...prev, isPlaying: isCurrentlyPlaying }));
    }
  };

  const handleSpeedChange = (speed: number) => {
    if (viewerRef.current) {
      viewerRef.current.clock.multiplier = speed;
    }
    animationManagerRef.current?.setSpeedMultiplier(speed);
    setTimeControl((prev) => ({ ...prev, speed }));
  };

  const handleReset = () => {
    if (viewerRef.current) {
      viewerRef.current.camera.flyHome(2.0);
      viewerRef.current.clock.shouldAnimate = true;
      viewerRef.current.clock.multiplier = 1;
    }
    const manager = animationManagerRef.current;
    if (manager) {
      manager.setSpeedMultiplier(1);
      manager.resume();
    }
    setTimeControl({ isPlaying: true, speed: 1 });
  };

  const showErrorScreen = initializationStatus === 'error' && cesiumError;
  const showNoDataScreen = groundNodes.length === 0 && satellites.length === 0;
  const showLoadingOverlay = false;

  if (showErrorScreen) {
    return (
      <div className="w-full h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full bg-slate-900 border-red-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6" />
              Initialization Failed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <p className="text-sm font-semibold text-red-300 mb-2">Error:</p>
              <p className="text-sm text-slate-300">{cesiumError}</p>
            </div>


            <div className="flex gap-3">
              <Button onClick={() => window.location.reload()} className="flex items-center gap-2">
                Reload Application
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  runDiagnostics();
                  setOpenModal('diagnostics');
                }}
                className="flex items-center gap-2"
              >
                <Bug className="w-4 h-4" />
                Run Diagnostics
              </Button>
            </div>

            <div className="text-xs text-slate-500 bg-slate-800/50 border border-slate-700 rounded p-3">
              <p className="font-semibold mb-1">Quick Fixes:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Check your .env file has valid VITE_CESIUM_TOKEN</li>
                <li>Visit https://ion.cesium.com/ to get a free Cesium token</li>
                <li>Ensure Supabase credentials are correct</li>
                <li>Run "npm run seed" to populate the database</li>
                <li>Check browser console (F12) for more details</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showNoDataScreen) {
    return (
      <div className="w-full h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full bg-slate-900 border-yellow-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-yellow-400">
              <AlertTriangle className="w-6 h-6" />
              No Data Available
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-slate-300">
              The database is empty. You need to seed it with ground stations and satellites data.
            </p>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <p className="text-sm font-semibold text-slate-300 mb-2">Run this command:</p>
              <code className="text-sm text-cyan-400 bg-slate-900 px-3 py-2 rounded block">
                npm run seed
              </code>
            </div>

            <div className="flex gap-3">
              <Button onClick={() => window.location.reload()} className="flex items-center gap-2">
                Reload After Seeding
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  runDiagnostics();
                  setOpenModal('diagnostics');
                }}
                className="flex items-center gap-2"
              >
                <Bug className="w-4 h-4" />
                Run Diagnostics
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="w-full h-full bg-background text-foreground">
        <div className="w-full h-full relative overflow-hidden">
          <div ref={globeRef} className="absolute inset-0" />

          {pinnedCards.length > 0 && (
            <div className="absolute inset-0 z-20 pointer-events-none">
              {pinnedCards.map((card) => {
                const position = cardPositions[card.id];
                if (!position) return null;
                return (
                  <div
                    key={card.id}
                    className="bg-slate-900/95 border border-slate-700 rounded-sm px-2 py-2 text-[10px] text-slate-200 shadow-lg pointer-events-auto select-none"
                    style={{ position: 'absolute', left: position.x, top: position.y, width: 170 }}
                    onMouseDown={(event) => {
                      dragStateRef.current = {
                        id: card.id,
                        startX: event.clientX,
                        startY: event.clientY,
                        originX: position.x,
                        originY: position.y,
                      };
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold tracking-wide">
                        {card.type === 'satellite' ? 'SAT' : card.type === 'ground' ? 'GND' : 'LNK'} · {card.title}
                      </span>
                      <div className="flex items-center gap-2">
                        {card.subtitle && (
                          <span className="text-[9px] text-slate-400">{card.subtitle}</span>
                        )}
                        <button
                          className="text-[10px] text-slate-400 hover:text-slate-100"
                          onMouseDown={(event) => {
                            event.stopPropagation();
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                            setPinnedCards((prev) => prev.filter((item) => item.id !== card.id));
                            setCardPositions((prev) => {
                              const next = { ...prev };
                              delete next[card.id];
                              return next;
                            });
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono">
                      {card.rows.map((row) => (
                        <div key={`${card.id}-${row.label}`} className="flex justify-between gap-1">
                          <span className="text-slate-400">{row.label}</span>
                          <span className="text-slate-100">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {showLoadingOverlay && (
            <div className="absolute inset-0 bg-slate-950/90 flex items-center justify-center z-10">
              <div className="text-center space-y-3">
                <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-lg font-semibold text-slate-200">Loading globe data...</p>
                <p className="text-sm text-slate-400">Fetching ground stations and satellites</p>
              </div>
            </div>
          )}
        </div>

        <Dialog
          open={openModal === 'network'}
          onOpenChange={(o) => setOpenModal(o ? 'network' : null)}
        >
          <DialogContent className="sm:max-w-[720px] bg-card/95 backdrop-blur border-border">
            <DialogHeader>
              <DialogTitle>Network Routing Snapshot</DialogTitle>
              <DialogDescription>
                Multi-objective A* with weather & Tutte weighting
              </DialogDescription>
            </DialogHeader>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart
                data={Array.from({ length: 60 }, (_, i) => ({
                  t: i,
                  eff: 92 + Math.sin(i / 8) * 5 + Math.random() * 1,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="t" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis
                  domain={[80, 100]}
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <RTooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }}
                />
                <Line type="monotone" dataKey="eff" stroke="hsl(var(--chart-3))" dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <Stat label="Links" value="2,134" />
              <Stat label="PAT jitter" value="0.7 μrad" />
              <Stat label="FEC" value="RS(255,223)" />
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={openModal === 'qkd'}
          onOpenChange={(o) => setOpenModal(o ? 'qkd' : null)}
        >
          <DialogContent className="sm:max-w-[720px] bg-card/95 backdrop-blur border-border">
            <DialogHeader>
              <DialogTitle>QKD / USIM Channel</DialogTitle>
              <DialogDescription>
                BB84 sifting · privacy amplification · AES-GCM
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-muted/30 border-border">
                <CardHeader>
                  <CardTitle>QBER over time</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart
                      data={Array.from({ length: 60 }, (_, i) => ({
                        t: i,
                        q: 2 + 6 * Math.abs(Math.sin(i / 12)) + Math.random(),
                      }))}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                      />
                      <XAxis dataKey="t" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis
                        domain={[0, 12]}
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <RTooltip
                        contentStyle={{
                          background: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          color: 'hsl(var(--foreground))',
                        }}
                      />
                      <Line type="monotone" dataKey="q" stroke="hsl(var(--chart-4))" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="bg-muted/30 border-border">
                <CardHeader>
                  <CardTitle>Key Rate (kbps)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart
                      data={Array.from({ length: 60 }, (_, i) => ({
                        t: i,
                        r: 8 + 6 * Math.sin(i / 9) + Math.random() * 2,
                      }))}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                      />
                      <XAxis dataKey="t" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis
                        domain={[0, 20]}
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <RTooltip
                        contentStyle={{
                          background: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          color: 'hsl(var(--foreground))',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="r"
                        stroke="hsl(var(--primary))"
                        fill="hsl(var(--primary))"
                        fillOpacity={0.2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-3">
              <Stat label="Sifted" value="2,048 bits" />
              <Stat label="PA ratio" value="0.72" />
              <Stat label="Auth tag" value="16 B" />
              <Stat label="USIM hdr" value="48 B" />
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={openModal === 'hourglass'}
          onOpenChange={(o) => setOpenModal(o ? 'hourglass' : null)}
        >
          <DialogContent className="sm:max-w-[720px] bg-card/95 backdrop-blur border-border">
            <DialogHeader>
              <DialogTitle>Bernoulli "Hourglass" Entropy</DialogTitle>
              <DialogDescription>
                p ↦ H(p) = −p log₂ p − (1−p) log₂(1−p)
              </DialogDescription>
            </DialogHeader>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={hourglass}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="t" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis
                  domain={[0, 1]}
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <RTooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }}
                />
                <Line type="monotone" dataKey="H" stroke="#a78bfa" dot={false} />
                <Line type="monotone" dataKey="p" stroke="#f472b6" dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="text-xs text-muted-foreground">
              Max entropy 1 bit occurs at p=0.5. This modal animates p(t) and the
              corresponding H(p).
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={openModal === 'diagnostics'}
          onOpenChange={(o) => {
            if (o) {
              runDiagnostics();
            }
            setOpenModal(o ? 'diagnostics' : null);
          }}
        >
          <DialogContent className="sm:max-w-[800px] bg-card/95 backdrop-blur border-border max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>System Diagnostics</DialogTitle>
              <DialogDescription>
                Comprehensive system health check and configuration validation
              </DialogDescription>
            </DialogHeader>
            {diagnosticsRunning ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center space-y-3">
                  <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm text-slate-400">Running diagnostics...</p>
                </div>
              </div>
            ) : diagnosticChecks.length > 0 ? (
              <DiagnosticPanel checks={diagnosticChecks} />
            ) : (
              <div className="text-center py-8 text-slate-400">
                Click to run diagnostics
              </div>
            )}
          </DialogContent>
        </Dialog>

        <RightPanel
          layers={layers}
          onLayerToggle={handleLayerToggle}
          onLayerOpacityChange={handleLayerOpacityChange}
          satellites={satellites.map((sat) => ({
            id: sat.id,
            name: sat.name,
            status: sat.status,
          }))}
          onBeamTuningChange={(satelliteId, tuning) => {
            setBeamTuning((prev) => ({ ...prev, [satelliteId]: tuning }));
          }}
          timeControl={timeControl}
          onPlayPause={handlePlayPause}
          onSpeedChange={handleSpeedChange}
          onReset={handleReset}
        />
      </div>
    </TooltipProvider>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/30 border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

