/**
 * Infrastructure Map View - Global Data Exchange Visualization
 *
 * Displays submarine cables, cable landing points, and internet exchange points (IXPs)
 * on a flat 2D map using MapLibre GL with high-resolution satellite imagery.
 *
 * Data sources:
 * - Submarine cables: TeleGeography
 * - IXPs: PeeringDB
 * - Cable landing points: submarinecablemap.com
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Map, { Marker, Source, Layer, NavigationControl, MapRef, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

// Infrastructure data types
interface CableLandingPoint {
  id: string;
  name: string;
  country: string | null;
  longitude: number;
  latitude: number;
  cables?: string[];
  cable_count?: number;
}

interface SubmarineCable {
  id: string;
  name: string;
  length?: string;
  landing_points: { id: string; name: string; country: string }[];
  rfs?: string; // Ready for service date
  owners?: string[];
}

interface IXP {
  id: number;
  name: string;
  city: string;
  country: string;
  net_count: number; // Number of networks connected
  fac_count: number; // Number of facilities
  website?: string;
  latitude?: number;
  longitude?: number;
}

interface InfrastructureMapViewProps {
  cableLandingPoints?: CableLandingPoint[];
  submarineCables?: SubmarineCable[];
  ixps?: IXP[];
  groundStations?: Array<{ id: string; name: string; latitude: number; longitude: number; tier: number }>;
}

// Color scheme for infrastructure types
const COLORS = {
  cableLanding: '#F97316', // Orange
  cableLandingMajor: '#EF4444', // Red for major hubs (5+ cables)
  ixpSmall: '#8B5CF6', // Purple - small IXP
  ixpMedium: '#A855F7', // Brighter purple - medium IXP
  ixpLarge: '#C084FC', // Light purple - large IXP
  ixpMega: '#E879F9', // Pink - mega IXP (100+ networks)
  cableLine: '#06B6D4', // Cyan for cable routes
  groundStation: '#10B981', // Green for our ground stations
};

// Major cable landing hubs (5+ cables)
const MAJOR_HUB_THRESHOLD = 5;

// IXP size thresholds
const IXP_SIZE = {
  small: 50,
  medium: 100,
  large: 200,
};

// City coordinates for IXPs (PeeringDB doesn't always include lat/lon)
const CITY_COORDS: Record<string, [number, number]> = {
  'Ashburn': [-77.4875, 39.0438],
  'Chicago': [-87.6298, 41.8781],
  'Dallas': [-96.7970, 32.7767],
  'Los Angeles': [-118.2437, 34.0522],
  'New York': [-74.0060, 40.7128],
  'Miami': [-80.1918, 25.7617],
  'Seattle': [-122.3321, 47.6062],
  'San Jose': [-121.8863, 37.3382],
  'Phoenix': [-112.0740, 33.4484],
  'Denver': [-104.9903, 39.7392],
  'Atlanta': [-84.3880, 33.7490],
  'London': [-0.1276, 51.5074],
  'Amsterdam': [4.9041, 52.3676],
  'Frankfurt': [8.6821, 50.1109],
  'Paris': [2.3522, 48.8566],
  'Singapore': [103.8198, 1.3521],
  'Hong Kong': [114.1694, 22.3193],
  'Tokyo': [139.6917, 35.6895],
  'Sydney': [151.2093, -33.8688],
  'São Paulo': [-46.6333, -23.5505],
  'Mumbai': [72.8777, 19.0760],
  'Dubai': [55.2708, 25.2048],
  'Toronto': [-79.3832, 43.6532],
  'Berlin': [13.4050, 52.5200],
  'Madrid': [-3.7038, 40.4168],
  'Stockholm': [18.0686, 59.3293],
  'Zurich': [8.5417, 47.3769],
  'Vienna': [16.3738, 48.2082],
  'Warsaw': [21.0122, 52.2297],
  'Seoul': [126.9780, 37.5665],
  'Taipei': [121.5654, 25.0330],
  'Jakarta': [106.8456, -6.2088],
  'Bangkok': [100.5018, 13.7563],
  'Manila': [120.9842, 14.5995],
  'Johannesburg': [28.0473, -26.2041],
  'Cairo': [31.2357, 30.0444],
  'Lagos': [3.3792, 6.5244],
  'Nairobi': [36.8219, -1.2921],
  'Moscow': [37.6173, 55.7558],
  'Istanbul': [28.9784, 41.0082],
  'Mexico City': [-99.1332, 19.4326],
  'Buenos Aires': [-58.3816, -34.6037],
  'Santiago': [-70.6693, -33.4489],
  'Lima': [-77.0428, -12.0464],
  'Bogota': [-74.0721, 4.7110],
  'Kuala Lumpur': [101.6869, 3.1390],
  'Auckland': [174.7633, -36.8485],
  'Melbourne': [144.9631, -37.8136],
  'Vancouver': [-123.1216, 49.2827],
  'Montreal': [-73.5673, 45.5017],
};

export function InfrastructureMapView({
  cableLandingPoints = [],
  submarineCables = [],
  ixps = [],
  groundStations = [],
}: InfrastructureMapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 20,
    zoom: 2,
  });

  const [selectedPoint, setSelectedPoint] = useState<{
    type: 'cable' | 'ixp' | 'ground';
    data: CableLandingPoint | IXP | { id: string; name: string; latitude: number; longitude: number; tier: number };
  } | null>(null);

  const [layers, setLayers] = useState({
    cableLandings: true,
    cableRoutes: true,
    ixps: true,
    groundStations: true,
  });

  // Filter IXPs to only those with coordinates (from city lookup)
  const ixpsWithCoords = useMemo(() => {
    return ixps.map(ixp => {
      const coords = CITY_COORDS[ixp.city];
      if (coords) {
        return { ...ixp, longitude: coords[0], latitude: coords[1] };
      }
      return null;
    }).filter((ixp): ixp is IXP & { longitude: number; latitude: number } => ixp !== null);
  }, [ixps]);

  // Build cable routes GeoJSON
  const cableRoutesGeoJson = useMemo((): GeoJSON.FeatureCollection => {
    if (!layers.cableRoutes) return { type: 'FeatureCollection', features: [] };

    const features: GeoJSON.Feature[] = [];
    const landingPointMap = new Map(cableLandingPoints.map(lp => [lp.id, lp]));

    submarineCables.forEach(cable => {
      const points = cable.landing_points
        .map(lp => landingPointMap.get(lp.id))
        .filter((lp): lp is CableLandingPoint => lp !== undefined);

      if (points.length >= 2) {
        // Create line segments between consecutive landing points
        for (let i = 0; i < points.length - 1; i++) {
          const from = points[i];
          const to = points[i + 1];

          // Handle wrap-around at date line
          let fromLon = from.longitude;
          let toLon = to.longitude;

          // If crossing date line, adjust coordinates
          if (Math.abs(fromLon - toLon) > 180) {
            if (fromLon < 0) fromLon += 360;
            else toLon += 360;
          }

          features.push({
            type: 'Feature',
            properties: {
              cableId: cable.id,
              cableName: cable.name,
            },
            geometry: {
              type: 'LineString',
              coordinates: [
                [fromLon > 180 ? fromLon - 360 : fromLon, from.latitude],
                [toLon > 180 ? toLon - 360 : toLon, to.latitude],
              ],
            },
          });
        }
      }
    });

    return { type: 'FeatureCollection', features };
  }, [submarineCables, cableLandingPoints, layers.cableRoutes]);

  // Cable landing points GeoJSON
  const cableLandingsGeoJson = useMemo((): GeoJSON.FeatureCollection => {
    if (!layers.cableLandings) return { type: 'FeatureCollection', features: [] };

    return {
      type: 'FeatureCollection',
      features: cableLandingPoints.map(lp => ({
        type: 'Feature',
        properties: {
          id: lp.id,
          name: lp.name,
          cableCount: lp.cable_count || 0,
          isMajor: (lp.cable_count || 0) >= MAJOR_HUB_THRESHOLD,
        },
        geometry: {
          type: 'Point',
          coordinates: [lp.longitude, lp.latitude],
        },
      })),
    };
  }, [cableLandingPoints, layers.cableLandings]);

  // Stats
  const stats = useMemo(() => ({
    totalCables: submarineCables.length,
    totalLandingPoints: cableLandingPoints.length,
    majorHubs: cableLandingPoints.filter(lp => (lp.cable_count || 0) >= MAJOR_HUB_THRESHOLD).length,
    totalIxps: ixpsWithCoords.length,
    megaIxps: ixpsWithCoords.filter(ixp => ixp.net_count >= IXP_SIZE.large).length,
  }), [submarineCables, cableLandingPoints, ixpsWithCoords]);

  const getIxpColor = (netCount: number) => {
    if (netCount >= IXP_SIZE.large) return COLORS.ixpMega;
    if (netCount >= IXP_SIZE.medium) return COLORS.ixpLarge;
    if (netCount >= IXP_SIZE.small) return COLORS.ixpMedium;
    return COLORS.ixpSmall;
  };

  const getIxpSize = (netCount: number) => {
    if (netCount >= IXP_SIZE.large) return 16;
    if (netCount >= IXP_SIZE.medium) return 12;
    if (netCount >= IXP_SIZE.small) return 10;
    return 8;
  };

  const toggleLayer = useCallback((layer: keyof typeof layers) => {
    setLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  }, []);

  return (
    <div className="w-full h-full flex flex-col bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-900/95 z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-sm font-semibold text-white tracking-wide">
              Global Data Exchange Infrastructure
            </span>
          </div>
        </div>

        {/* Layer toggles */}
        <div className="flex items-center gap-4 text-xs">
          <button
            onClick={() => toggleLayer('cableLandings')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded ${
              layers.cableLandings ? 'bg-orange-900/40 text-orange-300' : 'bg-slate-800 text-slate-500'
            }`}
          >
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.cableLanding }} />
            Cable Landings
          </button>
          <button
            onClick={() => toggleLayer('cableRoutes')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded ${
              layers.cableRoutes ? 'bg-cyan-900/40 text-cyan-300' : 'bg-slate-800 text-slate-500'
            }`}
          >
            <div className="w-2.5 h-0.5" style={{ backgroundColor: COLORS.cableLine }} />
            Cable Routes
          </button>
          <button
            onClick={() => toggleLayer('ixps')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded ${
              layers.ixps ? 'bg-purple-900/40 text-purple-300' : 'bg-slate-800 text-slate-500'
            }`}
          >
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS.ixpMedium }} />
            IXPs
          </button>
          <button
            onClick={() => toggleLayer('groundStations')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded ${
              layers.groundStations ? 'bg-emerald-900/40 text-emerald-300' : 'bg-slate-800 text-slate-500'
            }`}
          >
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.groundStation }} />
            Ground Stations
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <Map
          ref={mapRef}
          {...viewState}
          onMove={evt => setViewState(evt.viewState)}
          style={{ width: '100%', height: '100%' }}
          mapStyle={{
            version: 8,
            name: 'Satellite Dark',
            sources: {
              // ESRI World Imagery (free tier, high quality satellite)
              'esri-satellite': {
                type: 'raster',
                tiles: [
                  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                ],
                tileSize: 256,
                attribution: '&copy; Esri, Maxar, Earthstar Geographics',
                maxzoom: 18,
              },
              // Dark labels overlay
              'carto-labels': {
                type: 'raster',
                tiles: [
                  'https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
                ],
                tileSize: 256,
              },
            },
            layers: [
              {
                id: 'satellite-layer',
                type: 'raster',
                source: 'esri-satellite',
                minzoom: 0,
                maxzoom: 18,
                paint: {
                  'raster-brightness-max': 0.7,
                  'raster-contrast': 0.2,
                  'raster-saturation': -0.3,
                },
              },
              {
                id: 'labels-layer',
                type: 'raster',
                source: 'carto-labels',
                minzoom: 0,
                maxzoom: 19,
              },
            ],
          }}
        >
          <NavigationControl position="top-left" />

          {/* Cable routes */}
          <Source id="cable-routes" type="geojson" data={cableRoutesGeoJson}>
            <Layer
              id="cable-lines"
              type="line"
              paint={{
                'line-color': COLORS.cableLine,
                'line-width': 1.5,
                'line-opacity': 0.6,
              }}
            />
          </Source>

          {/* Cable landing points as circles */}
          <Source id="cable-landings" type="geojson" data={cableLandingsGeoJson}>
            <Layer
              id="cable-landing-circles"
              type="circle"
              paint={{
                'circle-radius': [
                  'case',
                  ['get', 'isMajor'],
                  8,
                  5
                ],
                'circle-color': [
                  'case',
                  ['get', 'isMajor'],
                  COLORS.cableLandingMajor,
                  COLORS.cableLanding
                ],
                'circle-stroke-width': 1.5,
                'circle-stroke-color': '#000',
                'circle-opacity': 0.9,
              }}
            />
          </Source>

          {/* IXPs as markers */}
          {layers.ixps && ixpsWithCoords.map(ixp => (
            <Marker
              key={`ixp-${ixp.id}`}
              longitude={ixp.longitude}
              latitude={ixp.latitude}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelectedPoint({ type: 'ixp', data: ixp });
              }}
            >
              <div
                className="cursor-pointer transition-transform hover:scale-125"
                style={{
                  width: getIxpSize(ixp.net_count),
                  height: getIxpSize(ixp.net_count),
                  backgroundColor: getIxpColor(ixp.net_count),
                  borderRadius: '3px',
                  border: '1.5px solid #000',
                  boxShadow: ixp.net_count >= IXP_SIZE.large ? '0 0 6px rgba(232, 121, 249, 0.6)' : undefined,
                }}
                title={`${ixp.name} (${ixp.net_count} networks)`}
              />
            </Marker>
          ))}

          {/* Ground stations */}
          {layers.groundStations && groundStations.map(gs => (
            <Marker
              key={`gs-${gs.id}`}
              longitude={gs.longitude}
              latitude={gs.latitude}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelectedPoint({ type: 'ground', data: gs });
              }}
            >
              <div
                className="cursor-pointer transition-transform hover:scale-125"
                style={{
                  width: gs.tier === 1 ? 10 : 8,
                  height: gs.tier === 1 ? 10 : 8,
                  backgroundColor: COLORS.groundStation,
                  borderRadius: '50%',
                  border: '1.5px solid #000',
                }}
                title={gs.name}
              />
            </Marker>
          ))}

          {/* Popup for selected point */}
          {selectedPoint && (
            <Popup
              longitude={
                selectedPoint.type === 'ixp'
                  ? (selectedPoint.data as IXP & { longitude: number }).longitude
                  : selectedPoint.type === 'cable'
                  ? (selectedPoint.data as CableLandingPoint).longitude
                  : (selectedPoint.data as { longitude: number }).longitude
              }
              latitude={
                selectedPoint.type === 'ixp'
                  ? (selectedPoint.data as IXP & { latitude: number }).latitude
                  : selectedPoint.type === 'cable'
                  ? (selectedPoint.data as CableLandingPoint).latitude
                  : (selectedPoint.data as { latitude: number }).latitude
              }
              onClose={() => setSelectedPoint(null)}
              closeButton={true}
              closeOnClick={false}
              className="infrastructure-popup"
            >
              <div className="bg-slate-900 text-white p-3 rounded-lg min-w-[200px]">
                {selectedPoint.type === 'ixp' && (
                  <>
                    <div className="text-sm font-semibold text-purple-300">
                      {(selectedPoint.data as IXP).name}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {(selectedPoint.data as IXP).city}, {(selectedPoint.data as IXP).country}
                    </div>
                    <div className="flex gap-4 mt-2 text-xs">
                      <div>
                        <span className="text-slate-500">Networks:</span>{' '}
                        <span className="text-white font-semibold">
                          {(selectedPoint.data as IXP).net_count}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Facilities:</span>{' '}
                        <span className="text-white font-semibold">
                          {(selectedPoint.data as IXP).fac_count}
                        </span>
                      </div>
                    </div>
                  </>
                )}
                {selectedPoint.type === 'cable' && (
                  <>
                    <div className="text-sm font-semibold text-orange-300">
                      {(selectedPoint.data as CableLandingPoint).name}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      Cable Landing Point
                    </div>
                    {(selectedPoint.data as CableLandingPoint).cables && (
                      <div className="mt-2 text-xs">
                        <span className="text-slate-500">Cables ({(selectedPoint.data as CableLandingPoint).cable_count}):</span>
                        <div className="text-cyan-300 mt-1 max-h-24 overflow-y-auto">
                          {(selectedPoint.data as CableLandingPoint).cables?.slice(0, 5).join(', ')}
                          {((selectedPoint.data as CableLandingPoint).cables?.length || 0) > 5 && '...'}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {selectedPoint.type === 'ground' && (
                  <>
                    <div className="text-sm font-semibold text-emerald-300">
                      {(selectedPoint.data as { name: string }).name}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      FSO Ground Station - Tier {(selectedPoint.data as { tier: number }).tier}
                    </div>
                  </>
                )}
              </div>
            </Popup>
          )}
        </Map>
      </div>

      {/* Stats footer */}
      <div className="p-3 bg-slate-900 border-t border-slate-800">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-6">
            <span className="text-slate-400">
              Cables: <span className="text-cyan-300 font-semibold">{stats.totalCables}</span>
            </span>
            <span className="text-slate-400">
              Landing Points: <span className="text-orange-300 font-semibold">{stats.totalLandingPoints}</span>
            </span>
            <span className="text-slate-400">
              Major Hubs: <span className="text-red-400 font-semibold">{stats.majorHubs}</span>
            </span>
            <span className="text-slate-400">
              IXPs: <span className="text-purple-300 font-semibold">{stats.totalIxps}</span>
            </span>
            <span className="text-slate-400">
              Mega IXPs: <span className="text-pink-300 font-semibold">{stats.megaIxps}</span>
            </span>
            {groundStations.length > 0 && (
              <span className="text-slate-400">
                Ground Stations: <span className="text-emerald-300 font-semibold">{groundStations.length}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-[10px] text-slate-600">
            <span>Data: TeleGeography, PeeringDB</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InfrastructureMapView;
